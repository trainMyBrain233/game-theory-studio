"""ZIP entry-name safety, without extracting unsafe entries or loading renderers."""
from pathlib import Path
import hashlib
import importlib.util
import io
import json
import ntpath
import os
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pack = load_module('archive_path_writer', ROOT / 'production/pack_source.py')
verifier = load_module('archive_path_verifier', ROOT / 'production/verify_source_archive.py')


def unsafe_names():
    backslash = chr(92)
    return [backslash.join(['..', '..', 'escape.txt']), backslash.join(['nested', 'source.txt']),
            'Q:' + '/source.txt', 'Q:' + backslash + 'source.txt', 'Q:relative.txt',
            backslash * 2 + backslash.join(['source-host', 'share', 'source.txt']),
            '/source.txt', '//source-host/share/source.txt', '../source.txt', 'a/../source.txt',
            './source.txt', 'a/./source.txt', 'a//source.txt', 'a/', '', '.', '..',
            'source.txt:stream', 'source.txt.', 'source.txt ', 'a./source.txt', 'a /source.txt',
            'a/.. /source.txt', 'a/.. ./source.txt', 'SOURCE_MANIFEST.json',
            'source' + chr(0) + '.txt', 'source' + chr(9) + '.txt',
            'source' + chr(10) + '.txt', 'source' + chr(27) + '.txt',
            *['source' + char + '.txt' for char in '<>\"|?*'],
            'source_manifest.JSON', 'SOURCE_MANIFEST.json/source.txt',
            backslash * 2 + '?' + backslash + 'Q:' + backslash + 'source.txt',
            backslash * 2 + '?' + backslash + backslash.join(['UNC', 'host', 'share']),
            *[prefix + name + suffix for name in ['CON', 'NUL', 'AUX', 'PRN', 'conin$', 'CONOUT$',
                                                 'com1', 'COM9', 'lpt1', 'LPT9', 'COM¹', 'LPT²', 'COM³']
              for prefix in ['', 'nested/'] for suffix in ['', '.txt', ' .txt']]]


