"""Exercise real cached OTF tampering and reproducible local TTC provenance, without network."""
from pathlib import Path
from contextlib import redirect_stdout, redirect_stderr
import hashlib
import io
import json
import shutil
import sys
import tempfile
from unittest.mock import patch
from fontTools.ttLib import TTFont, TTCollection
from fontTools.ttLib.tables.DefaultTable import DefaultTable
import setup_fonts

ROOT = Path(__file__).resolve().parents[1]

def run(arguments):
    stdout, stderr = io.StringIO(), io.StringIO()
    with patch.object(sys, 'argv', ['setup_fonts.py', *arguments]), redirect_stdout(stdout), redirect_stderr(stderr):
        result = setup_fonts.main()
    return result, stderr.getvalue()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def main(repository=ROOT):
    with tempfile.TemporaryDirectory(prefix='studio-font-provenance-') as temporary:
        root = Path(temporary)
        output = root / 'prepared'; output.mkdir()
        source = repository / 'typography/fonts'
        for kind,weight in setup_fonts.OFFICIAL_SHA256:
            name = f'Noto{kind}CJKSC-{weight}.otf'
            shutil.copyfile(source / name, output / name)
        manifest = output / 'prepared_font_manifest.json'
        entries = json.loads((source/'prepared_font_manifest.json').read_text(encoding='utf-8'))
        manifest.write_text(json.dumps(entries), encoding='utf-8')
        target = output / 'NotoSansCJKSC-Regular.otf'
        target.write_bytes(target.read_bytes() + b'unchanged-glyphs-but-modified-font')
        metadata = setup_fonts.verify(target, 'Sans', 'Regular')  # Old metadata-only verification accepts this.
        entries[target.name]['sha256'] = metadata['sha256']
        manifest.write_text(json.dumps(entries), encoding='utf-8'); before = manifest.read_bytes()
        status, error = run(['--output-dir', str(output), '--verify-only'])
        require(status == 1 and ('pinned official' in error or 're-extracted' in error), 'Forged cached font was not rejected: ' + error)
        require(manifest.read_bytes() == before, 'verify-only rewrote the forged manifest')
        if hashlib.sha256((source/target.name).read_bytes()).hexdigest() == setup_fonts.OFFICIAL_SHA256[('Sans','Regular')]:
            with patch.object(setup_fonts.urllib.request, 'urlopen', side_effect=lambda *args,**kwargs: io.BytesIO((source/target.name).read_bytes())):
                status, error = run(['--output-dir',str(output),'--download'])
        else:
            directories = sorted({str(Path(entry['source']).parent) for entry in entries.values() if entry.get('source_kind')=='local_ttc_extraction'})
            status, error = run(['--output-dir',str(output),*[value for directory in directories for value in ['--source-dir',directory]]])
        require(status == 0, 'Font preparation failed: ' + error)
        require(target.read_bytes() == (source/target.name).read_bytes(), 'Verified source recovery changed font bytes')
        print('Font provenance: modified valid-metadata OTF + forged manifest rejected; verified source recovery passed.')

        inputs = root / 'local-ttc'; inputs.mkdir()
        extracted = root / 'extracted'
        for kind,weight in setup_fonts.OFFICIAL_SHA256:
            font = TTFont(source/f'Noto{kind}CJKSC-{weight}.otf', lazy=True, recalcTimestamp=False)
            # A harmless unused table gives a noncanonical serialization without changing glyphs/names.
            table = DefaultTable('TEST'); table.data = b'local TTC provenance fixture only'
            font['TEST'] = table
            collection = TTCollection(); collection.fonts = [font]
            collection.save(inputs/f'Noto{kind}CJK-{weight}.ttc'); collection.close()
        status,error = run(['--source-dir',str(inputs),'--output-dir',str(extracted)])
        require(status == 0, 'Font preparation failed: ' + error)
        extracted_manifest = extracted / 'prepared_font_manifest.json'
        before = extracted_manifest.read_bytes()
        status,error = run(['--output-dir',str(extracted),'--verify-only'])
        require(status == 0 and extracted_manifest.read_bytes() == before, 'Local verify-only failed or rewrote the manifest: ' + error)
        local = json.loads(before)
        require(all(entry['source_kind']=='local_ttc_extraction' for entry in local.values()), 'Expected local TTC provenance')
        target = extracted / 'NotoSansCJKSC-Regular.otf'
        target.write_bytes(target.read_bytes() + b'modified-derived-target')
        local[target.name]['sha256'] = hashlib.sha256(target.read_bytes()).hexdigest()
        extracted_manifest.write_text(json.dumps(local), encoding='utf-8'); before = extracted_manifest.read_bytes()
        status,error = run(['--output-dir',str(extracted),'--verify-only'])
        require(status == 1 and 're-extracted' in error and extracted_manifest.read_bytes() == before, 'Forged derived font was not rejected without rewriting its manifest: ' + error)
        print('Font provenance: four real SC TTC faces reproduce; forged derived-target hash rejected against the recorded source.')


if __name__ == '__main__':
    main()
