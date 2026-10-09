"""Bound extracted-source hashing, including real sparse files and growth races."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
VERIFIER = ROOT / 'production/verify_source_archive.py'
LIMIT = 1024 * 1024
SPARSE_SIZE = 8 * 1024 * 1024 * 1024
MODES = [([], None), (['-O'], None), (['-OO'], None), ([], '1'), ([], '2')]
WRAPPER = r'''
from pathlib import Path
import json
import runpy
import sys
entry, directory, mode = sys.argv[1:]
target = (Path(directory) / 'source.txt').resolve()
expected = json.loads((Path(directory) / 'SOURCE_MANIFEST.json').read_text())['files'][0]['bytes']
original_open = Path.open
opens = reads = consumed = 0
class CheckedStream:
    def __init__(self, stream): self.stream = stream
    def __enter__(self): return self
    def __exit__(self, *args): self.stream.close()
    def read(self, size=-1):
        global reads, consumed
        if not 0 < size <= 64 * 1024 or consumed + size > expected + 1:
            raise RuntimeError('fixture rejected an unbounded read')
        reads += 1
        data = self.stream.read(size)
        consumed += len(data)
        return data

def checked_open(path, *args, **kwargs):
    global opens
    if path.resolve() != target: return original_open(path, *args, **kwargs)
    opens += 1
    if mode == 'oversize': raise RuntimeError('fixture rejected opening oversized source')
    with original_open(target, 'r+b') as stream:
        stream.truncate(8 * 1024 * 1024 * 1024 if mode == 'growth' else 0)
    return CheckedStream(original_open(path, *args, **kwargs))
Path.open = checked_open
sys.argv = [entry, directory]
try:
    runpy.run_path(entry, run_name='__main__')
finally:
    print(f'ACCESS opens={opens} reads={reads} bytes={consumed}')
'''

MANIFEST_WRAPPER = r'''
from pathlib import Path
import runpy
import sys
entry, directory, mode = sys.argv[1:]
target = (Path(directory) / 'SOURCE_MANIFEST.json').resolve()
original_open = Path.open
opens = reads = consumed = 0
limit = 15 * 1024 * 1024
class CheckedStream:
    def __init__(self, stream): self.stream = stream
    def __enter__(self): return self
    def __exit__(self, *args): self.stream.close()
    def read(self, size=-1):
        global reads, consumed
        if size != limit + 1 or reads:
            raise RuntimeError('fixture rejected an unbounded metadata read')
        reads += 1
        data = self.stream.read(size)
        consumed += len(data)
        return data

def checked_open(path, *args, **kwargs):
    global opens
    if path.resolve() != target: return original_open(path, *args, **kwargs)
    opens += 1
    if mode == 'manifest-oversize': raise RuntimeError('fixture rejected opening oversized metadata')
    with original_open(target, 'r+b') as stream:
        stream.truncate(8 * 1024 * 1024 * 1024)
    return CheckedStream(original_open(path, *args, **kwargs))
Path.open = checked_open
sys.argv = [entry, directory]
try:
    runpy.run_path(entry, run_name='__main__')
finally:
    print(f'ACCESS opens={opens} reads={reads} bytes={consumed}')
'''


class ExtractedArchiveReadBoundsTests(unittest.TestCase):
    @staticmethod
    def extract(base, content=b'synthetic original source'):
        manifest = {
            'manifest_schema_version': '1.0',
            'distribution': 'public_source_original_svg_only',
            'font_binaries_included': False, 'character_art_included': False,
            'source': {'commit': None, 'working_tree_dirty': True, 'reproducible_from_commit': False},
            'files': [{'path': 'source.txt', 'bytes': len(content),
                       'sha256': hashlib.sha256(content).hexdigest()}],
        }
        archive = base / 'source.zip'
        with zipfile.ZipFile(archive, 'w') as stream:
            stream.writestr('source.txt', content)
            stream.writestr('SOURCE_MANIFEST.json', json.dumps(manifest))
        root = base / 'extracted'
        with zipfile.ZipFile(archive) as stream:
            stream.extractall(root)
        return root

    @staticmethod
    def command(root, flags=(), optimization=None, mode=None, verifier=VERIFIER):
        env = {key: value for key, value in os.environ.items() if key != 'PYTHONOPTIMIZE'}
        env['PYTHONDONTWRITEBYTECODE'] = '1'
        if optimization:
            env['PYTHONOPTIMIZE'] = optimization
        wrapper = MANIFEST_WRAPPER if mode and mode.startswith('manifest-') else WRAPPER
        args = ['-c', wrapper, str(verifier), str(root), mode] if mode else [str(verifier), str(root)]
        return subprocess.run([sys.executable, *flags, *args], env=env, capture_output=True,
                              text=True, timeout=15)

    def test_directory_alias_hooks_reach_growth_shrink_and_mutation_failures(self):
        # Model macOS /var -> /private/var even when running on Linux.
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            real_root = self.extract(base)
            root = base / 'alias'
            root.symlink_to(real_root, target_is_directory=True)
            manifest = (real_root / 'SOURCE_MANIFEST.json').read_bytes()
            source = VERIFIER.read_text()
            mutations = {
                'source-mutation': source.replace(
                    'stream.read(min(HASH_CHUNK_BYTES, expected_size - consumed + 1))', 'stream.read()'),
                'manifest-mutation': source.replace('stream.read(MAX_MANIFEST_BYTES + 1)', 'stream.read()'),
            }
            for kind in ['growth', 'shrink', 'manifest-growth', *mutations]:
                verifier = VERIFIER
                mode = kind
                if kind in mutations:
                    verifier = base / (kind + '.py')
                    verifier.write_text(mutations[kind])
                    mode = 'growth' if kind == 'source-mutation' else 'manifest-growth'
                for flags, optimization in MODES:
                    with self.subTest(kind=kind, flags=flags, optimization=optimization):
                        (real_root / 'SOURCE_MANIFEST.json').write_bytes(manifest)
                        (real_root / 'source.txt').write_bytes(b'synthetic original source')
                        result = self.command(root, flags, optimization, mode, verifier)
                        output = result.stdout + result.stderr
                        self.assertNotEqual(result.returncode, 0)
                        self.assertIn('ACCESS opens=1 reads=', output)
                        if kind in mutations:
                            self.assertIn('fixture rejected an unbounded', output)
                            self.assertIn('ACCESS opens=1 reads=0 bytes=0', output)
                        else:
                            self.assertNotIn('Traceback', output)
                            self.assertIn('Archive manifest exceeds 15 MiB' if kind == 'manifest-growth'
                                          else 'Archive source differs', output)
                            expected_bytes = 15 * LIMIT + 1 if kind == 'manifest-growth' else (
                                26 if kind == 'growth' else 0)
                            self.assertIn(f'bytes={expected_bytes}', output)

    def test_old_literal_path_hooks_miss_directory_alias(self):
        # Reproduce the former harness bug without an unbounded payload read:
        # neither growth nor shrink occurs, so the original valid archive passes.
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            real_root = self.extract(base)
            root = base / 'alias'
            root.symlink_to(real_root, target_is_directory=True)
            for wrapper, mode in [(WRAPPER, 'growth'), (MANIFEST_WRAPPER, 'manifest-growth')]:
                old_wrapper = wrapper.replace(
                    "target = (Path(directory) / 'source.txt').resolve()",
                    "target = Path(directory) / 'source.txt'").replace(
                    "target = (Path(directory) / 'SOURCE_MANIFEST.json').resolve()",
                    "target = Path(directory) / 'SOURCE_MANIFEST.json'").replace(
                    'if path.resolve() != target:', 'if path != target:')
                for flags, optimization in MODES:
                    env = {key: value for key, value in os.environ.items() if key != 'PYTHONOPTIMIZE'}
                    env['PYTHONDONTWRITEBYTECODE'] = '1'
                    if optimization:
                        env['PYTHONOPTIMIZE'] = optimization
                    result = subprocess.run(
                        [sys.executable, *flags, '-c', old_wrapper, str(VERIFIER), str(root), mode],
                        env=env, capture_output=True, text=True, timeout=15)
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    self.assertIn('ACCESS opens=0 reads=0 bytes=0', result.stdout)
                    self.assertIn('Archive integrity verified: 1 source files', result.stdout)

    def test_sparse_manifest_rejected_before_read_and_growth_read_is_bounded(self):
        for mode in ['manifest-oversize', 'manifest-growth']:
            with tempfile.TemporaryDirectory() as temporary:
                root = self.extract(Path(temporary))
                target = root / 'SOURCE_MANIFEST.json'
                content = target.read_bytes()
                for flags, optimization in MODES:
                    with self.subTest(mode=mode, flags=flags, optimization=optimization):
                        target.write_bytes(content)
                        if mode == 'manifest-oversize':
                            with target.open('r+b') as stream:
                                stream.truncate(SPARSE_SIZE)
                        result = self.command(root, flags, optimization, mode)
                        output = result.stdout + result.stderr
                        self.assertNotEqual(result.returncode, 0)
                        self.assertIn('Archive manifest exceeds 15 MiB', output)
                        self.assertIn('ACCESS opens=0 reads=0 bytes=0' if mode == 'manifest-oversize'
                                      else f'ACCESS opens=1 reads=1 bytes={15 * LIMIT + 1}', output)
                        self.assertNotIn('Traceback', output)

    def test_unbounded_manifest_mutation_is_detected_before_large_allocation(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            root = self.extract(base)
            target = root / 'SOURCE_MANIFEST.json'
            content = target.read_bytes()
            mutated = base / 'mutated_verifier.py'
            source = VERIFIER.read_text()
            bounded = 'stream.read(MAX_MANIFEST_BYTES + 1)'
            self.assertIn(bounded, source)
            mutated.write_text(source.replace(bounded, 'stream.read()'))
            for flags, optimization in MODES:
                target.write_bytes(content)
                result = self.command(root, flags, optimization, 'manifest-growth', mutated)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('fixture rejected an unbounded metadata read', result.stderr)
                self.assertIn('ACCESS opens=1 reads=0 bytes=0', result.stdout)

    def test_manifest_at_explicit_metadata_limit_passes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = self.extract(Path(temporary))
            target = root / 'SOURCE_MANIFEST.json'
            content = target.read_bytes()
            target.write_bytes(content + b' ' * (15 * LIMIT - len(content)))
            for flags, optimization in MODES:
                result = self.command(root, flags, optimization)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_real_sparse_source_is_rejected_without_payload_open(self):
        for claimed_size in [25, SPARSE_SIZE]:
            with tempfile.TemporaryDirectory() as temporary:
                root = self.extract(Path(temporary))
                with (root / 'source.txt').open('r+b') as stream:
                    stream.truncate(SPARSE_SIZE)
                manifest_path = root / 'SOURCE_MANIFEST.json'
                manifest = json.loads(manifest_path.read_text())
                manifest['files'][0]['bytes'] = claimed_size
                manifest_path.write_text(json.dumps(manifest))
                for flags, optimization in MODES:
                    with self.subTest(claimed_size=claimed_size, flags=flags, optimization=optimization):
                        result = self.command(root, flags, optimization, 'oversize')
                        output = result.stdout + result.stderr
                        self.assertNotEqual(result.returncode, 0)
                        self.assertIn('Archive source exceeds 1 MiB', output)
                        self.assertIn('ACCESS opens=0 reads=0 bytes=0', output)
                        self.assertNotIn('Traceback', output)

    def test_growth_after_stat_reads_at_most_expected_length_plus_one(self):
        for size in [0, 25, 65536, LIMIT]:
            with tempfile.TemporaryDirectory() as temporary:
                root = self.extract(Path(temporary), b'a' * size)
                for flags, optimization in MODES:
                    with self.subTest(size=size, flags=flags, optimization=optimization):
                        (root / 'source.txt').write_bytes(b'a' * size)
                        result = self.command(root, flags, optimization, 'growth')
                        output = result.stdout + result.stderr
                        self.assertNotEqual(result.returncode, 0)
                        self.assertIn('Archive source differs', output)
                        self.assertIn(f'bytes={size + 1}', output)
                        self.assertNotIn('Traceback', output)

    def test_shrink_after_stat_fails_exact_count(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = self.extract(Path(temporary))
            for flags, optimization in MODES:
                (root / 'source.txt').write_bytes(b'synthetic original source')
                result = self.command(root, flags, optimization, 'shrink')
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('Archive source differs', result.stderr)
                self.assertIn('ACCESS opens=1 reads=1 bytes=0', result.stdout)
                self.assertNotIn('Traceback', result.stderr)

    def test_valid_empty_chunk_boundary_and_limit_sources_pass(self):
        for size in [0, 1, 65536, LIMIT - 1, LIMIT]:
            with tempfile.TemporaryDirectory() as temporary:
                root = self.extract(Path(temporary), b'a' * size)
                for flags, optimization in MODES:
                    with self.subTest(size=size, flags=flags, optimization=optimization):
                        result = self.command(root, flags, optimization)
                        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                        self.assertIn('Archive integrity verified: 1 source files', result.stdout)

    def test_same_length_hash_and_size_mismatches_fail(self):
        for content in [b'b' * 25, b'a' * 24, b'a' * 26]:
            with tempfile.TemporaryDirectory() as temporary:
                root = self.extract(Path(temporary))
                (root / 'source.txt').write_bytes(content)
                for flags, optimization in MODES:
                    result = self.command(root, flags, optimization)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn('Archive source differs', result.stderr)
                    self.assertNotIn('Traceback', result.stderr)

    def test_unbounded_read_mutation_is_detected_before_large_allocation(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary)
            root = self.extract(base)
            mutated = base / 'mutated_verifier.py'
            source = VERIFIER.read_text()
            bounded = 'stream.read(min(HASH_CHUNK_BYTES, expected_size - consumed + 1))'
            self.assertIn(bounded, source)
            mutated.write_text(source.replace(bounded, 'stream.read()'))
            for flags, optimization in MODES:
                (root / 'source.txt').write_bytes(b'synthetic original source')
                result = self.command(root, flags, optimization, 'growth', mutated)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('fixture rejected an unbounded read', result.stderr)
                self.assertIn('ACCESS opens=1 reads=0 bytes=0', result.stdout)


if __name__ == '__main__':
    unittest.main()
