# Tabletop interaction prototype

Status: **prototype**. This isolated experiment does not replace the production renderer or accepted media. It reuses the warm-white/dark-blue palette, public original figures/cards, shared case and canonical timeline. No new character or third-party image is included.

After the normal root dependency/font setup:

```sh
node --import ./scripts/isolated-fonts.mjs design/experiments/tabletop/render.mjs --placeholder-cast
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

## Still OPEN

- Register relaxed/reaching/grasping/releasing images against a shared wrist, then integrate rear/front finger layers.
- Select support after native/reduced review; verify actual hand/card/stand contact, non-grasp separation, weight, depth and seams for both participants/all four choices, including intermediate/adjacent frames.
- Check recognition and configured Chinese labels, actual name/text clearance, and compatibility with production subtitles/matrix transitions.
- Keep the delivered branch unchanged until real-art acceptance completes.

See the [public regression ledger](../../../docs/quality-regressions.md) and [interaction design contract](../../../docs/references/interaction-design.md). The current five-phase geometry preview is not the seven-state contact/control implementation: separate contact/retreat, orientation, wrist-axis/seam registration, velocity-preserving ownership changes and a front cuff slot remain to implement and validate with registered art. Its non-selected-card fade illustrates selection only, not a physical removal action. No canonical case/timeline, production assets/fonts, grip, rig or full-film acceptance is changed by this experiment.
