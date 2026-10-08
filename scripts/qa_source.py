#!/usr/bin/env python3
"""Scan only this repository's candidate source files, never ignored/private folders."""
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
forbidden_suffixes = {'.otf', '.ttf', '.ttc', '.woff', '.woff2', '.mp4', '.mov', '.webm', '.wav', '.mp3', '.zip', '.png', '.jpg', '.jpeg', '.webp', '.pem', '.key', '.p12', '.pfx'}
patterns = {
    'private key': re.compile(r'-----BEGIN (?:[A-Z ]+)?PRIVATE' + r' KEY-----'),
    'GitHub credential': re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b'),
    'AWS access credential': re.compile(r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'),
    'Slack credential': re.compile(r'\bxox[baprs]-[A-Za-z0-9-]{20,}\b'),
    'OpenAI credential': re.compile(r'\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{30,}\b'),
    'machine workspace path': re.compile(r'/(?:workspace|home|Users|root)/[A-Za-z0-9_.-]+/'),
    'internal note reference': re.compile(r'/(?:agent_notes|user_notes)/|dream' + r'_notes'),
}

def svg_source_issue(text):
    """Inspect parsed names/decoded attributes, independent of prefixes and case."""
    if re.search(r'<!\s*(?:DOCTYPE|ENTITY)\b|<\?xml-stylesheet\b', text, re.I):
        return 'SVG has an unsupported declaration or stylesheet reference'
    try:
        document = ET.fromstring(text)
    except ET.ParseError:
        return 'SVG is not well-formed XML'
    local_name = lambda name: name.rsplit('}', 1)[-1].casefold()
    if local_name(document.tag) != 'svg':
        return 'SVG root is not svg'
    for element in document.iter():
        if local_name(element.tag) in {'image', 'feimage', 'script', 'foreignobject'}:
            return 'SVG has script, embedded image, or foreign content'
        for name, value in element.attrib.items():
            if local_name(name) == 'href' and value.strip() and not value.strip().startswith('#'):
                return 'SVG has a nonlocal resource reference'
        css = ' '.join([element.text or '', *element.attrib.values()])
        if re.search(r'@import\b', css, re.I):
            return 'SVG has a stylesheet import'
        for reference in re.findall(r'url\s*\((.*?)\)', css, re.I | re.S):
            if not reference.strip().strip('\'"').strip().startswith('#'):
                return 'SVG has a nonlocal resource reference'
    return None

def scan_sources(root, files):
    errors = []
    total = 0
    for relative in files:
        file = root / relative
        if file.is_symlink() or any(parent.is_symlink() for parent in file.parents if parent != root and root in parent.parents):
            errors.append((relative, 'symlinks are not source artifacts')); continue
        if not file.is_file(): continue
        if file.suffix.lower() in forbidden_suffixes or file.name.startswith('.env') or any(part in {'node_modules', 'private_characters'} for part in Path(relative).parts):
            errors.append((relative, 'forbidden source file type/path')); continue
        data = file.read_bytes(); total += len(data)
        if len(data) > 1024 * 1024: errors.append((relative, 'source file exceeds 1 MiB'))
        if b'\0' in data: errors.append((relative, 'binary content')); continue
        try: text = data.decode('utf-8')
        except UnicodeDecodeError:
            errors.append((relative, 'non-UTF-8 source')); continue
        for label, pattern in patterns.items():
            if pattern.search(text): errors.append((relative, label))
        if file.suffix.lower() == '.svg':
            issue = svg_source_issue(text)
            if issue: errors.append((relative, issue))
    return errors, total


def main():
    output = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT)
    files = sorted(set(x.decode('utf-8') for x in output.split(b'\0') if x))
    errors, total = scan_sources(ROOT, files)
    if errors:
        for file, reason in errors: print(f'FAIL {file}: {reason}')
        sys.exit(1)
    print(f'Source QA: {len(files)} source files, {total:,} bytes; no detected credentials, private paths, binaries, embedded SVG images, or oversized source files.')
    print('Pattern checks are a safeguard, not a guarantee; manually review the diff before publishing.')


if __name__ == '__main__':
    main()
