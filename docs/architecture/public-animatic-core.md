# Public animatic components: stage one

This is a small, reusable public component harness for a two-player/two-strategy
lesson. It does not replace the existing production renderer or reproduce a
complete episode. The default episode, tabletop and archived examples retain
all existing behavior and tests.

## Acceptance boundaries

A pass means the same public semantic and rendering modules work with original
synthetic transparent avatars in a checkout with no private asset directory.
It does **not** establish a finished episode's character artwork, hand motion,
full-film composition, encoding, playback or human voice alignment. No private
pixels, identity hashes, asset manifests or private QA reports are inputs.
The five-block test fixture is deliberately short and asymmetric. Its 360
frames are a test schedule, never a recording duration recommendation.

All times are integer frames at 30fps, in a fixed 1920×1080 canvas. Every block
and subtitle window is half-open: `[startFrame, endFrame)`. The valid render
range is `0 <= frame < durationFrames`; the terminal endpoint is rejected.
Schema 1.1 accepts only `synthetic_test_only` and
`manual_reference_not_audio_aligned` schedules. `audioTiming` must remain null. Actual audio
alignment needs a separate explicit contract and future tests.

## Modules and the single state source

- `schemas/animatic-plan.schema.json` rejects unsupported geometry/fps, unknown
  fields/actions and malformed input before any draw.
- `production/src/animatic/semantic-state.mjs` exports `compilePlan(plan)` and
  `resolveFrame(compiled, frame)`. It has no Canvas, filesystem, wall-clock,
  asset lookup or previous-frame state. Compilation defensively copies and
  freezes the case, subtitles and events.
- `production/src/animatic/render-frame.mjs` is a fixed public compositor. Its
  exported subtitle and matrix components consume the resolved state; the
  compositor never independently infers semantic state from block numbers.
- `production/src/animatic/avatar.mjs` defines an injected drawing adapter and
  a pure absolute-frame avatar transition sampler.
- `production/src/animatic/raster-cache.mjs` provides a bounded exact-frame
  cache owned by one captured render session.

The case defines A as row / payoff index 0 and B as column / index 1. Matrix
values live only in `caseData.values`. A `reveal_score` event names its cell
and owner and does not contain another copy of the value. Every cell narrated as payoffs/comparison or actually revealed requires
exactly one A and one B reveal event. Both must have happened by the end of
that narration window; a later reference may reuse an already-completed pair
without duplicating events. New score events belong only to the complete
`payoffs` narration form, never a choice or existing-score comparison phase.
Partial reveal frames within a payoff phase remain supported. Scores
accumulate only when those events occur.

Every subtitle phase has an explicit focus kind, expected cell, and scope.
A new combination or comparison phrase starts with no active border until its
own `focus_cell` event. Consecutive case-result phases may explicitly share the
same case-choice scope; a comparison cannot inherit another phrase's scope.
Every distinct focused scope requires exactly one activation, including
comparison scopes; inherited case-result phases reuse the same activation.
A summary's `none` phase clears all current focus while keeping earned numbers.
The renderer draws the border from `activeCell`, never from the last historical
selection. Row focus is independently explicit.

`joint_reveal` supplies a start frame, integer duration, semantic cell and
explicit A/B choices. Both owners are required and must match that cell; a
focused phase must agree with it too. One resolved information state drives
the information label, both card face colors and their reveal alphas. The four
RR/RB/BR/BB combinations have independent actual owner-pixel tests. `conceal_choices` explicitly resets it. Concurrent/conflicting
card transitions are invalid.

Subtitles are complete groups of one or two authored lines. Lines have at most
22 readable Unicode letters/digits; their concatenation must equal the block's
voiceover exactly, without whitespace normalization. Player names, both configured strategy labels and numeric-unit tokens cannot
cross line or group boundaries. In addition, complete generated choice,
condition and payoff-result clauses are indivisible. These clauses come from
the same structured semantic formatter as the final narration, so punctuation
inside a configured label cannot be mistaken for a clause separator. Breaking
at the separator between complete clauses is allowed. The group remains fully visible through the
entire window, including tail frames, outside avatar/scene alpha changes.
The compositor reads actual `ctx.font` back after applying each font and checks
size, weight and full family. Text records contain that applied state. Measured
ink must fit a fixed role-specific slot and cannot overlap earlier text ink
bounds. Unsupported names or labels fail with the role, requested size, measured
ink dimensions and slot; text is never silently shrunk. Four- and six-character
name replacements are tested. Longer input is accepted only if it really fits.

