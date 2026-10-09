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

## Current-cue narration clauses

`highlight_choices` and `reveal_scores` require positive evidence of the current
case in speech and captions; equal counts of an absent token are insufficient.
This is an explicit, machine-verifiable Chinese teaching-script contract, not a
natural-language truth checker. General definitions and explanations retain free-form narration; the identity-bearing actions below require positive evidence too.

- Choice cues require a clause for each current named player with that owner's
  exact current strategy. Supported verbs are 选 / 选择, optionally preceded by
  也 and/or 决定, followed by 了, and optionally followed by 牌 after the strategy.
- Score cues require each current named player's own Chinese-number score and 分.
  Supported verbs are 得 / 得到 / 获得 / 拿到 / 拿, optionally prefixed by 也 and
  suffixed by 了. Swapped owners, stale numbers and missing owners fail.
- Only equal scores may use a collective subject 两个人 / 两人 / 双方 / 他们,
  followed by 各 or 都 and a supported score verb. This preserves the shipped
  “两个人，各得三分。” without requiring redundant names.
- A subject may be followed by a comma. Clauses start at the beginning or after
  ，；。！？： and end at one of those marks or the end. Optional lead-ins 现在 /
  这时 / 其中 / 而 / 那么 are accepted. Names and strategies are literal data,
  including punctuation or regex metacharacters; no substring-name substitution.
- Authors may reorder the two owners, add introductory sentences, and mix these
  ordinary phrasings. The complete matched owner/predicate must fit on one subtitle
  line; exact voiceover/caption equality remains mandatory. This does not prescribe
  a full utterance, audio timing, or the surrounding non-cue explanation.

Additional wording requires an explicit mirrored grammar change and positive and
negative tests; a checker cannot safely infer arbitrary paraphrases, negation or
pronoun references. Manual editorial review still checks the entire explanation,
including contradictions outside the verified clauses. Tests cover paired stale
speech/captions with current metadata/cues, changed names/strategies/asymmetric
payoffs, customized wording, all three builders and normal/-O/-OO/environment
optimization modes, without altering tracked narration products.

`validateSubtitleLines` / `validate_subtitle_lines` validate a complete canonical
cue-bearing segment. `validateSubtitleChunk` / `validate_subtitle_chunk` are the
explicit partial-span API: layout, exact speech equality and protected tokens
still apply, but a partial chunk need not repeat every owner. Editorial uses that
API only after its full-block template-reference contract has verified the exact
current cell/owner token sequence; paired stale full-block speech/chunks fail that
contract before expansion. Canonical builders and timeline QA always use the
complete-segment API, with no opt-out flag.

### Other current-case identity cues

The canonical identity grammar also checks `introduce_players` (both current names
joined by 和 / 与 / 、, in either order), `show_two_actions` (选 / 选择 followed
by both current strategies, optionally suffixed by 牌 and joined by 或 / 或者 /
或是 / 和 / 与 / 、 with an optional comma), and
`map_actions_to_pure_strategies` (that strategy pair followed by 就是 / 是 / 作为,
optional 两个 / 两种, then 纯策略). Introductory and surrounding prose is free.
`show_multi_round_plan` checks 第一轮, optional comma, 选 / 选择 and the current
first strategy; the later-round plan remains editorial prose.

`introduce_matrix_rows` binds 行 to player A and `introduce_matrix_columns` binds
列 to B: “行，是甲方的选择”, “行表示甲方的选择” and
“甲方的选择对应行” illustrate the accepted 是 / 表示 / 代表 / 对应 and reverse
在 / 对应 forms. `introduce_score_order` checks 先读 / 先看 A 的得分，
再 / 然后 读 / 看 B 的得分 in that order. Axis and score-order bindings end at
clause punctuation or the end of speech. Literal names and strategies remain
escaped, and ordinary subtitle protections still prohibit splitting them.
These finite patterns establish presence of the required identities and bindings,
not the absence of every possible contradiction or arbitrary paraphrase.

Editorial retains its separate full-block template-token contract: participant
introductions, alternatives, pure strategies and first-round-plan blocks must
retain their current data references, alongside the existing axis, score-order,
choice and payoff blocks. Partial subtitle chunks do not individually have to
repeat a full block's identities. Unreferenced general prose remains free-form.
