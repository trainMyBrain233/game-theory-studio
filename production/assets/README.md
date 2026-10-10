# Editable textbook cast and strategy cards

Five original SVG assets for the selected B visual style. All art was constructed manually from editable vector primitives. There are no embedded raster images, filters, gradients, decorative shadows or visible text. Each SVG has labelled groups and an accessible English title.

## Files

- `person_a.svg`: 420 × 500; glasses, blue collared shirt, breast pocket, circular badge.
- `person_b.svg`: 420 × 500; short bob, beige collared blouse, square badge.
- `card_red.svg`: 140 × 190; red fill and white circle.
- `card_blue.svg`: 140 × 190; blue fill and white bar.
- `card_back.svg`: 140 × 190; neutral pale-blue diagonal hatch.
- `asset-hotspots.json`: version 2 positioning, layer order, wrist seams, label anchors, palette and authored SHA256 for the five sources.
- `contact_sheet.png`: locally generated 1440 × 820 proof; letters and English labels are preview overlays only.
- `verify-assets.mjs`: rerunnable load/render check using @napi-rs/canvas.
- `asset-verification.json`: locally generated verification result. Run `npm run qa:episode:assets` from the repository root after preparing SC fonts to create both generated files; neither is committed.

## Placement

With `(x, y)` as the figure viewBox top-left and uniform scale `s`, draw the external desk at `y + 480*s`. Main contours use 3.6 units. Both identity badge centers are `(164,374)`; overlay a 26-unit white bold A or B, center/middle aligned. Badge position is deliberately on the shirt’s left chest rather than the torso center, leaving the central button placket legible.

A card’s editable label region is x=24–116, y=102–163. Overlay 红/蓝 at `(70,130)` in the project’s actual SC font at about 44 units, white/700/center/middle. The neutral back needs no label. Card outer stroke is 3.5 units.

Draw strategies separately so they can move or turn without deforming the resting-hand illustration. Keep hands and sleeves together when animating a pose. To combine assets in a single SVG DOM, prefix duplicate internal IDs; independent `loadImage()` calls are already safe.

## Occlusion and source updates

The upper sleeves are behind the torso. The torso fill retains its original bounds but uses a separate open outline, avoiding a closed hem under the palms. Forearms and their folds are in front of the torso/details, followed by cuffs and hands. Their shared wrist seams are `(151,443)–(147,474)` and `(269,443)–(273,474)`. No masks, clips or reduced figure scale hide the former intersection. Figure viewBoxes, desk y480 and badge `(164,374)` remain fixed.

The red circle and blue bar now share symbol center `(70,73)`: red `cy=73`, blue `y=64`. Card size, label region/coordinates and render stacking are unchanged. The main renderer consumes this exact recorded anchor/style: at 105px card width it draws 33px text at transformed (70,130), center/middle. Hands still render in front of the cards in the private RGBA mode; a lower symbol must be checked in real production frames, never drawn above the hand to conceal overlap.

After an intentional SVG edit, review its visible paths and update that file's `sourceHashes` entry in `asset-hotspots.json`. The verifier compares actual source bytes with the authored hash and checks rendered contour/occlusion/wrist/hem/symbol pixels; QA never rewrites these hashes. Negative regressions reject rear-layer forearms, a penetrating side line, old symbol positions and altered bytes.

Private mode skips both public person SVGs. The real preparation route is tested with eight temporary original RGBA rectangles and deliberately malformed public person SVGs; private preparation succeeds while the explicit placeholder route rejects the broken SVGs. This proves routing only, not the visual quality of any private artwork. Cards remain common to both routes.

Reproduce the 4x native SVG lower-body before/after board and card comparison:

```sh
npm run render:art-proof -- --before-sha 986933b7fcfc19a95025b12c2cdaf002c14cc732
```

PNG/JSON proofs stay in ignored `artifacts/placeholder-layer-fix/`. The proof separately confirms both head/neck regions above y270 and badges remain pixel-identical. Figma should import these same source SVGs rather than redrawing an independent variant.

## Visual verification

All five SVGs successfully loaded with @napi-rs/canvas and were rendered together for inspection. The proof was inspected at full resolution for face/collar collisions, cuff-to-hand continuity, edge clipping, badge contrast, card symbol differentiation and readable hatching. The silhouette stays within the viewBox. Bottom desk anchor is consistent for both figures. Run the verifier again for the current checkout; historical proof alone does not establish current renderer acceptance.