Each phase declares one supported semantic narration form: `participants`,
`choices`, `payoffs`, `comparison` or `summary`. Case-focused forms read their
explicit `expectedCell`; comparison also declares its ending punctuation.
`narrationForPhase(caseData, phase)` resolves names, full strategy labels and
spoken integer scores directly from the same case that drives matrix pixels.
The author/build step derives the block voiceover and one/two subtitle lines
from that result. Compilation independently resolves the semantic form again
and rejects either stale text product; it never rewrites stale input silently.
Changing only a name, strategy or score is therefore a failing input. Explicit
rebuilding from the new case produces consistent positive variants.

This first-stage schema intentionally does not accept arbitrary prose or claim
to understand free-form narration. Adding another form needs its own semantic
references, schema and tests. The 40-block public editorial draft remains
unchanged and is not automatically converted into this synthetic plan.
Listening quality and audio alignment remain separate work.

Player and strategy labels must be trimmed, well-formed, visible, single-line
text without controls or default-ignorable characters (including Hangul
fillers, invisible combining joiners and variation selectors). NFKC/whitespace-normalized forms
must be distinct within each pair, so bytewise differences cannot disguise
visually empty or equivalent labels.

## Asset adapter and transition contract

An adapter supplies `id` (`A` or `B`), positive integer native `width`/`height`,
an exact nonzero-alpha bounding rectangle, and `draw(ctx)` at native origin.
No paths are read from plans and no private import or resource fallback exists.
The render session requires both actors, captures their actual raster pixels,
and independently checks declared bounds against every nonzero alpha pixel.
Declared width and height are saved before invoking the provider. A callback
that resizes its exposed canvas is rejected before any private allocation or
pixel read; changing the adapter's declaration during drawing cannot change
the saved dimensions. Capture always copies exactly the validated dimensions,
and releases temporary surfaces on both success and error.
Provider drawing uses a temporary exposed surface; its pixels are copied into
a second private surface before hashing. Retaining the provider context or
canvas cannot mutate the captured pixels, fingerprint or cached/uncached frames.
Resources and pure imports never create output files/directories.

A transition supplies integer start/end frames and from/to poses containing
`x`, `y`, `scale`, `side`, `alpha`. x/y anchor the intrinsic image's top-left;
side -1 mirrors inside that footprint. Side cannot change during a transition.
Track keys are limited to `startFrame`, `endFrame`, `from`, `to` and optional
`easing`; endpoint keys are exactly the five pose fields above. Unknown fields
(including `rotation` and `anchor`) are rejected rather than silently dropped.
Positive scale and finite poses are mandatory. Supported easing is linear,
smoothstep or smootherstep. The sampler clamps before/after and exposes raw
and eased progress. `avatarTransitionFrames` includes before/start, rounded
quarter points, end/after. A short track deduplicates coincident integer samples.

The real session validates custom tracks against independently captured alpha
before returning a session. It uses the existing low/bilinear image smoothing
explicitly on both avatar drawing contexts. Bilinear filtering can extend ink
half a native pixel beyond a measured alpha edge, so the containment envelope
includes that support (clamped to the source image). Transparent padding may
lie outside the canvas, but the filtered alpha footprint must remain inside
1920×1080. Opacity zero does not authorize an offscreen entrance/exit.

