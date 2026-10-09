#!/usr/bin/env python3
"""Scan only this repository's candidate source files, never ignored/private folders."""
from pathlib import Path, PurePosixPath, PureWindowsPath
import re
import subprocess
import sys
import unicodedata
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
MAX_SOURCE_BYTES = 1024 * 1024
forbidden_suffixes = {'.otf', '.ttf', '.ttc', '.woff', '.woff2', '.mp4', '.mov', '.webm', '.wav', '.mp3', '.zip', '.png', '.jpg', '.jpeg', '.webp', '.pem', '.key', '.p12', '.pfx'}
patterns = {
    'private key': re.compile(r'-----BEGIN (?:[A-Z ]+)?PRIVATE' + r' KEY-----'),
    'GitHub credential': re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b'),
    'AWS access credential': re.compile(r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'),
    'Slack credential': re.compile(r'\bxox[baprs]-[A-Za-z0-9-]{20,}\b'),
    'OpenAI credential': re.compile(r'\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{30,}\b'),
    'machine workspace path': re.compile(
        # A standalone Unix root, not a URL path or repository-relative suffix.
        # The first component can end at a delimiter or EOF, without a slash.
        r'(?<![\w+./\\:~%-])/(?:workspace|home|Users|root)/[A-Za-z0-9_.-]+'
        r'''(?:/|(?=$|[\s"'`,;:)\]}<>|&]))'''
        # A drive root, including JSON-escaped backslashes; not a URL scheme.
        r'|(?<![\w+./\\:-])[A-Za-z]:(?:\\+|/(?!/))'
        # Backslash UNC shares and extended/device paths, also JSON-escaped.
        r'|(?<![\w/\\])\\{2,}'
        # A regex character class ending in conventional escapes is not a share.
        r'(?!(?:(?:[sSdDwWnrtabfv]|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2})\\+)'
        r'+(?:[sSdDwWnrtabfv]|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2})\])'
        r'(?:[?.]\\|[\w.-]+\\+[^\\/\s\"\'<>|*?\[\]{}]+)'),
    'internal note reference': re.compile(r'/(?:agent_notes|user_notes)/|dream' + r'_notes'),
}

# This exact quoted OS default is portable, not a user's workspace. No prefix
# allowance: any additional path segment (including traversal) is still scanned.
GENERIC_WINDOWS_ROOT = re.compile(r"""(['\"])""" + "C:" + r"/Windows\1")

# Deliberately bounded CSS, not a general CSS parser or SVG sanitizer. See
# docs/public-source-boundaries.md before extending this publication subset.
LOCAL_SVG_URL = re.compile(
    r"""url\s*\(\s*(?:\#[^\s'"()<>\\]+|'\#[^\s'"()<>\\]+'|"\#[^\s'"()<>\\]+")\s*\)""", re.I)
NUMERIC_SVG_FUNCTION = re.compile(
    r'(?:matrix|translate|scale|rotate|skewX|skewY|rgb|rgba|hsl|hsla)\s*\([-+.0-9eE%,/\s]+\)', re.I)


SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
# Every element must belong to this static subset, in SVG's exact namespace or
# no namespace. Foreign and future/unknown elements must not pass by omission.
STATIC_SVG_ELEMENTS = frozenset({
    'svg', 'g', 'defs', 'symbol', 'use', 'path', 'rect', 'circle', 'ellipse',
    'line', 'polyline', 'polygon', 'text', 'tspan', 'textpath', 'title', 'desc',
    'style', 'lineargradient', 'radialgradient', 'stop', 'pattern', 'clippath',
    'mask', 'marker',
})


def svg_css_issue(css):
    """Only literal local URLs and numeric color/geometry functions are allowed."""
    if '\\' in css or '/*' in css or '*/' in css:
        return 'SVG has unsupported CSS escapes or comments'
    if '@' in css:
        return 'SVG has an unsupported CSS at-rule'
    remainder = LOCAL_SVG_URL.sub('', css)
    if re.search(r'url\s*\(', remainder, re.I):
        return 'SVG has a nonlocal or malformed resource reference'
    remainder = NUMERIC_SVG_FUNCTION.sub('', remainder)
    if '(' in remainder or ')' in remainder:
        return 'SVG has an unsupported CSS function or construct'
    return None


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
        namespace = element.tag[1:].split('}', 1)[0] if element.tag.startswith('{') else ''
        if namespace not in {'', SVG_NAMESPACE}:
            return 'SVG has an unsupported element namespace'
        if local_name(element.tag) in {'image', 'feimage', 'script', 'foreignobject'}:
            return 'SVG has script, embedded image, or foreign content'
        if local_name(element.tag) in {'animate', 'animatemotion', 'animatetransform', 'set', 'discard'}:
            return 'SVG has unsupported animation or resource-changing content'
        if local_name(element.tag) not in STATIC_SVG_ELEMENTS:
            return 'SVG has an unsupported static element'
        for name, value in element.attrib.items():
            attribute = local_name(name)
            if attribute == 'base':
                return 'SVG has an unsupported base URI'
            if attribute.startswith('on'):
                return 'SVG has an event-handler attribute'
            if attribute == 'href' and value.strip() and not value.strip().startswith('#'):
                return 'SVG has a nonlocal resource reference'
        # Style text and decoded attributes can contain CSS. Ordinary visible
        # SVG text is not CSS and may contain punctuation such as parentheses.
        css_values = list(element.attrib.values())
        if local_name(element.tag) == 'style':
            if len(element):
                return 'SVG has unsupported nested stylesheet content'
            css_values.append(element.text or '')
        for css in css_values:
            issue = svg_css_issue(css)
            if issue:
                return issue
    return None


# Win32 resolves these names as devices even when an extension is appended.
WINDOWS_RESERVED_NAMES = {'CON', 'PRN', 'AUX', 'NUL', 'CONIN$', 'CONOUT$'} | {
    prefix + suffix for prefix in ('COM', 'LPT') for suffix in '123456789¹²³'
}


def portable_path_collision(name, seen):
    """Reject NFC/case-folded member and directory aliases, including file/dir clashes."""
    parts = name.split('/')
    portable_parts = [unicodedata.normalize('NFC', unicodedata.normalize('NFC', part).casefold())
                      for part in parts]
    for count in range(1, len(parts) + 1):
        prefix = '/'.join(parts[:count])
        identity = (prefix, count == len(parts))
        key = '/'.join(portable_parts[:count])
        if key in seen and seen[key] != identity:
            return True
        seen[key] = identity
    return False


def validate_source_path(name):
    """Portable checkout path contract, shared with the public source packer.

    The standalone verifier keeps its independent pre-import implementation;
    regression tests enforce parity without executing caller-supplied code.
    """
    if not isinstance(name, str) or not name:
        raise ValueError('Unsafe public source filename')
    relative = PurePosixPath(name)
    if (relative.is_absolute() or PureWindowsPath(name).drive or
            any(character in '<>:"\\|?*' for character in name) or
            any(part in {'', '.', '..'} or part.endswith((' ', '.')) for part in name.split('/')) or
            any(ord(character) < 32 for character in name) or relative.as_posix() != name or
            any(part.partition('.')[0].rstrip(' ').upper() in WINDOWS_RESERVED_NAMES for part in name.split('/'))):
        raise ValueError('Unsafe public source filename')
    if name.split('/')[0].casefold() == 'source_manifest.json':
        raise ValueError('Reserved public source manifest filename')


def scan_sources(root, files):
    errors = []
    total = 0
    # Consume iterators once and reject the entire candidate namespace before
    # inspecting any candidate, including otherwise harmless earlier entries.
    files = list(files)
    portable_paths = {}
    for relative in files:
        try:
            validate_source_path(relative)
        except ValueError as error:
            errors.append((repr(relative), str(error)))
            continue
        if portable_path_collision(relative, portable_paths):
            errors.append((repr(relative), 'Public source filenames collide after portable normalization'))
    if errors:
        return errors, total
    for relative in files:
        file = root / relative
        if file.is_symlink() or any(parent.is_symlink() for parent in file.parents if parent != root and root in parent.parents):
            errors.append((relative, 'symlinks are not source artifacts')); continue
        if not file.is_file():
            errors.append((relative, 'nonregular or missing source candidate')); continue
        if file.suffix.lower() in forbidden_suffixes or file.name.startswith('.env') or any(part in {'node_modules', 'private_characters'} for part in Path(relative).parts):
            errors.append((relative, 'forbidden source file type/path')); continue
        if file.stat().st_size > MAX_SOURCE_BYTES:
            errors.append((relative, 'source file exceeds 1 MiB')); continue
        # Bound allocation even if the regular file grows after stat. These
        # path checks are not an OS sandbox or an atomic filesystem snapshot;
        # concurrent path replacement remains outside this guard's guarantees.
        with file.open('rb') as stream:
            data = stream.read(MAX_SOURCE_BYTES + 1)
        total += len(data)
        if len(data) > MAX_SOURCE_BYTES:
            errors.append((relative, 'source file exceeds 1 MiB')); continue
        if b'\0' in data: errors.append((relative, 'binary content')); continue
        try: text = data.decode('utf-8')
        except UnicodeDecodeError:
            errors.append((relative, 'non-UTF-8 source')); continue
        for label, pattern in patterns.items():
            candidate = GENERIC_WINDOWS_ROOT.sub('', text) if label == 'machine workspace path' else text
            if pattern.search(candidate): errors.append((relative, label))
        if file.suffix.lower() == '.svg':
            issue = svg_source_issue(text)
            if issue: errors.append((relative, issue))
    return errors, total


def main():
    repository = subprocess.run(['git', 'rev-parse', '--show-toplevel'], cwd=ROOT, capture_output=True, text=True)
    if repository.returncode or Path(repository.stdout.strip()).resolve() != ROOT.resolve():
        raise SystemExit('Source QA requires a Git checkout. Public ZIP is an archive, not a development checkout. '
                         'Run python3 production/verify_source_archive.py on an unchanged extraction for integrity; '
                         'git clone --branch main https://github.com/trainMyBrain233/game-theory-studio.git for npm test.')
    output = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT)
    try:
        files = sorted(set(x.decode('utf-8') for x in output.split(b'\0') if x))
    except UnicodeDecodeError:
        raise SystemExit('Public source filenames must be UTF-8') from None
    errors, total = scan_sources(ROOT, files)
    if errors:
        for file, reason in errors: print(f'FAIL {file}: {reason}')
        sys.exit(1)
    print(f'Source QA: {len(files)} source files, {total:,} bytes; no detected credentials, private paths, binaries, embedded SVG images, or oversized source files.')
    print('Pattern checks are a safeguard, not a guarantee; manually review the diff before publishing.')


if __name__ == '__main__':
    main()
