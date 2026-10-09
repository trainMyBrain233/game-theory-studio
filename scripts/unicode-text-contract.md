# Shared text contract

JavaScript and Python consume `unicode-text-15.0.0.json`. The supported repertoire is
Unicode 15.0 assigned scalar values, excluding private-use characters. Unassigned,
surrogate, private-use and later-version characters fail explicitly rather than
silently counting as zero. Glyph/font availability is a separate rendering check.

- Readable length is the number of Unicode 15.0 General_Category L* or N* code points.
  Accented letters, extended Han, non-ASCII digits, letter numbers and other numbers
  count. Spaces, punctuation, combining marks and symbols do not. This is a code-point
  metric, not a grapheme count or a reading-speed claim. The limit is 22 per line.
- Labels must be trimmed, contain a letter or number, and exclude category C*, Zl,
  Zp and Default_Ignorable_Code_Point. Labels compare after NFKC plus space collapsing.
  Subtitle lines use the same explicit single-line safety checks.
- Python 3.12+ (Unicode 15.0+) and Node 22+ are required. Labels reject unsupported
  scalars **before** calling the standard NFKC API. Thus [UAX #15 normalization
  stability](https://www.unicode.org/reports/tr15/#Versioning_and_Stability) applies
  across supported runtimes; counting never uses their potentially newer UCD.
- Canonical subtitles preserve the exact voiceover, permit breaks only after authored
  clause punctuation, and keep current-case player/strategy names and cue-derived
  choice/result phrases whole, including punctuation inside a label. They must fit
  one or two lines; authors must shorten an indivisible overlong clause.

The generator records its sources in the JSON. The category ranges come from
CPython's Unicode 15.0 `unicodedata`; the Default_Ignorable_Code_Point ranges come from
[Unicode 15.0 DerivedCoreProperties](https://www.unicode.org/Public/15.0.0/ucd/DerivedCoreProperties.txt).
It downloads nothing. Only regeneration requires that exact UCD (Python 3.12):

    python3 scripts/build_unicode_text_data.py --check
    python3 scripts/build_unicode_text_data.py

Updating the supported Unicode version is an explicit contract change: update the
generator and ignorable ranges, regenerate the data, raise normalization runtime
minimums if necessary, and run cross-language and 22/23-character regression tests.
The Unicode-derived table and the generator's copied ignorable ranges retain the
[complete Unicode 15-era data notice](../docs/licenses/Unicode-15.0.0.txt).
Its verified historical source is the first Unicode notice in the official
[ICU release-72-1 license](https://raw.githubusercontent.com/unicode-org/icu/release-72-1/icu4c/LICENSE),
whose [matching property data](https://raw.githubusercontent.com/unicode-org/icu/release-72-1/icu4c/source/data/unidata/DerivedCoreProperties.txt)
identifies Unicode 15.0.0 (2022). The moving unicode.org/license.txt now contains a
later license; it is not used as the historical notice. Preserve the included
notice when distributing the table or its derived ranges. See the
[third-party boundary](../docs/third-party-content.md#unicode-150-属性数据与生成工具)
for the distinction between Unicode data, the project's MIT code and Python tooling.
