"""Synthetic Unix path boundaries through source QA and the real ZIP entry point."""
from pathlib import Path
import json
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile

import test_source_archive_paths as archive_paths

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from qa_source import scan_sources

MODES = [([], None), (['-O'], None), (['-OO'], None), ([], '1'), ([], '2')]


def unix_path(root, component='synthetic-source-user'):
    # Runtime construction keeps synthetic negative fixtures out of public text.
    return '/'.join(['', root, component])


def portable_sources():
    values = ['ordinary first line\nordinary second line\n',
              r'new RegExp("[\\s\\S]*?")', r'[\\p{Cc}\\p{Cf}\\r\\n\\t]',
              'const escapedNewline = "' + chr(92) + 'n";\n',
              'const escapedTab = "' + chr(92) + 't";\n']
    for root in ['home', 'workspace', 'Users', 'root']:
        path = unix_path(root)
        values += [prefix + path + ending
                   for prefix in ['.', '..', 'docs', '~', 'https://example.invalid',
                                  'git+ssh://example.invalid', '//example.invalid', 'file://']
                   for ending in ['', '/', '/source.txt']]
        values += [root + '/synthetic-source-user',
                   '/'.join(['', root + '-guide', 'public'])]
    return values


class UnixPathBoundaryTests(unittest.TestCase):
    @staticmethod
    def command(root, entry, flags=(), optimization=None):
        env = {key: value for key, value in os.environ.items() if key != 'PYTHONOPTIMIZE'}
        env['PYTHONDONTWRITEBYTECODE'] = '1'
        if optimization:
            env['PYTHONOPTIMIZE'] = optimization
        arguments = ['scripts/qa_source.py'] if entry == 'qa' else ['production/pack_source.py', '--public']
        return subprocess.run([sys.executable, *flags, *arguments], cwd=root, env=env,
                              capture_output=True, text=True, timeout=15)

    def test_terminal_delimiters_and_existing_child_paths_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for base in ['home', 'workspace', 'Users', 'root']:
                path = unix_path(base)
                for prefix in ['', 'path=', '"', "'", '`', '(', '[', '{', '\n', '\t']:
                    for suffix in ['', '/', '/child.txt', '"', "'", '`', ' ', '\n', '\r\n',
                                   '\t', ',', ';', ':', ')', ']', '}', '<', '>', '|', '&']:
                        with self.subTest(base=base, prefix=prefix, suffix=suffix):
                            (root / 'source.txt').write_text(prefix + path + suffix, encoding='utf-8')
                            self.assertEqual(scan_sources(root, ['source.txt'])[0],
                                             [('source.txt', 'machine workspace path')])

    def test_portable_paths_urls_newlines_and_regex_escapes_remain_supported(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for text in portable_sources():
                with self.subTest(text=text):
                    (root / 'source.txt').write_text(text, encoding='utf-8')
                    self.assertEqual(scan_sources(root, ['source.txt'])[0], [])

    def test_real_qa_and_pack_reject_terminal_and_child_paths_in_every_mode(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive_paths.SourceArchivePathTests.checkout(root)
            destination = root / 'production/output/game_theory_studio_public_source.zip'
            destination.parent.mkdir(parents=True)
            destination.write_bytes(b'previous-archive-must-survive')
            for flags, optimization in MODES:
                for base in ['home', 'workspace', 'Users', 'root']:
                    path = unix_path(base)
                    for text in [path, 'path="' + path + '"', json.dumps({'path': path}),
                                 'path=' + path + '\n', '[' + path + ']', path + '/', path + '/child']:
                        (root / 'source.txt').write_text(text, encoding='utf-8')
                        for entry in ['qa', 'pack']:
                            with self.subTest(flags=flags, optimization=optimization, base=base,
                                              text=text, entry=entry):
                                result = self.command(root, entry, flags, optimization)
                                self.assertNotEqual(result.returncode, 0, result.stdout)
                                self.assertIn('source.txt: machine workspace path', result.stdout + result.stderr)
                                self.assertNotIn(path, result.stdout + result.stderr)
                                self.assertEqual(destination.read_bytes(), b'previous-archive-must-survive')
                                self.assertEqual(list(destination.parent.iterdir()), [destination])

    def test_real_qa_and_pack_accept_portable_sources_in_every_mode(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive_paths.SourceArchivePathTests.checkout(root)
            source = '\n'.join(portable_sources())
            (root / 'source.txt').write_text(source, encoding='utf-8')
            for flags, optimization in MODES:
                for entry in ['qa', 'pack']:
                    with self.subTest(flags=flags, optimization=optimization, entry=entry):
                        result = self.command(root, entry, flags, optimization)
                        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                with zipfile.ZipFile(root / 'production/output/game_theory_studio_public_source.zip') as archive:
                    self.assertEqual(archive.read('game-theory-studio/source.txt').decode('utf-8'), source)

    def test_previous_trailing_slash_rule_reproduces_both_entry_point_leaks(self):
        # Mutate only the Unix branch in a disposable checkout. Windows/UNC and
        # the actual CLI/packaging code stay intact; no publication is performed.
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive_paths.SourceArchivePathTests.checkout(root)
            guard = root / 'scripts/qa_source.py'
            source = guard.read_text(encoding='utf-8')
            start = source.index("    'machine workspace path': re.compile(")
            branch_start = source.index('\n', start) + 1
            branch_end = source.index('        # A drive root', branch_start)
            old_branch = "        r'/(?:workspace|home|Users|root)/[A-Za-z0-9_.-]+/'\n"
            guard.write_text(source[:branch_start] + old_branch + source[branch_end:], encoding='utf-8')
            for base, component in [('home', 'alice'), ('workspace', 'game-theory-studio')]:
                text = 'path="' + unix_path(base, component) + '"'
                (root / 'source.txt').write_text(text, encoding='utf-8')
                for entry in ['qa', 'pack']:
                    with self.subTest(base=base, entry=entry):
                        result = self.command(root, entry)
                        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                with zipfile.ZipFile(root / 'production/output/game_theory_studio_public_source.zip') as archive:
                    self.assertEqual(archive.read('game-theory-studio/source.txt').decode('utf-8'), text)


if __name__ == '__main__':
    unittest.main()