class SourceArchivePathTests(unittest.TestCase):
    @staticmethod
    def checkout(root):
        for name in ['scripts/qa_source.py', 'production/pack_source.py', 'production/verify_source_archive.py']:
            target = root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes((ROOT / name).read_bytes())
        (root / 'package.json').write_text(json.dumps({'version': '0.1.0'}), encoding='utf-8')
        (root / '.gitignore').write_text('__pycache__/\n*.pyc\nproduction/output/\n', encoding='utf-8')
        subprocess.run(['git', 'init', '-q', str(root)], check=True, capture_output=True)

    def test_reproduction_is_demonstrated_only_by_metadata_normalization(self):
        # Never extract this entry: model a Windows-style extractor in memory.
        name = chr(92).join(['..', '..', 'escape.txt'])
        data = io.BytesIO()
        with zipfile.ZipFile(data, 'w') as archive:
            archive.writestr('game-theory-studio/' + name, b'synthetic harmless source')
        with zipfile.ZipFile(data) as archive:
            entry = archive.namelist()[0]
            destination = ntpath.normpath(ntpath.join('synthetic-extraction-root', entry))
            self.assertFalse(destination.startswith('synthetic-extraction-root' + chr(92)))
        with self.assertRaisesRegex(ValueError, 'Unsafe public source filename'):
            pack.validate_source_path(name)

    def test_canonical_contract_rejects_unsafe_and_reserved_names(self):
        for name in unsafe_names() + [None, 3, [], {}]:
            with self.subTest(name_type=type(name).__name__, name=name):
                with self.assertRaises(ValueError):
                    pack.validate_source_path(name)
        for name in ['source.txt', '.gitignore', '.github/workflows/quality.yml',
                     'docs/public-source-boundaries.md', 'chapter/中文源文件.txt',
                     'directory with spaces/source name.txt', 'a..b/source..txt',
                     'CONSOLE.txt', 'null.txt', 'COM10.txt', 'LPT0.txt', 'docs/SOURCE_MANIFEST.json']:
            with self.subTest(name=name):
                self.assertIsNone(pack.validate_source_path(name))
                self.assertEqual(verifier.validate_source_path(name).as_posix(), name)

    def test_entire_git_list_is_validated_before_files_are_selected(self):
        for name in [name for name in unsafe_names() if name and chr(0) not in name]:
            with self.subTest(name=name):
                output = b'ordinary.txt\0' + name.encode('utf-8') + b'\0'
                with patch.object(Path, 'lstat', side_effect=AssertionError('must validate before file access')):
                    with self.assertRaises(ValueError):
                        pack.source_candidates(Path('.'), output)
        with self.assertRaisesRegex(ValueError, 'filenames must be UTF-8'):
            pack.source_candidates(Path('.'), b'invalid-\xff.txt\0')

    def test_candidate_selection_retains_sorted_unique_existing_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for name in ['b.txt', 'a.txt']:
                (root / name).write_text('synthetic original source', encoding='utf-8')
            self.assertEqual(pack.source_candidates(root, b'b.txt\0a.txt\0a.txt\0'),
                             ['a.txt', 'b.txt'])

    def test_unsafe_names_match_verifier_contract_without_reading_targets(self):
        payload = b'synthetic source'
        for name in unsafe_names():
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                manifest = {
                    'manifest_schema_version': '1.0', 'distribution': 'public_source_original_svg_only',
                    'font_binaries_included': False, 'character_art_included': False,
                    'source': {'commit': None, 'working_tree_dirty': True, 'reproducible_from_commit': False},
                    'files': [{'path': name, 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}],
                }
                (root / 'SOURCE_MANIFEST.json').write_text(json.dumps(manifest), encoding='utf-8')
                with patch.object(Path, 'read_bytes', side_effect=AssertionError('unsafe target must not be read')):
                    with self.assertRaises(verifier.ArchiveValidationError):
                        verifier.verify_archive(root)

    @unittest.skipUnless(os.name == 'posix', 'Synthetic hostile filenames are created only on POSIX')
    def test_public_pack_rejects_posix_names_before_any_zip_and_preserves_existing_archive(self):
        # These are ordinary filenames on POSIX. They are never extracted.
        names = [chr(92).join(['..', '..', 'escape.txt']),
                 'source:stream.txt', 'source.txt.', 'source.txt ',
                 'source' + chr(10) + '.txt', 'Q:' + chr(92) + 'source.txt',
                 'SOURCE_MANIFEST.json', 'NUL.txt', 'CON .txt', 'COM1.txt', 'source?.txt']
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.checkout(root)
            destination = root / 'production/output/game_theory_studio_public_source.zip'
            destination.parent.mkdir()
            for name in names:
                bad = root / name
                bad.write_text('do-not-echo-file-payload', encoding='utf-8')
                for flags, optimization in [([], None), (['-O'], None), ([], '2')]:
                    with self.subTest(name=name, flags=flags, optimization=optimization):
                        env = {key: value for key, value in os.environ.items() if key != 'PYTHONOPTIMIZE'}
                        if optimization:
                            env['PYTHONOPTIMIZE'] = optimization
                        command = [sys.executable, *flags, str(root / 'production/pack_source.py'), '--public']
                        for previous in [None, b'preserve-existing-archive']:
                            destination.unlink(missing_ok=True)
                            if previous is not None:
                                destination.write_bytes(previous)
                            result = subprocess.run(command, env=env, capture_output=True, text=True)
                            self.assertNotEqual(result.returncode, 0)
                            self.assertIn('source', result.stderr)
                            self.assertIn('filename', result.stderr)
                            self.assertNotIn(name, result.stderr)
                            self.assertNotIn('do-not-echo-file-payload', result.stdout + result.stderr)
                            self.assertEqual(destination.read_bytes() if destination.exists() else None, previous)
                            self.assertEqual(list(destination.parent.iterdir()), [destination] if previous else [])
                bad.unlink()

    def test_casefolded_member_and_directory_collisions_are_rejected_before_access(self):
        cases = [['Readme.txt', 'README.txt'], ['Docs/a.txt', 'docs/b.txt'],
                 ['Tree', 'tree/leaf.txt'], ['nested/Tree', 'nested/tree/leaf.txt'],
                 ['straße.txt', 'strasse.txt'], ['café.txt', 'cafe\u0301.txt'],
                 ['Café/a.txt', 'Cafe\u0301/b.txt'], ['É.txt', 'e\u0301.txt']]
        for names in cases:
            with self.subTest(names=names):
                for module in [pack, verifier]:
                    seen = {}
                    self.assertFalse(module.portable_path_collision(names[0], seen))
                    self.assertTrue(module.portable_path_collision(names[1], seen))
                with patch.object(Path, 'lstat', side_effect=AssertionError('must reject before file access')):
                    with self.assertRaisesRegex(ValueError, 'collide after portable normalization'):
                        pack.source_candidates(Path('.'), b'\0'.join(name.encode('utf-8') for name in names) + b'\0')
        for module in [pack, verifier]:
            seen = {}
            for name in ['Docs/a.txt', 'Docs/b.txt', 'Docs/nested/a.txt', 'Docs/nested/b.txt',
                         '中文目录/源文件.txt', '中文目录/另一个文件.txt']:
                self.assertFalse(module.portable_path_collision(name, seen))

    @unittest.skipUnless(os.name == 'posix', 'Case-sensitive alias fixtures require POSIX')
    def test_writer_and_verifier_reject_case_aliases_without_replacing_archive_or_importing_guard(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.checkout(root)
            for name in ['Readme.txt', 'README.txt']:
                (root / name).write_bytes(b'synthetic harmless source')
            if (root / 'Readme.txt').samefile(root / 'README.txt'):
                self.skipTest('This temporary filesystem does not distinguish case aliases')
            destination = root / 'production/output/game_theory_studio_public_source.zip'
            destination.parent.mkdir()
            destination.write_bytes(b'preserve-existing-archive')
            result = subprocess.run([sys.executable, '-O', str(root / 'production/pack_source.py'), '--public'],
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('collide after portable normalization', result.stderr)
            self.assertEqual(destination.read_bytes(), b'preserve-existing-archive')
            self.assertEqual(list(destination.parent.iterdir()), [destination])
            payload = b'synthetic harmless source'
            manifest = {
                'manifest_schema_version': '1.0', 'distribution': 'public_source_original_svg_only',
                'font_binaries_included': False, 'character_art_included': False,
                'source': {'commit': None, 'working_tree_dirty': True, 'reproducible_from_commit': False},
                'files': [{'path': name, 'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}
                          for name in ['Readme.txt', 'README.txt']],
            }
            (root / 'SOURCE_MANIFEST.json').write_text(json.dumps(manifest), encoding='utf-8')
            with patch.object(verifier.importlib.util, 'spec_from_file_location') as imported:
                with self.assertRaisesRegex(verifier.ArchiveValidationError, 'collide after portable normalization'):
                    verifier.verify_archive(root)
                imported.assert_not_called()
            verified = subprocess.run([sys.executable, '-O', str(ROOT / 'production/verify_source_archive.py'), str(root)],
                                      capture_output=True, text=True)
            self.assertNotEqual(verified.returncode, 0)
            self.assertIn('collide after portable normalization', verified.stderr)

    def test_unsafe_candidate_stops_before_manifest_provenance_or_zip_creation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.checkout(root)
            output = b'package.json\0' + chr(92).join(['..', '..', 'escape.txt']).encode() + b'\0'
            with patch.object(pack, 'ROOT', root), patch.object(sys, 'argv', ['pack_source.py', '--public']), \
                 patch.object(pack.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, str(root) + '\n')), \
                 patch.object(pack.subprocess, 'check_output', return_value=output), \
                 patch.object(pack, 'source_provenance') as provenance, \
                 patch.object(pack, 'source_versions') as versions, \
                 patch.object(pack.tempfile, 'mkstemp') as temporary_zip, \
                 patch.object(pack.zipfile, 'ZipFile') as archive:
                with self.assertRaisesRegex(SystemExit, 'Unsafe public source filename'):
                    pack.main()
                provenance.assert_not_called()
                versions.assert_not_called()
                temporary_zip.assert_not_called()
                archive.assert_not_called()

    def test_valid_public_pack_extracts_only_inside_temporary_root_and_verifies(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            root = base / 'checkout'; root.mkdir()
            self.checkout(root)
            for name in ['docs/中文源文件.txt', 'directory with spaces/source name.txt']:
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text('synthetic original source', encoding='utf-8')
            result = subprocess.run([sys.executable, str(root / 'production/pack_source.py'), '--public'],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            destination = root / 'production/output/game_theory_studio_public_source.zip'
            extraction = base / 'contained-extraction'; extraction.mkdir()
            with zipfile.ZipFile(destination) as archive:
                self.assertIsNone(archive.testzip())
                for name in archive.namelist():
                    pack.validate_source_path(name)
                    target = (extraction / name).resolve()
                    self.assertTrue(target.is_relative_to(extraction.resolve()))
                    normalized = ntpath.normpath(name)
                    self.assertTrue(normalized.startswith('game-theory-studio' + chr(92)))
                archive.extractall(extraction)
            extracted = extraction / 'game-theory-studio'
            verified = subprocess.run([sys.executable, '-O', str(extracted / 'production/verify_source_archive.py')],
                                      cwd=extracted, capture_output=True, text=True)
            self.assertEqual(verified.returncode, 0, verified.stderr)
            self.assertIn('Archive integrity verified', verified.stdout)
            self.assertEqual((extracted / 'docs/中文源文件.txt').read_text(encoding='utf-8'), 'synthetic original source')


if __name__ == '__main__':
    unittest.main()
