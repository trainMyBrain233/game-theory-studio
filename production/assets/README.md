# Editable textbook cast and strategy cards

Five original SVG assets for the selected B visual style. All art was constructed manually from editable vector primitives. There are no embedded raster images, filters, gradients, decorative shadows or visible text. Each SVG has labelled groups and an accessible English title.

## Files

- `person_a.svg`: 420 × 500; glasses, blue collared shirt, breast pocket, circular badge.
- `person_b.svg`: 420 × 500; short bob, beige collared blouse, square badge.
- `card_red.svg`: 140 × 190; red fill and white circle.
- `card_blue.svg`: 140 × 190; blue fill and white bar.
- `card_back.svg`: 140 × 190; neutral pale-blue diagonal hatch.
- `asset-hotspots.json`: positioning, label anchors, palette and notes.
- `contact_sheet.png`: locally generated 1440 × 820 proof; letters and English labels are preview overlays only.
- `verify-assets.mjs`: rerunnable load/render check using @napi-rs/canvas.
- `asset-verification.json`: locally generated verification result. Run `npm run qa:episode:assets` from the repository root after preparing SC fonts to create both generated files; neither is committed.

## Placement

With `(x, y)` as the figure viewBox top-left and uniform scale `s`, draw the external desk at `y + 480*s`. Main contours use 3.6 units. Both identity badge centers are `(164,374)`; overlay a 26-unit white bold A or B, center/middle aligned. Badge position is deliberately on the shirt’s left chest rather than the torso center, leaving the central button placket legible.

A card’s editable label region is x=24–116, y=102–163. Overlay 红/蓝 at `(70,130)` in the project’s actual SC font at about 44 units, white/700/center/middle. The neutral back needs no label. Card outer stroke is 3.5 units.

Draw strategies separately so they can move or turn without deforming the resting-hand illustration. Keep hands and sleeves together when animating a pose. To combine assets in a single SVG DOM, prefix duplicate internal IDs; independent `loadImage()` calls are already safe.

## Visual verification

All five SVGs successfully loaded with @napi-rs/canvas and were rendered together for inspection. The proof was inspected at full resolution for face/collar collisions, cuff-to-hand continuity, edge clipping, badge contrast, card symbol differentiation and readable hatching. The silhouette stays within the viewBox. Bottom desk anchor is consistent for both figures. Run the verifier again for the current checkout; historical proof alone does not establish current renderer acceptance.
