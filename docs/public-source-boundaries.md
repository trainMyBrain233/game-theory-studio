# Public source boundary

`python3 scripts/qa_source.py` scans Git-tracked and nonignored source candidates.
It reports the candidate filename and the violated rule, never the matched secret
or private path. These checks supplement manual provenance and diff review; they
are not a general secret detector or an SVG sanitizer.

## Static SVG subset

Public SVGs contain original vector paths/shapes and literal local fragment
references, including `href="#shape"`, `fill="url(#shape)"`, and equivalent ordinary
inline or stylesheet declarations. Quoted local URL fragments, numeric RGB/HSL
colors, and numeric matrix/translate/scale/rotate/skew transforms are supported.
Ordinary visible text is not interpreted as CSS.


Every element must use either the exact, case-sensitive namespace URI
`http://www.w3.org/2000/svg` or no namespace. Prefixes do not change that rule;
foreign default namespaces, nested foreign namespace resets, and lookalike or
case-modified namespace URIs are rejected. Nested resets to no namespace remain
supported only for the same static element subset.

The complete element allowlist is `svg`, `g`, `defs`, `symbol`, `use`, `path`,
`rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `text`, `tspan`,
`textPath`, `title`, `desc`, `style`, `linearGradient`, `radialGradient`, `stop`,
`pattern`, `clipPath`, `mask`, and `marker`. Local element names are checked
case-insensitively for compatibility with existing source fixtures. Every other
element is rejected, even in the SVG namespace or with no namespace. This
excludes HTML iframe/srcdoc payloads and unknown or future elements without
relying on a growing list of dangerous tag names.

The guard deliberately rejects CSS backslash escapes (including XML-decoded
backslashes), CSS comments, all at-rules, and functions/parenthesized constructs
outside that small numeric/local-URL subset. Unsupported CSS is rejected rather
than decoded with a partial CSS parser. Style elements cannot contain nested XML
content. Resource references must be literal, complete local-fragment URLs.

Images, scripts, foreign content, event-handler attributes, base URI attributes,
and animation/resource-changing elements (`animate`, `animateMotion`,
`animateTransform`, `set`, `discard`) are rejected. A base URI could turn a local
fragment into an external reference; animation could replace a validated value.
Keep new public art inside this static subset instead of broadening it implicitly.

## Machine paths

The path safeguard covers Unix workspace/home paths, Windows drive-root paths
with forward or backward separators, backslash UNC shares, and extended/device
paths. Backslash forms are detected in their ordinary and JSON-escaped spellings.
URL schemes, relative paths, and common source regex escape sequences are not
machine paths. Protocol-relative URLs are not classified as Windows UNC paths.

The sole Windows exception is the exact, matching-quoted generic OS default
formed by drive `C:` and `/Windows`. This preserves the portable font-discovery
fallback. It is not a prefix exception: appended directories, parent traversal,
different drives/case/separators, and an unquoted form are still rejected.
Negative tests construct synthetic paths at runtime so they do not publish real
machine-specific paths or require broader exclusions for test files.

## ZIP creation and portable member names

`production/pack_source.py --public` validates the complete Git candidate-name
list before selecting files, reading payloads, building a manifest, or opening a
ZIP. Rejection leaves any previous archive unchanged and creates no temporary
ZIP. The checks remain enabled under Python optimization.

Writer and verifier enforce the same dependency-free canonical filename rules:
relative POSIX paths only; no backslashes, absolute/drive/UNC forms, colon streams,
empty/dot/parent segments, ASCII control characters, trailing dots/spaces, or
Windows-forbidden filename characters (`<`, `>`, `"`, `|`, `?`, `*`). Windows device
basenames are rejected in any component, case-insensitively and with extensions:
`CON`, `NUL`, `AUX`, `PRN`, `CONIN$`, `CONOUT$`, `COM1`–`COM9`, `LPT1`–`LPT9`, and
Windows' superscript ¹/²/³ port aliases. Spaces before an extension do not evade
that rule. The top-level `SOURCE_MANIFEST.json` name and its case variants are
reserved, including attempts to use that name as a directory.

Every complete member name and directory prefix must remain unambiguous under
per-component NFC Unicode normalization and case folding (normalized again after
folding). Canonically equivalent Unicode names, file aliases, directory aliases,
and file/directory collisions are rejected. Original filenames are not rewritten;
Chinese names remain supported. This is deliberately stricter than some
case-sensitive filesystems.