Containment of the full supported interpolation has a bounded proof. Mirror
side is fixed and scale remains positive. Every footprint edge is position +
a constant times scale; all coordinates and scale use the same easing fraction
q in [0,1]. Each intermediate edge is therefore the convex combination of its
two endpoint edges. Both valid endpoints prove all intermediate/adjacent
clamped frames. The actual requested sample is checked again defensively. Exact edge contact
can acquire an outward floating-point residue during interpolation. Only an
8×machine-epsilon expression-scaled error budget (capped below 1.5e-8 pixels)
is snapped back to the boundary; larger offsets still fail. This numerical
correction does not change the pixel-based 32px clearance rule.
Overscan regressions cover mirrors, fractional scales, all four corners and
all integer transition frames, including the filter-spill counterexample.

Each actual render also rejects avatars within 32px of any visible text ink,
including headers, names, matrix values and subtitles. The real renderer supplies only the internally proven filtered-support
neighborhood of each captured avatar, expanded by 32px plus a raster-edge
pixel; users cannot provide or shrink this region. Within it the check reads
actual masks in small bands, retains one bit per avatar pixel and a bounded
sliding window. The generic mask helper additionally scans its entire input
and skips only regions already proven too far from every measured pixel. No role-filter or combined bounding rectangle substitutes for
the pixel evidence. It uses a conservative square (Chebyshev) gap, stricter
than Euclidean distance at diagonals. Errors identify the offending text role,
actual text/avatar pixel witnesses, measured gap and required gap; glyph boxes
attribute the role only after the pixel collision has been established.

The fixed layout also reserves the complete matrix panel (including its outer
stroke) and both card rectangles. These regions and their drawing commands
share `PUBLIC_GEOMETRY`; there is no separately copied collision layout.
After the text-ink check, a visible avatar's captured, filtered alpha envelope
must not overlap any reserved region, even an empty matrix cell. This is a
conservative rectangle reservation, not a claim of precise shape clearance;
transparent native-image padding alone does not collide. It adds no spacing
requirement beyond non-overlap for graphics. Zero-opacity avatars paint no ink,
but every later visible sample is checked. Errors identify the actor, graphic
role, filtered envelope, reserved rectangle and positive overlap dimensions.
Safe endpoint positions do not authorize crossing a teaching graphic midway.

Session creation proves containment, not future text clearance. Per-frame
checks also catch paths whose endpoints are clear but middle frames cross text,
and positions that become unsafe when a score first appears. Failed frames
are disposed and never returned or inserted into the raster cache. This fixed
harness rejects unsupported custom geometry rather than automatically avoiding
text or adding offscreen entrance effects.

The harness uses a simple fixed move with stationary text and no opacity
staging. It does not claim to port a complete identity-to-matrix choreography.
Extending layout, staged layer opacities or production providers needs its own
validated geometry, actual masks and intermediate-frame review.

The synthetic provider in `tests/fixtures/animatic/synthetic-cast.mjs` draws
original geometric heads and asymmetric hats on transparent canvases. These
are test figures, not substitutes for production characters.

## Immutable sessions, cache and memory

`createRenderSession({plan, adapters, tracks?, title?})` captures:

- A validated frozen plan including case and exact captions
- Fixed geometry and copied transition tracks
- Independently verified regular/bold SC font provenance, actual cmaps and a
  byte-pair-specific registered family
- Both avatars' measured dimensions, alpha bounds and RGBA pixel hashes
- The title and component contract version

The public render module loads `scripts/isolated-fonts.mjs` before Canvas;
the supplied CLI/tests also preload it. System font loading is disabled.
`font-resources.mjs` verifies official pinned OTF digests or independently
reproduces the recorded TTC source/face through the existing font preparation
verifier. A manifest's own hash is never enough. It checks every requested
character in both real Unicode cmaps before drawing, including title, labels,
resolved captions, digits and fixed interface strings. Missing glyphs fail
instead of becoming fallback/tofu pixels.

Successful proofs are cached by current font, manifest, source and verifier
byte hashes. The current bytes are rechecked before every render and every
cache hit/miss, including after GlobalFonts has registered a face. Any change
invalidates an existing session. Exact verified buffers are registered under a
full pair-hash alias, so a legacy fixed alias cannot supply stale font metrics.
No prepared-font cache changes, network access or manifest rewriting occur.
TTC verification uses temporary re-extraction files which are removed afterward.
Verification
requires the existing Python/fontTools setup as well as Node dependencies.

