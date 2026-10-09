"""Dependency-free negative fixtures for the public source publication boundary."""
from pathlib import Path
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from unittest.mock import patch
from xml.sax.saxutils import escape, quoteattr

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from qa_source import scan_sources, svg_source_issue

spec = importlib.util.spec_from_file_location('verified_archive', ROOT / 'production/verify_source_archive.py')
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


class SvgCssBoundaryTests(unittest.TestCase):
    def test_escaped_import_and_resource_tokens_fail_closed(self):
        styles = [
            r'@im\70ort "https://example.invalid/a.css";',
            r'@\69mport "https://example.invalid/a.css";',
            r'fill:u\72l(https://example.invalid/a.svg)',
            r'fill:\75\72\6c(https://example.invalid/a.svg)',
            r'fill:url(\68ttps://example.invalid/a.svg)',
            r'fill:url(\23local)',
            'fill:u' + chr(92) + '\nrl(https://example.invalid/a.svg)',
        ]
        for css in styles:
            for source in ['<svg><style>' + escape(css) + '</style></svg>',
                           '<svg><path style=' + quoteattr(css) + '/></svg>',
                           '<svg><path fill=' + quoteattr(css) + '/></svg>']:
                with self.subTest(css=css, source=source):
                    self.assertIn('unsupported CSS escapes', svg_source_issue(source))
                    # XML references must be checked after XML decoding.
                    self.assertIn('unsupported CSS escapes', svg_source_issue(source.replace(chr(92), '&#92;')))

    def test_comments_at_rules_and_unsupported_functions_fail_closed(self):
        for css in ['@import "https://example.invalid/a.css";',
                    '@font-face { src: local(example); }',
                    'fill:u/**/rl(https://example.invalid/a.svg)',
                    'fill:url(/**/#local)',
                    'fill:image-set("https://example.invalid/a.svg")',
                    'fill:var(--external)', 'fill:url(#local', 'fill:url("#local\')',
                    'fill:url(https://example.invalid/a.svg)']:
            with self.subTest(css=css):
                self.assertIsNotNone(svg_source_issue('<svg><style>' + escape(css) + '</style></svg>'))
        self.assertIsNotNone(svg_source_issue('<svg><style>fill:<g/>url(#local)</style></svg>'))

    def test_literal_local_fragment_styles_and_text_remain_supported(self):
        styles = ["fill: url(#shape); stroke: rgb(0, 30, 90)",
                  "fill: URL( '#shape' ); opacity: .5", 'fill: url( "#shape" )',
                  'transform: translate(10, 20) rotate(45); fill: rgba(0, 0, 0, .5)']
        for css in styles:
            with self.subTest(css=css):
                source = ('<svg><defs><path id="shape" d="M0 0L1 1"/></defs><style>path {' +
                          escape(css) + '}</style><path style=' + quoteattr(css) + '/></svg>')
                self.assertIsNone(svg_source_issue(source))
        self.assertIsNone(svg_source_issue('<svg><text>Payoff (A) @ B \\ C</text></svg>'))

    def test_base_uri_and_animation_cannot_change_local_resource_resolution(self):
        for source in ['<svg xml:base="https://example.invalid/a.svg"><use href="#shape"/></svg>',
                       '<svg><g xml:base="https://example.invalid/"><path fill="url(#shape)"/></g></svg>']:
            self.assertIn('base URI', svg_source_issue(source))
        for element in ['animate', 'set', 'animateMotion', 'animateTransform', 'discard']:
            source = ('<svg><use href="#shape"><' + element +
                      ' attributeName="href" to="https://example.invalid/a.svg#shape"/></use></svg>')
            self.assertIn('animation or resource-changing', svg_source_issue(source))

    def test_scan_and_cli_reject_css_without_echoing_its_value(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'scripts').mkdir()
            (root / 'scripts/qa_source.py').write_bytes((ROOT / 'scripts/qa_source.py').read_bytes())
            subprocess.run(['git', 'init', '-q', str(root)], check=True, capture_output=True)
            marker = 'do-not-echo-source-fixture'
            for suffix in ['svg', 'SVG', 'sVg']:
                name = 'source.' + suffix
                (root / name).write_text('<svg><style>@im' + chr(92) + '70ort "' + marker + '";</style></svg>')
                self.assertTrue(scan_sources(root, [name])[0])
            result = subprocess.run([sys.executable, str(root / 'scripts/qa_source.py')], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertNotIn(marker, result.stdout + result.stderr)


class SvgNamespaceBoundaryTests(unittest.TestCase):
    def test_html_iframe_srcdoc_is_rejected_by_namespace_without_execution(self):
        # Parse only. This XML/HTML fixture is never opened, rendered, or executed.
        html = '<script>globalThis.__svg_guard_fixture__=true</script>'
        payload = ('<svg xmlns="http://www.w3.org/2000/svg" '
                   'xmlns:h="http://www.w3.org/1999/xhtml"><h:iframe srcdoc=' +
                   quoteattr(html) + '/></svg>')
        ET.fromstring(payload)
        self.assertEqual(svg_source_issue(payload), 'SVG has an unsupported element namespace')
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for suffix in ['svg', 'SVG', 'sVg']:
                name = 'source.' + suffix
                (root / name).write_text(payload, encoding='utf-8')
                self.assertEqual(scan_sources(root, [name])[0],
                                 [(name, 'SVG has an unsupported element namespace')])

    def test_foreign_default_prefixed_and_nested_namespace_resets_are_rejected(self):
        for namespace in ['http://www.w3.org/1999/xhtml', 'http://www.w3.org/1998/Math/MathML',
                          'http://www.w3.org/2001/XInclude', 'urn:unknown-svg-test',
                          'http://www.w3.org/2000/SVG', 'HTTP://www.w3.org/2000/svg',
                          'http://www.w3.org/2000/svg/']:
            sources = [
                '<svg xmlns=' + quoteattr(namespace) + '><path d="M0 0L1 1"/></svg>',
                '<svg xmlns="http://www.w3.org/2000/svg"><g xmlns=' + quoteattr(namespace) +
                '><path xmlns="" d="M0 0L1 1"/></g></svg>',
                '<svg xmlns:p=' + quoteattr(namespace) + '><p:path d="M0 0L1 1"/></svg>',
                '<svg xmlns="http://www.w3.org/2000/svg"><g xmlns=""><svg xmlns=' +
                quoteattr(namespace) + '/></g></svg>',
            ]
            for source in sources:
                with self.subTest(namespace=namespace, source=source):
                    ET.fromstring(source)
                    self.assertEqual(svg_source_issue(source), 'SVG has an unsupported element namespace')

    def test_unknown_elements_fail_closed_even_in_svg_or_no_namespace(self):
        for name in ['iframe', 'IFRAME', 'object', 'embed', 'audio', 'video', 'link',
                     'html', 'body', 'a', 'filter', 'unknown', 'futureSvgElement']:
            for declaration in ['', ' xmlns="http://www.w3.org/2000/svg"']:
                source = '<svg' + declaration + '><' + name + ' srcdoc="escaped fixture"/></svg>'
                with self.subTest(name=name, declaration=declaration):
                    ET.fromstring(source)
                    self.assertEqual(svg_source_issue(source), 'SVG has an unsupported static element')

    def test_supported_static_shapes_definitions_text_and_local_references_pass(self):
        # Spell out the expected public subset independently of the guard's set.
        content = ('<title>Original art</title><desc>Static vector fixture</desc><defs>'
                   '<symbol id="shape"><path d="M0 0L1 1"/></symbol>'
                   '<linearGradient id="linear"><stop offset="0" stop-color="blue"/></linearGradient>'
                   '<radialGradient id="radial" href="#linear"/>'
                   '<pattern id="pattern" width="2" height="2"><rect width="1" height="1"/></pattern>'
                   '<clipPath id="clip"><circle r="1"/></clipPath>'
                   '<mask id="mask"><ellipse rx="1" ry="2"/></mask>'
                   '<marker id="marker"><polygon points="0,0 1,0 1,1"/></marker></defs>'
                   '<style>path { fill: url(#linear); }</style>'
                   '<g clip-path="url(#clip)"><line x1="0" y1="0" x2="1" y2="1"/>'
                   '<polyline points="0,0 1,1"/><use href="#shape" fill="url(#pattern)"/>'
                   '<text>Label <tspan>part</tspan><textPath href="#shape">curve</textPath></text></g>')
        for declaration in ['', ' xmlns="http://www.w3.org/2000/svg"']:
            self.assertIsNone(svg_source_issue('<svg' + declaration + '>' + content + '</svg>'))
        self.assertIsNone(svg_source_issue(
            '<s:SVG xmlns:s="http://www.w3.org/2000/svg" xmlns:l="http://www.w3.org/1999/xlink">'
            '<s:defs><s:PATH id="shape" d="M0 0L1 1"/></s:defs><s:use l:href="#shape"/></s:SVG>'))
        self.assertIsNone(svg_source_issue(
            '<svg xmlns="http://www.w3.org/2000/svg"><g xmlns=""><path d="M0 0L1 1"/>'
            '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg></g></svg>'))

    def test_cli_and_archive_guard_reject_foreign_content_without_echoing_payload(self):
        payload = ('<svg xmlns:h="http://www.w3.org/1999/xhtml"><h:iframe '
                   'srcdoc="&lt;script&gt;do-not-echo-foreign-fixture&lt;/script&gt;"/></svg>')
        ET.fromstring(payload)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'scripts').mkdir()
            (root / 'scripts/qa_source.py').write_bytes((ROOT / 'scripts/qa_source.py').read_bytes())
            subprocess.run(['git', 'init', '-q', str(root)], check=True, capture_output=True)
            (root / 'source.svg').write_text(payload, encoding='utf-8')
            result = subprocess.run([sys.executable, str(root / 'scripts/qa_source.py')],
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('unsupported element namespace', result.stdout)
            self.assertNotIn('do-not-echo-foreign-fixture', result.stdout + result.stderr)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            ArchiveBoundaryTests.fixture(root, {'source.svg': payload.encode('utf-8')})
            result = subprocess.run([sys.executable, '-O', str(ROOT / 'production/verify_source_archive.py'), str(root)],
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('public-source boundary checks', result.stderr)
            self.assertNotIn('do-not-echo-foreign-fixture', result.stdout + result.stderr)


class WindowsPathBoundaryTests(unittest.TestCase):
    def scan(self, text):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'source.txt').write_text(text, encoding='utf-8')
            return scan_sources(root, ['source.txt'])[0]

    def test_constructed_drive_unc_and_json_escaped_paths_are_rejected(self):
        backslash = chr(92)
        paths = [drive + ':' + separator + separator.join(['source-user', 'private.txt'])
                 for drive in ['C', 'q'] for separator in ['/', backslash]]
        paths += [backslash * 2 + backslash.join(['source-host', 'private-share', 'private.txt']),
                  backslash * 2 + '?' + backslash + 'Q:' + backslash + 'private.txt',
                  backslash * 2 + '?' + backslash + backslash.join(['UNC', 'source-host', 'share']),
                  backslash * 2 + '.' + backslash + 'source-device']
        for value in paths:
            for text in [value, 'path=' + value, json.dumps({'path': value}), '"' + value + '"', '[' + value + ']', '{' + value + '}']:
                with self.subTest(value=value, text=text):
                    self.assertEqual(self.scan(text), [('source.txt', 'machine workspace path')])

    def test_exact_quoted_generic_windows_default_is_the_only_allowance(self):
        generic = 'C:' + '/Windows'
        for quote in ['"', "'"]:
            self.assertEqual(self.scan(quote + generic + quote), [])
        for value in [generic, generic + '/..' + '/'.join(['', 'Users', 'source-user', 'file.txt']), generic + '/private.txt',
                      generic + 'Secret/file.txt', generic + '/Fonts', 'D:' + '/Windows',
                      'C:' + chr(92) + 'Windows', 'C:' + '/windows']:
            with self.subTest(value=value):
                self.assertTrue(self.scan('"' + value + '"' if value != generic else value))

    def test_urls_relative_paths_and_regex_escapes_do_not_match(self):
        for text in ['https://example.invalid/source.json', 'git+ssh://example.invalid/source',
                     'file:///tmp/public-source.txt', 'x://example.invalid/source',
                     'source/file.txt', './source/file.txt', '../source/file.txt',
                     'Q:relative.txt', 'source' + chr(92) + 'file.txt',
                     r'new RegExp("[\\s\\S]*?")', r'[\\p{Cc}\\p{Cf}\\r\\n\\t]', r'[\\p{Cc}\\p{Cf}\\u2028\\u2029]']:
            with self.subTest(text=text):
                self.assertEqual(self.scan(text), [])


class ArchiveBoundaryTests(unittest.TestCase):
    @staticmethod
    def fixture(root, payloads=None):
        payloads = payloads or {'source.txt': b'original source\n'}
        for name, data in payloads.items():
            target = root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        manifest = {
            'manifest_schema_version': '1.0', 'distribution': 'public_source_original_svg_only',
            'font_binaries_included': False, 'character_art_included': False,
            'source': {'commit': None, 'working_tree_dirty': True, 'reproducible_from_commit': False},
            'files': [{'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
                      for name, data in payloads.items()],
        }
        ArchiveBoundaryTests.write_manifest(root, manifest)
        return manifest

    @staticmethod
    def write_manifest(root, manifest):
        (root / 'SOURCE_MANIFEST.json').write_text(json.dumps(manifest), encoding='utf-8')

    def run_modes(self, root, valid, expected=None):
        modes = [([], None), (['-O'], None), (['-OO'], None), ([], '1'), ([], '2')]
        for flags, optimize in modes:
            with self.subTest(flags=flags, optimize=optimize):
                env = {key: value for key, value in os.environ.items() if key != 'PYTHONOPTIMIZE'}
                if optimize:
                    env['PYTHONOPTIMIZE'] = optimize
                result = subprocess.run([sys.executable, *flags, str(ROOT / 'production/verify_source_archive.py'), str(root)],
                                        env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode == 0, valid, result.stdout + result.stderr)
                if expected:
                    self.assertIn(expected, result.stderr)
        return result

    def assert_rejected_before_import(self, root):
        with patch.object(verifier.importlib.util, 'spec_from_file_location') as imported:
            with self.assertRaises((verifier.ArchiveValidationError, OSError)):
                verifier.verify_archive(root)
            imported.assert_not_called()

    def test_valid_source_passes_all_optimization_modes_without_writes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.fixture(root)
            before = {p.name: p.read_bytes() for p in root.iterdir()}
            self.run_modes(root, True)
            self.assertEqual({p.name: p.read_bytes() for p in root.iterdir()}, before)

    def test_modified_missing_unlisted_and_bad_metadata_fail_all_modes(self):
        for mutation in ['digest', 'size', 'missing', 'unlisted', 'distribution', 'dirty', 'reproducibility', 'duplicate']:
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                manifest = self.fixture(root)
                if mutation == 'digest': (root / 'source.txt').write_bytes(b'modified source\n')
                if mutation == 'size': (root / 'source.txt').write_bytes(b'short')
                if mutation == 'missing': (root / 'source.txt').unlink()
                if mutation == 'unlisted': (root / 'unlisted.txt').write_text('synthetic unlisted source')
                if mutation == 'distribution': manifest['distribution'] = 'unsupported'
                if mutation == 'dirty': manifest['source']['working_tree_dirty'] = 1
                if mutation == 'reproducibility': manifest['source']['reproducible_from_commit'] = True
                if mutation == 'duplicate': manifest['files'].append(manifest['files'][0])
                self.write_manifest(root, manifest)
                self.assert_rejected_before_import(root)
                self.run_modes(root, False)

    def test_commit_provenance_only_accepts_null_or_a_sha1_commit(self):
        for value in [None, 'a' * 40]:
            with self.subTest(commit=value), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                manifest = self.fixture(root)
                manifest['source']['commit'] = value
                self.write_manifest(root, manifest)
                self.run_modes(root, True)
        for value in ['', True, 123, [], {}, 'a' * 39, 'a' * 64, 'g' * 40,
                      'a' * 39 + chr(27), 'gh' + 'p_' + 'a' * 36]:
            with self.subTest(commit_type=type(value).__name__), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                manifest = self.fixture(root)
                manifest['source']['commit'] = value
                self.write_manifest(root, manifest)
                self.assert_rejected_before_import(root)
                result = self.run_modes(root, False, 'Invalid archive commit provenance')
                if isinstance(value, str) and value:
                    self.assertNotIn(value, result.stdout + result.stderr)

    def test_unsafe_manifest_paths_fail_before_source_reads_and_imports(self):
        slash = chr(92)
        paths = ['../outside.txt', '/outside.txt', './source.txt', 'a//source.txt',
                 'a/../source.txt', 'a/.. /outside.txt', 'source.txt.', 'source.txt ',
                 '', '.', 'SOURCE_MANIFEST.json', 'Q:' + '/outside.txt',
                 'Q:' + slash + 'outside.txt', slash * 2 + 'source-host' + slash + 'source.txt',
                 'source.txt:stream']
        for value in paths:
            with self.subTest(path=value), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                manifest = self.fixture(root)
                manifest['files'][0]['path'] = value
                self.write_manifest(root, manifest)
                with patch.object(Path, 'read_bytes', side_effect=AssertionError('must not read an unsafe target')):
                    self.assert_rejected_before_import(root)
                self.run_modes(root, False)

    def test_symlink_file_parent_manifest_and_unlisted_directory_fail_before_import(self):
        for kind in ['file', 'parent', 'manifest', 'unlisted-directory']:
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as temporary:
                base = Path(temporary)
                root = base / 'archive'; root.mkdir()
                outside = base / 'synthetic-outside'; outside.mkdir()
                (outside / 'source.txt').write_bytes(b'original source\n')
                manifest = self.fixture(root)
                if kind == 'file':
                    (root / 'source.txt').unlink()
                    (root / 'source.txt').symlink_to(outside / 'source.txt')
                if kind == 'parent':
                    (root / 'source.txt').unlink()
                    (root / 'nested').symlink_to(outside, target_is_directory=True)
                    manifest['files'][0]['path'] = 'nested/source.txt'
                    self.write_manifest(root, manifest)
                if kind == 'manifest':
                    (root / 'SOURCE_MANIFEST.json').rename(outside / 'manifest.json')
                    (root / 'SOURCE_MANIFEST.json').symlink_to(outside / 'manifest.json')
                if kind == 'unlisted-directory':
                    (root / 'unlisted').symlink_to(outside, target_is_directory=True)
                if kind != 'unlisted-directory':
                    with patch.object(Path, 'read_bytes', side_effect=AssertionError('must not read through a symlink')):
                        self.assert_rejected_before_import(root)
                else:
                    self.assert_rejected_before_import(root)
                self.run_modes(root, False)

    def test_valid_hash_does_not_bypass_source_boundary_under_optimization(self):
        sources = {'source.otf': b'synthetic forbidden font',
                   'source.svg': b'<svg><style>@im\\70ort "https://example.invalid/a.css";</style></svg>',
                   'source.txt': ('Q:' + chr(92) + 'source-user' + chr(92) + 'private.txt').encode()}
        for name, data in sources.items():
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                self.fixture(root, {name: data})
                self.run_modes(root, False, 'public-source boundary checks')

    def test_caller_supplied_guard_is_never_executed(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.fixture(root, {'scripts/qa_source.py': b'raise RuntimeError("caller source must never execute")\n'})
            self.run_modes(root, True)

    def test_errors_do_not_echo_untrusted_manifest_values(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest = self.fixture(root)
            marker = 'do-not-echo-manifest-fixture'
            manifest['files'][0]['path'] = '../' + marker
            self.write_manifest(root, manifest)
            result = self.run_modes(root, False)
            self.assertNotIn(marker, result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
