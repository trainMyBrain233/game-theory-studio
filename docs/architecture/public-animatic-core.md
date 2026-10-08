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
Only `synthetic_test_only` and `manual_reference_not_audio_aligned` schedules
are accepted in this first schema. `audioTiming` must remain null. Actual audio
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
and owner and does not contain another copy of the value. Each cell that is
revealed must eventually have exactly one A and one B event; partial reveal
frames are supported. Scores accumulate only when those events occur.

Every subtitle phase has an explicit focus kind, expected cell, and scope.
A new combination or comparison phrase starts with no active border until its
own `focus_cell` event. Consecutive case-result phases may explicitly share the
same case-choice scope; a comparison cannot inherit another phrase's scope.
A summary's `none` phase clears all current focus while keeping earned numbers.
The renderer draws the border from `activeCell`, never from the last historical
selection. Row focus is independently explicit.

`joint_reveal` supplies a start frame and integer duration. One resolved
information state drives both the visible information label and both card
face alphas. `conceal_choices` explicitly resets it. Concurrent/conflicting
card transitions are invalid.

Subtitles are complete groups of one or two authored lines. Lines have at most
22 readable Unicode letters/digits; their concatenation must equal the block's
voiceover ignoring whitespace. Player names and numeric-unit tokens cannot
cross line or group boundaries. The group remains fully visible through the
entire window, including tail frames, outside avatar/scene alpha changes.
The compositor reads actual `ctx.font` back after applying each font and checks
size, weight and full family. Text records contain that applied state. Measured
ink must fit a fixed role-specific slot and cannot overlap earlier text ink
bounds. Unsupported names or labels fail with the role, requested size, measured
ink dimensions and slot; text is never silently shrunk. Four- and six-character
name replacements are tested. Longer input is accepted only if it really fits.

This checks text conservation and basic token integrity, not natural-language
truth or listening quality. When changing a case, update authored narration to
match it and retain editorial review; the core does not parse prose into math.

## Asset adapter and transition contract

An adapter supplies `id` (`A` or `B`), positive integer native `width`/`height`,
an exact nonzero-alpha bounding rectangle, and `draw(ctx)` at native origin.
No paths are read from plans and no private import or resource fallback exists.
The render session requires both actors, captures their actual raster pixels,
and independently checks declared bounds against every nonzero alpha pixel.
Resources and pure imports never create output files/directories.

A transition supplies integer start/end frames and from/to poses containing
`x`, `y`, `scale`, `side`, `alpha`. x/y anchor the intrinsic image's top-left;
side -1 mirrors inside that footprint. Side cannot change during a transition.
Positive scale and finite poses are mandatory. Supported easing is linear,
smoothstep or smootherstep. The sampler clamps before/after and exposes raw
and eased progress. `avatarTransitionFrames` includes before/start, rounded
quarter points, end/after. A short track deduplicates coincident integer samples.

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
- The actual regular/bold SC font file hashes and registered family
- Both avatars' measured dimensions, alpha bounds and RGBA pixel hashes
- The title and component contract version

Load `scripts/isolated-fonts.mjs` before importing Canvas, as the supplied CLI
and raster test entrypoints do, so system fonts are disabled.

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
all files and test cases still run. The explicit
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
