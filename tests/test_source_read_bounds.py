"""Exercise bounded source reads through the real QA and public-pack entry points."""
from pathlib import Path
import os
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

import test_source_archive_paths as archive_paths

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from qa_source import scan_sources

LIMIT = 1024 * 1024
MODES = [([], None), (['-O'], None), (['-OO'], None), ([], '1'), ([], '2')]
# Runs the actual entry module, changing only access to the synthetic source.
# Reject unbounded reads BEFORE performing them, so mutation tests stay safe.
WRAPPER = r'''
from pathlib import Path
import runpy
import sys

entry, mode = sys.argv[1:]
target = Path('source.txt').resolve()
original_open = Path.open
opens = reads = consumed = 0
limit = 1024 * 1024

class BoundedStream:
    def __init__(self, stream):
        self.stream = stream
    def __enter__(self):
        return self
    def __exit__(self, *args):
        self.stream.close()
    def read(self, size=-1):
        global reads, consumed
        if size != limit + 1 or reads:
            print('fixture rejected an unbounded or repeated read')
            raise RuntimeError('bounded read required')
        reads += 1
        data = self.stream.read(size)
        consumed += len(data)
        return data

def checked_open(path, *args, **kwargs):
    global opens
    if path.resolve() != target:
        return original_open(path, *args, **kwargs)
    opens += 1
    if mode == 'oversize':
        raise RuntimeError('fixture rejected opening an already oversized source')
    # Grow a formerly small regular file AFTER every pre-open stat check.
    with original_open(target, 'r+b') as stream:
        stream.truncate(8 * 1024 * 1024 * 1024)
    return BoundedStream(original_open(path, *args, **kwargs))

Path.open = checked_open
sys.argv = [entry] + (['--public'] if 'pack_source' in entry else [])
try:
    runpy.run_path(entry, run_name='__main__')
finally:
    print(f'ACCESS opens={opens} reads={reads} bytes={consumed}')
'''


class SourceReadBoundsTests(unittest.TestCase):
    @staticmethod
    def command(root, entry, flags=(), optimization=None, mode=None):
        env = {key: value for key, value in os.environ.items() if key != 'PYTHONOPTIMIZE'}
        env['PYTHONDONTWRITEBYTECODE'] = '1'
        if optimization:
            env['PYTHONOPTIMIZE'] = optimization
        script = 'scripts/qa_source.py' if entry == 'qa' else 'production/pack_source.py'
        args = (['-c', WRAPPER, script, mode] if mode else
                [script] + (['--public'] if entry == 'pack' else []))
        return subprocess.run([sys.executable, *flags, *args], cwd=root, env=env,
                              capture_output=True, text=True, timeout=20)

    @staticmethod
    def previous_archive(root):
        destination = root / 'production/output/game_theory_studio_public_source.zip'
        destination.parent.mkdir(parents=True)
        destination.write_bytes(b'previous-archive-must-survive')
        return destination

    def test_sparse_oversize_is_rejected_without_opening_source(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive_paths.SourceArchivePathTests.checkout(root)
            destination = self.previous_archive(root)
            with (root / 'source.txt').open('wb') as stream:
                stream.truncate(8 * 1024 * 1024 * 1024)
            for flags, optimization in MODES:
                for entry in ['qa', 'pack']:
                    with self.subTest(entry=entry, flags=flags, optimization=optimization):
                        result = self.command(root, entry, flags, optimization, 'oversize')
                        output = result.stdout + result.stderr
                        self.assertNotEqual(result.returncode, 0)
                        self.assertIn('exceeds 1 MiB', output)
                        self.assertIn('ACCESS opens=0 reads=0 bytes=0', output)
                        self.assertNotIn('Traceback', output)
                        self.assertEqual(destination.read_bytes(), b'previous-archive-must-survive')
                        self.assertEqual(list(destination.parent.iterdir()), [destination])

    def test_growth_after_stat_reads_only_limit_plus_one_and_preserves_archive(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive_paths.SourceArchivePathTests.checkout(root)
            destination = self.previous_archive(root)
            for flags, optimization in MODES:
                for entry in ['qa', 'pack']:
                    with self.subTest(entry=entry, flags=flags, optimization=optimization):
                        marker = b'synthetic-content-must-not-be-echoed'
                        (root / 'source.txt').write_bytes(marker)
                        result = self.command(root, entry, flags, optimization, 'growth')
                        output = result.stdout + result.stderr
                        self.assertNotEqual(result.returncode, 0)
                        self.assertIn('source.txt: source file exceeds 1 MiB', output)
                        self.assertIn(f'ACCESS opens=1 reads=1 bytes={LIMIT + 1}', output)
                        self.assertNotIn('Traceback', output)
                        self.assertNotIn(marker.decode(), output)
                        self.assertEqual(destination.read_bytes(), b'previous-archive-must-survive')
                        self.assertEqual(list(destination.parent.iterdir()), [destination])

    def test_valid_sources_at_and_below_limit_pass_both_entry_points(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive_paths.SourceArchivePathTests.checkout(root)
            for size in [LIMIT - 1, LIMIT]:
                content = b'a' * size
                (root / 'source.txt').write_bytes(content)
                for flags, optimization in MODES:
                    for entry in ['qa', 'pack']:
                        with self.subTest(size=size, entry=entry, flags=flags, optimization=optimization):
                            result = self.command(root, entry, flags, optimization)
                            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    with zipfile.ZipFile(root / 'production/output/game_theory_studio_public_source.zip') as archive:
                        self.assertEqual(archive.read('game-theory-studio/source.txt'), content)

    def test_early_size_rejection_and_exact_byte_count(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / 'source.txt'
            for size in [0, 1, LIMIT - 1, LIMIT]:
                source.write_bytes(b'a' * size)
                self.assertEqual(scan_sources(root, ['source.txt']), ([], size))
            source.write_bytes(b'a' * (LIMIT + 1))
            with patch.object(Path, 'open', side_effect=RuntimeError('must not open')):
                self.assertEqual(scan_sources(root, ['source.txt']),
                                 ([('source.txt', 'source file exceeds 1 MiB')], 0))

    def test_old_unbounded_read_is_detected_without_allocating_large_file(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive_paths.SourceArchivePathTests.checkout(root)
            guard = root / 'scripts/qa_source.py'
            source = guard.read_text(encoding='utf-8')
            bounded = "with file.open('rb') as stream:\n            data = stream.read(MAX_SOURCE_BYTES + 1)"
            self.assertIn(bounded, source)
            guard.write_text(source.replace(bounded, 'data = file.read_bytes()'), encoding='utf-8')
            for entry in ['qa', 'pack']:
                (root / 'source.txt').write_text('small before opening', encoding='utf-8')
                result = self.command(root, entry, mode='growth')
                output = result.stdout + result.stderr
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('fixture rejected an unbounded or repeated read', output)
                self.assertIn('ACCESS opens=1 reads=0 bytes=0', output)
                self.assertNotIn('source.txt: source file exceeds 1 MiB', output)


if __name__ == '__main__':
    unittest.main()