Its SHA-256 fingerprint binds those inputs. Later changes to caller-owned
objects or provider callbacks cannot change that session. Create a new session
and cache whenever case, plan, font, geometry, tracks or assets change. Pixel
identity is promised only for the same platform/runtime/font environment.

`session.render(frame)` returns a fresh canvas, state, text/alpha masks and
records. The caller owns those surfaces and must call `result.dispose()` after
inspection/encoding to bound native Canvas memory in long runs.
`session.renderPNG(frame)` disposes its intermediate surfaces automatically.
The cache snapshots returned PNG buffers on insertion and returns a copy on
every access, so mutating one result cannot poison later hits. Only the exact
same integer frame hits; semantic hold-frame deduplication is not supported.
Eviction and reversed requests must produce the same bytes as cold rendering.

## Public editorial provenance

The repository already contains the public r2 editorial draft with 40 ordered
IDs and voiceovers. `source-binding.mjs` can create a new receipt directly from
those public UTF-8 bytes: exact file hash, per-block text hash and joined spoken
text hash. It never copies private source metadata and does not assert equality
of public and other original files. Whitespace-only JSON edits change the file
hash without changing the decoded spoken text hash.

This receipt does not turn the five-block synthetic fixture into an episode
adapter, establish an episode schedule, approve editorial content or align
human audio. Integrating a later episode adapter is separate work.

## Validation

After installing the existing locked dependencies and preparing the pinned SC
fonts as described in the main README:

```sh
npm run qa:fonts
npm run test:core
npm run test:animatic
npm test
```

New tests live under the existing `tests/*.test.mjs` glob. Core test-file
concurrency is bounded to two so native Canvas allocations remain bounded;
all files and test cases still run. Temporary source-checkout compositor tests
explicitly pass the project's selected Python executable. Their regression
environment puts a real `--without-pip` virtual environment on the fallback
PATH, proves that fallback has no fontTools, and keeps all six original font
and layout mutation assertions strict. The fixture does not borrow a runner's
global pip packages or acquire its own project `.venv`. The explicit
`test:animatic` smoke also runs in `npm test` and in the Quality workflow, after
font preparation/verification. No existing test stage is removed or skipped.

Coverage includes all 360 semantic frames, every event and subtitle boundary,
final valid/excluded frames, cold/repeated/reordered resolution, new-focus
clearing, owner/event negatives, complete one/two-line subtitle pixels,
asymmetric values in all four cells, actual border/fill pixels, joint-reveal
card/label agreement, all-visible-text ink clearance, transparent head bounds,
mirror/scale, start/quarter/end/adjacent poses, moving-collision negatives,
immutable resource snapshots and cache eviction/Buffer mutation isolation.
Real-compositor mutations also reject 8px subtitles, regular instead of bold,
a wrong font family, displaced subtitles/columns/legend, overlong role text,
and the formerly overlapping eight-character actor name. Actual subtitle alpha
height is checked independently of font-record metadata.
Additional review regressions cover stale case-bound narration, strategy word
splits, whitespace/control/normalized duplicate labels, all four joint card
choices, retained provider-context mutation, unsupported glyphs, forged or
changed font provenance, proof-cache invalidation and stale legacy font aliases.
The standalone smoke uses the same compositor as the component tests and
checks 67 boundary/transition frames against cold/cached/reversed PNG bytes.

Clearance tests use real raster alpha/text masks, not just declared boxes. The
full-compositor check expands each measured avatar-alpha rectangle by 32px,
then rejects any visible text ink in that conservative region. Separate motion
fixtures check every frame and deliberate collisions at intermediate poses.

Only public source is packaged by `npm run pack:source`. Fonts, dependencies,
rendered images and other cache artifacts remain excluded. Source packaging
and existing source guard checks do not prove legal ownership or absence of
all secrets; review the final source diff before publication.
