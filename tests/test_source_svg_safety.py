"""Parse-only SVG publication checks; fixtures are never rendered or executed."""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from qa_source import scan_sources, svg_source_issue


class SvgEventAttributeTests(unittest.TestCase):
    def assert_well_formed_issue(self, source, expected):
        # A malformed namespace must not masquerade as event-handler detection.
        ET.fromstring(source)
        self.assertEqual(svg_source_issue(source), expected)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for suffix in ['svg', 'SVG', 'sVg']:
                name = 'source.' + suffix
                (root / name).write_text(source, encoding='utf-8')
                errors, total = scan_sources(root, [name])
                self.assertEqual(errors, [(name, expected)] if expected else [])
                self.assertEqual(total, len(source.encode('utf-8')))

    def test_event_attributes_rejected_on_root_and_nested_shapes(self):
        for attribute in ['onload', 'onclick', 'OnLoad', 'ONCLICK', 'oNPoInTeRdOwN',
                          'event:onload', 'event:OnClick', 'event:ONBEGIN']:
            for value in ['', 'return false']:
                for template in [
                    '<svg xmlns:event="urn:svg-safety-test" {attribute}="{value}">'
                    '<path d="M0 0 L10 10"/></svg>',
                    '<s:SVG xmlns:s="http://www.w3.org/2000/svg" '
                    'xmlns:event="urn:svg-safety-test"><s:g>'
                    '<s:rect width="10" height="10" {attribute}="{value}"/>'
                    '</s:g></s:SVG>',
                ]:
                    with self.subTest(attribute=attribute, value=value, template=template):
                        source = template.format(attribute=attribute, value=value)
                        self.assert_well_formed_issue(source, 'SVG has an event-handler attribute')

    def test_unrecognized_on_prefix_is_rejected_conservatively(self):
        for attribute in ['on', 'onfutureevent', 'event:OnFutureEvent']:
            with self.subTest(attribute=attribute):
                source = ('<svg xmlns:event="urn:svg-safety-test">'
                          f'<circle cx="5" cy="5" r="3" {attribute}=""/></svg>')
                self.assert_well_formed_issue(source, 'SVG has an event-handler attribute')

    def test_original_paths_shapes_and_local_references_remain_allowed(self):
        sources = [
            '<svg><path d="M0 0 L10 10" stroke="blue"/><rect width="4" height="5"/>'
            '<circle cx="2" cy="2" r="1"/></svg>',
            '<s:svg xmlns:s="http://www.w3.org/2000/svg" '
            'xmlns:link="http://www.w3.org/1999/xlink"><s:defs>'
            '<s:path id="shape" d="M0 0 L10 10"/></s:defs>'
            '<s:use link:href="#shape" fill="url(#shape)"/></s:svg>',
            '<SVG xmlns:meta="urn:svg-safety-test"><title>onload onclick</title>'
            '<PATH d="M0 0 L10 10" data-onload="description" '
            'data-onclick="description" meta:caption="onload"/></SVG>',
        ]
        for source in sources:
            with self.subTest(source=source):
                self.assert_well_formed_issue(source, None)

    def test_malformed_xml_has_a_distinct_failure(self):
        self.assertEqual(svg_source_issue('<svg><shape:onload/></svg>'),
                         'SVG is not well-formed XML')

    def test_source_cli_rejects_event_attribute_without_printing_its_value(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            scripts = root / 'scripts'
            scripts.mkdir()
            (scripts / 'qa_source.py').write_bytes((ROOT / 'scripts/qa_source.py').read_bytes())
            subprocess.run(['git', 'init', '-q', str(root)], check=True, capture_output=True)
            source = '<svg><path d="M0 0 L10 10" onclick="event-fixture-never-execute"/></svg>'
            ET.fromstring(source)
            (root / 'original.svg').write_text(source, encoding='utf-8')
            result = subprocess.run([sys.executable, str(scripts / 'qa_source.py')],
                                    cwd=root, capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertIn('FAIL original.svg: SVG has an event-handler attribute', result.stdout)
            self.assertNotIn('event-fixture-never-execute', result.stdout + result.stderr)

    def test_public_pack_rejects_events_without_replacing_existing_archive(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for relative in ['scripts/qa_source.py', 'production/pack_source.py']:
                target = root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((ROOT / relative).read_bytes())
            subprocess.run(['git', 'init', '-q', str(root)], check=True, capture_output=True)
            archive = root / 'production/output/game_theory_studio_public_source.zip'
            archive.parent.mkdir()
            archive.write_bytes(b'preserve-existing-archive')
            for suffix in ['svg', 'SVG', 'sVg']:
                with self.subTest(suffix=suffix):
                    source = ('<s:svg xmlns:s="http://www.w3.org/2000/svg" '
                              'xmlns:event="urn:svg-safety-test">'
                              '<s:path d="M0 0 L10 10" event:OnClick="return false"/></s:svg>')
                    ET.fromstring(source)
                    target = root / ('original.' + suffix)
                    target.write_text(source, encoding='utf-8')
                    result = subprocess.run([sys.executable, str(root / 'production/pack_source.py'),
                                             '--public'], cwd=root, capture_output=True, text=True)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn(target.name, result.stderr)
                    self.assertIn('SVG has an event-handler attribute', result.stderr)
                    self.assertEqual(archive.read_bytes(), b'preserve-existing-archive')
                    target.unlink()


class SourceCheckoutGuidanceTests(unittest.TestCase):
    def test_no_git_failure_points_to_main(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            scripts = root / 'scripts'
            scripts.mkdir()
            (scripts / 'qa_source.py').write_bytes((ROOT / 'scripts/qa_source.py').read_bytes())
            result = subprocess.run([sys.executable, str(scripts / 'qa_source.py')],
                                    cwd=root, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('requires a Git checkout', result.stderr)
            self.assertIn('git clone --branch main ', result.stderr)
            self.assertNotIn('infra/quality-pipeline', result.stderr)


if __name__ == '__main__':
    unittest.main()
