# Tabletop interaction prototype

Status: **prototype**. This isolated experiment does not replace the production renderer or accepted media. It reuses the warm-white/dark-blue palette, public original figures/cards, shared case and canonical timeline. No new character or third-party image is included.

After the normal root dependency/font setup:

```sh
npm run qa:tabletop
# Optional local clips require an existing FFmpeg installation.
npm run render:tabletop:interaction
npm run render:tabletop:flat-regression
```

Ignored `artifacts/tabletop-prototype/` contains three comparison boards (same camera at 27.0s and 44.8s), native 1920×1080 frames at 27.0/37.2/43.6/44.8s, `identity-matrix.png` and a prototype manifest. Images are previews; these `.mjs` files are the editable sources.

`presentation.json` / `presentation.schema.json` configure draft series, episode number/title and the names 普通僵尸/路障僵尸. The two-line candidate header is not confirmed copy. `presentationModel` returns the same names for labels, avatars and the [r2 editorial draft](../../../chapters/01-four-elements/editorial/zombie-kingdom-r2/README.md); it does not rewrite current narration/SRT or fit new speech into the old 174.1s timeline. Internal A/B keys remain row/column and payoff indices 0/1. No new chapter is commissioned or generated.

`avatar.mjs` accepts an already loaded head layer with explicit owner, measures actual alpha and fits its entire extent to a common box/bottom baseline. Body badges and matrix labels reuse the same public head source; visible letter marks are removed. Private production may supply its approved real head layer through this interface, retaining the full cone/hat; no PNG is embedded, copied or fetched here. Names use fixed 34–36px in the preview. Actual private head size, face legibility and clearance remain OPEN.

| Option | Resting support | Tradeoff |
| --- | --- | --- |
| Continuous low rail | One groove per player; selected card can move to a central resting point | Show the groove/foot and keep approach/withdrawal clear of the face |
| Separate small stands | Explicit contact and a fixed position per card | More objects; new grasp/release art must avoid stand edges |
| Flat resting cards | Direct tabletop support; cards rise upright for presentation | Foreshortening weakens circle/bar recognition; outside labels retain full type size |

The tabletop has a back edge, opaque surface and front face. It occludes the lower torso; existing original resting forearms draw in front. Upright cards have support at their bottom edge. Static objects are forward of the public resting hands, rather than ending below a single unexplained table line.

`layout.mjs` exposes idle/reach/grasp/place/release anchored to existing segment IDs. Contact precedes release. These are planned interaction states, **not accepted finger motion**. Original SVG hands stay static; hollow grip marks in raised frames mean proposed contact only. A floating raised card is pending hand integration, not evidence of a working grasp.

`hand-interface.mjs` makes the arm end a wrist; card/desk contacts are separate registered pose offsets. Cropping a hand must not move that wrist. Unregistered anchors and IK clamping reject a contact claim. Proposed depth is forearm/rear palm and thumb → card → front fingers. No new hand bitmap is registered or loaded here, and the production fingertip-based endpoint remains unchanged.

`handSlotTransforms` gives rear/front crops separate local wrist anchors, both driven by the same world wrist; its explicit `drawOrder` places the card between them regardless of metadata/property order. This Canvas interface borrows mechanisms described in official [Spine slots](https://esotericsoftware.com/spine-slots) (draw order separate from bones) and [point attachments](https://esotericsoftware.com/spine-points) (independent position/rotation). The [IK guide](https://esotericsoftware.com/spine-ik-constraints) describes endpoint targeting; our inference is that this alone cannot establish finger wrapping, weight or support. No Spine runtime/code or new package is installed.

## Original geometric cycle

`interaction.mjs` / `render-interaction.mjs` produce an isolated 10s/30fps native 1080p pick/place cycle in `artifacts/tabletop-interaction/`, with original geometric arm/palm/fingers and the same original public bodies. Explicit contact precedes lifting; the same card returns to the same supported slot before release, and the hand retreats. The unselected cards stay still. Core tests sample all four choices, fixed bone lengths, grip/wrist binding, supported handoff, continuity and reordered times. This does not register private hand art or prove natural movement, seams, perspective, a weight model or a complete production rig.

`render:tabletop:flat-regression` writes a separate 2s excerpt around 36.2–38.2s. It fixes an actual geometry defect where the fading unselected flat card rotated upright with the selected card. The unselected card now remains flat and supported; its fade still does not represent a physical removal action.

`qa:tabletop` runs in CI after font preparation. It measures the actual registered SC ink before matrix labels are drawn: default four-character names and two-character strategies fit with at least 24px from the matrix. The data schema allows names up to 10 characters for editorial use, but this particular fixed-size preview explicitly rejects names whose ink exceeds its allocated column. It never shrinks type to fit. Long-name layout needs a future explicit layout change.

Native adjacent frames and actual playback are separate review steps; encoding/decoding or numerical continuity alone cannot mark visual acceptance. Generated manifests initially mark playback pending, and real-art acceptance remains open.

## Still OPEN

- Register relaxed/reaching/grasping/releasing images against a shared wrist, then integrate rear/front finger layers.
- Select support after native/reduced review; verify actual hand/card/stand contact, non-grasp separation, weight, depth and seams for both participants/all four choices, including intermediate/adjacent frames.
- Check recognition and configured Chinese labels, actual name/text clearance, and compatibility with production subtitles/matrix transitions.
- Keep the delivered PR #2 baseline frozen; prototype changes remain on the isolated design branch.

See the [public regression ledger](../../../docs/quality-regressions.md) and [interaction design contract](../../../docs/references/interaction-design.md). The current five-phase geometry preview is not the private-art seven-state implementation. The new geometric cycle separates contact/retreat and draws an original cuff, but orientation, wrist-axis/seam registration, velocity-preserving ownership changes and real front cuff art still require registered-art integration and validation. Its non-selected-card fade illustrates selection only, not a physical removal action. No canonical case/timeline, production assets/fonts, grip, rig or full-film acceptance is changed by this experiment.