These bounded checks do not model every filesystem or extractor transformation,
such as legacy short-name aliases or tool-specific filename decoding. They do
not establish universal extraction safety for every platform or utility.

Contract parity tests keep the writer and verifier aligned without importing
archive-provided code before verification. Unsafe fixtures are inspected as ZIP
metadata or normalized in memory; only valid archives are extracted, inside
contained temporary test directories. Filename errors do not echo the unsafe
name or its contents.

## Producer integrity and complete source snapshots

Every candidate returned by Git must exist as a regular file. The writer checks
all path components with `lstat` before any source reads and rejects dangling,
file, directory, or parent symlinks/junctions, FIFOs and other special files,
directories, and missing candidates. Nothing is silently filtered out. If a
tracked source was intentionally deleted, stage that deletion before packaging
(for example, `git add -u`); the resulting dirty source archive records that state.

The writer checks the public boundary on both the live candidates and the exact
captured payload bytes. Before publication it rereads candidate membership,
provenance, regular-file status and bytes, rejecting any observed change. A clean
successful archive includes every Git candidate and can be verified after
extraction; the producer's commit field uses the verifier's SHA-1 contract.
A reproducibility claim independently compares the complete captured membership
and raw Git blob content hashes with the recorded HEAD tree (ignoring replacement
refs), rather than trusting
index flags, cached file sizes/mtimes, or `git status` alone. Valid snapshots that
differ from HEAD remain publishable with `working_tree_dirty: true` and
`reproducible_from_commit: false`, even when Git status hides those differences.
No index flags or working-tree files are changed by this check. This is a raw-byte
contract: checkout filters or line-ending conversion can also make a snapshot
differ from HEAD and therefore mark it dirty.

CRC validation, unique/exact ZIP membership, complete payload/manifest byte
read-back, and the exclusive 15 MiB archive limit are explicit runtime checks.
They run under normal Python, `-O`, `-OO`, and `PYTHONOPTIMIZE`. Any rejection
removes the temporary ZIP and preserves the existing regular archive. Publication
uses atomic replacement only after every check succeeds.

Every output directory component must be a nonsymlinked directory contained in
the checkout. Existing output symlinks/junctions and nonregular destinations are
rejected; an existing regular destination is atomically replaced, never edited
in place. Output containment is checked before temporary-ZIP creation and again
before replacement.

This workflow assumes a nonhostile local filesystem. These path checks are not
descriptor-relative race protection against a concurrent adversary swapping
symlinks, mounts or paths between checks. Do not package while another process
is maliciously changing the checkout or output directories.

## Extracted archive verification

`python3 production/verify_source_archive.py [directory]` verifies a manifest and
source bytes without Git, dependency installation, fonts, or rendering. The same
validation runs with `python3 -O`, `python3 -OO`, and `PYTHONOPTIMIZE`.

Manifest paths must be canonical relative POSIX names, without traversal,
backslashes, drive prefixes, alternate-stream colons, control characters, or
trailing-dot/space aliases. Resolved source paths must stay within the archive.
Manifest/file types, flags, provenance, byte sizes, SHA-256 content hashes, and the
complete file inventory are validated explicitly. Commit provenance is either
null (unborn checkout) or a lowercase 40-hex Git SHA-1 commit; Git SHA-256 repository
provenance is not currently supported. All archive files and parent directories
must be nonsymlinked; special files and unlisted files are rejected. These checks
finish before loading the verifier's adjacent source guard. A caller-supplied
archive guard is never imported by an external trusted verifier.

This establishes byte consistency and the public-source boundary, not publisher
authenticity. A manifest distributed alongside the source is not a signature.
Use a trusted verifier and trusted distribution source; an altered verifier
cannot establish its own trustworthiness.

Run the dependency-free regression suite with:

```sh
python3 -m unittest discover -s tests -p test_source_archive_integrity.py
python3 -m unittest discover -s tests -p test_source_archive_paths.py
python3 -m unittest discover -s tests -p test_public_source_boundaries.py
python3 -m unittest discover -s tests -p test_source_svg_safety.py
python3 scripts/qa_source.py
```
