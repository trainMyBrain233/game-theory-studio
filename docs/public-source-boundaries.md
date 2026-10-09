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
python3 -m unittest discover -s tests -p test_public_source_boundaries.py
python3 -m unittest discover -s tests -p test_source_svg_safety.py
python3 scripts/qa_source.py
```
