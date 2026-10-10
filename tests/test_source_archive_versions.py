"""Independent version metadata verification on real producer ZIP extractions."""
from copy import deepcopy
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import test_source_archive_paths as paths

ROOT, pack, verifier = paths.ROOT, paths.pack, paths.verifier
MODES = [([], None), (['-O'], None), (['-OO'], None), ([], '1'), ([], '2')]


class SourceArchiveVersionTests(unittest.TestCase):
    @staticmethod
    def payloads():
        documents = {
            'package.json': {'version': '0.7.2'},
            'schemas/camel.schema.json': {'$id': 'urn:fixture:camel', '$schema': 'https://json-schema.org/draft/2020-12/schema',
                                         'properties': {'schemaVersion': {'const': '2.1'}}},
            'production/schema/snake.schema.json': {'properties': {'schema_version': {'const': '3.0'}}},
            'schemas/optional.schema.json': {},
            'schemas/precedence.schema.json': {'properties': {'schemaVersion': {}, 'schema_version': {'const': 'ignored'}}},
            'chapters/one/chapter.json': {'schemaVersion': '1.0', 'contentVersion': '2.3'},
            'chapters/two/chapter.json': {'schemaVersion': '1.1', 'contentVersion': '4.5'},
        }
        return {name: json.dumps(value).encode() for name, value in documents.items()}

    @staticmethod
    def command(root, flags, optimization):
        env = {key: value for key, value in os.environ.items() if key != 'PYTHONOPTIMIZE'}
        env['PYTHONDONTWRITEBYTECODE'] = '1'
        if optimization:
            env['PYTHONOPTIMIZE'] = optimization
        return subprocess.run([sys.executable, *flags, str(ROOT / 'production/verify_source_archive.py'), str(root)],
                              env=env, capture_output=True, text=True, timeout=15)

    def test_independent_extraction_matches_producer_optional_fields_and_precedence(self):
        payloads = self.payloads()
        expected = pack.source_versions(payloads)
        self.assertEqual(verifier.source_versions(payloads), expected)
        self.assertIsNone(expected['schemas']['schemas/optional.schema.json']['id'])
        self.assertIsNone(expected['schemas']['schemas/optional.schema.json']['dialect'])
        self.assertIsNone(expected['schemas']['schemas/optional.schema.json']['data_version'])
        self.assertIsNone(expected['schemas']['schemas/precedence.schema.json']['data_version'])
        self.assertEqual(expected['schemas']['production/schema/snake.schema.json']['data_version'], '3.0')

    def test_real_archive_missing_altered_and_extra_version_keys_fail_all_modes(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary); checkout = base / 'checkout'; checkout.mkdir()
            paths.SourceArchivePathTests.checkout(checkout)
            for name, data in self.payloads().items():
                target = checkout / name; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
            result = subprocess.run([sys.executable, str(checkout / 'production/pack_source.py'), '--public'],
                                    capture_output=True, text=True, timeout=15)
            self.assertEqual(result.returncode, 0, result.stderr)
            with zipfile.ZipFile(checkout / 'production/output/game_theory_studio_public_source.zip') as archive:
                self.assertIsNone(archive.testzip())
                archive.extractall(base / 'extracted')
            root = base / 'extracted/game-theory-studio'
            target = root / 'SOURCE_MANIFEST.json'
            original = json.loads(target.read_text())
            before = {path.relative_to(root): path.read_bytes() for path in root.rglob('*') if path.is_file()}
            for flags, optimization in MODES:
                result = self.command(root, flags, optimization)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn('Archive integrity verified', result.stdout)
            self.assertEqual(before, {path.relative_to(root): path.read_bytes() for path in root.rglob('*') if path.is_file()})

            # Exercise every dictionary level and leaf, not only top-level versions.
            def mutations(value, trail=('versions',)):
                for key, child in value.items():
                    yield trail + (key,), 'missing'
                    yield trail + (key,), 'altered'
                    if isinstance(child, dict):
                        yield from mutations(child, trail + (key,))
                yield trail + ('unexpected-version-key',), 'extra'
            cases = [(('versions',), 'missing'), (('versions',), 'altered'), *mutations(original['versions'])]
            for trail, kind in cases:
                changed = deepcopy(original); node = changed
                for key in trail[:-1]: node = node[key]
                if kind == 'missing': del node[trail[-1]]
                else: node[trail[-1]] = 'do-not-echo-version-value'
                target.write_text(json.dumps(changed))
                for flags, optimization in MODES:
                    with self.subTest(trail=trail, kind=kind, flags=flags, optimization=optimization):
                        result = self.command(root, flags, optimization)
                        self.assertNotEqual(result.returncode, 0)
                        self.assertIn('Archive versions differ from source', result.stderr)
                        self.assertNotIn('Traceback', result.stderr)
                        self.assertNotIn('do-not-echo-version-value', result.stdout + result.stderr)
                with patch.object(verifier.importlib.util, 'spec_from_file_location') as imported:
                    with self.assertRaisesRegex(verifier.ArchiveValidationError, 'versions differ'):
                        verifier.verify_archive(root)
                    imported.assert_not_called()

    def test_version_payload_capture_uses_only_the_bounded_verified_read(self):
        data = b'{"version": "0.1.0"}' + b' ' * (65536 + 1)
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / 'package.json'
            target.write_bytes(data)
            original_open = Path.open
            reads = []
            class CheckedStream:
                def __enter__(self):
                    self.stream = original_open(target, 'rb')
                    return self
                def __exit__(self, *args): self.stream.close()
                def read(self, size=-1):
                    if not 0 < size <= verifier.HASH_CHUNK_BYTES:
                        raise AssertionError('unbounded captured source read')
                    reads.append(size)
                    return self.stream.read(size)
            with patch.object(Path, 'open', return_value=CheckedStream()) as opened:
                captured = verifier.verify_source_bytes(target, len(data), hashlib.sha256(data).hexdigest(), capture=True)
                opened.assert_called_once_with('rb')
            self.assertEqual(captured, data)
            self.assertTrue(reads)
            target.write_bytes(b'{"version": "changed-after-validation"}')
            self.assertEqual(verifier.source_versions({'package.json': captured})['project'], '0.1.0')

    def test_many_schema_sources_do_not_accumulate_captured_bytes(self):
        # A tiny real archive plus tracked bytes detects aggregate retention
        # without allocating an attacker-sized archive or relying on RSS noise.
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            payloads = {'package.json': b'{"version": "0.1.0"}'}
            payloads.update({f'schemas/{index}.schema.json': b'{"padding": "' + b'x' * 4096 + b'"}'
                             for index in range(32)})
            manifest = {
                'manifest_schema_version': '1.0', 'distribution': 'public_source_original_svg_only',
                'font_binaries_included': False, 'character_art_included': False,
                'source': {'commit': None, 'working_tree_dirty': True, 'reproducible_from_commit': False},
                'versions': pack.source_versions(payloads),
                'files': [{'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
                          for name, data in payloads.items()],
            }
            for name, data in payloads.items():
                path = root / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(data)
            (root / 'SOURCE_MANIFEST.json').write_text(json.dumps(manifest))
            live = captures = 0
            class TrackedBytes(bytes):
                def __new__(cls, value):
                    nonlocal live
                    live += 1
                    return super().__new__(cls, value)
                def __del__(self):
                    nonlocal live
                    live -= 1
            original = verifier.verify_source_bytes
            def capture(*args, **kwargs):
                nonlocal captures
                self.assertEqual(live, 0, 'previous source payload retained while opening the next')
                result = original(*args, **kwargs)
                if kwargs.get('capture'):
                    captures += 1
                    return TrackedBytes(result)
                return result
            with patch.object(verifier, 'verify_source_bytes', side_effect=capture):
                verifier.verify_archive(root)
            self.assertEqual(captures, len(payloads))
            self.assertEqual(live, 0)
            retained = []
            original_consume = verifier.VersionChecks.consume
            def aggregate(checks, name, data):
                retained.append(data)
                original_consume(checks, name, data)
            with patch.object(verifier, 'verify_source_bytes', side_effect=capture), \
                 patch.object(verifier.VersionChecks, 'consume', aggregate):
                with self.assertRaisesRegex(AssertionError, 'previous source payload retained'):
                    verifier.verify_archive(root)
            retained.clear()

    def test_streaming_chapter_checks_keep_producer_sorted_last_identity(self):
        payloads = {'package.json': b'{"version": "0.1.0"}',
                    'chapters/one/chapter.json': b'{"schemaVersion": "1", "contentVersion": "first"}',
                    'chapters/one/nested/chapter.json': b'{"schemaVersion": "2", "contentVersion": "last"}'}
        for names in [sorted(payloads), sorted(payloads, reverse=True)]:
            checks = verifier.VersionChecks(pack.source_versions(payloads))
            for name in names:
                checks.consume(name, payloads[name])
            checks.finish()

    def test_exact_json_comparison_rejects_boolean_number_aliases(self):
        self.assertFalse(verifier.same_json({'version': True}, {'version': 1}))
        self.assertFalse(verifier.same_json({'version': 1.0}, {'version': 1}))
        self.assertFalse(verifier.same_json({'version': []}, {'version': {}}))

    def test_malformed_or_missing_version_sources_have_sanitized_errors(self):
        for data in [b'[]', b'null', b'{}', b'{invalid-secret-fixture', b'\xff']:
            with self.subTest(data=data), self.assertRaisesRegex(verifier.ArchiveValidationError, '^Invalid archive version source$'):
                verifier.source_versions({'package.json': data})
        with self.assertRaisesRegex(verifier.ArchiveValidationError, '^Invalid archive version source$'):
            verifier.source_versions({})


if __name__ == '__main__':
    unittest.main()
