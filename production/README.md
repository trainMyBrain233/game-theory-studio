# Full-episode renderer · public source

This module adds the 173.3-second first-episode renderer under `production/`. It extends the B / clean-textbook visual system without replacing the repository’s foundation, root package or MIT LICENSE.

The renderer supports a separately managed layered-character production, but this public source contains only original neutral SVG people and original vector cards. No EA/PvZ images, redraws, character PNG layers or character previews are distributed here. See [PRIVATE_ASSETS.md](PRIVATE_ASSETS.md) for the explicit boundary.

The 37-block timeline is a manual reference for future voiceover. It is not aligned to recorded speech. Historical checks on separately produced private media are not evidence that a public checkout has passed those checks.

## Public-checkout quick start

Run these commands from `production/`:

```sh
npm ci --ignore-scripts
python3 -m venv .venv
. .venv/bin/activate
python3 -m pip install -r requirements.txt
python3 setup_fonts.py
node render.mjs --stills --placeholder-cast --times 27,38.2,83,126.3,172
node qa/content.mjs --placeholder-cast
node qa/validate.mjs --placeholder-cast
python3 qa/check_fonts.py
```

Node.js 22+ is recommended. FFmpeg with libx264 is required for video encoding; it is not required for the still-frame smoke test. The font helper selects complete Simplified Chinese SC faces by internal family/weight. If local Noto CJK fonts are unavailable, supply `--source-dir /path/to/fonts` or explicitly use `--download` for the official Noto source. Keep the generated fonts and manifests local.

Use `--placeholder-cast` for every public rendering/scene-QA command. Without it, missing private layers must fail with `PRIVATE_ASSET_MISSING`; the renderer must not silently substitute a different cast. A placeholder run verifies the public renderer, not the private character artwork.

## Entry points

- `cast.json`: stable A/B IDs, display names, private resource references and public SVG fallback references. Its production-cast status describes the separate production configuration, not assets included in Git.
- `content.json`: one-round case, A=row/B=column, scores ordered A then B.
- `tokens.json`: styling, spacing, type and motion rules.
- `narration/timeline.json`: subtitle windows, voiceover text, pauses and visual cues; `{{A}}`/`{{B}}` resolve through the cast registry.
- `src/scenes.mjs`: deterministic scene timing and choreography.
- `src/primitives.mjs`: vector/text/identity drawing, layout checks and asset loading.
- `src/rgba_character_rig.mjs` and `src/character_adapter.mjs`: reusable layered-image positioning code. These files contain transforms and pivots, not image pixels.
- `assets/`: five original SVGs, placement metadata and a rerunnable asset verifier.
- `schema/`: cast and timeline contracts for later pipeline integration.
- `render.mjs`: native-size still/video rendering and FFmpeg encoding.
- `qa/`: executable semantic, layout, font and media checks.

## More commands

```sh
node render.mjs --stills --placeholder-cast --width 3840 --times 27,126.3,172
node render.mjs --placeholder-cast --preview
node render.mjs --placeholder-cast --width 1920
node render.mjs --placeholder-cast --width 3840
node qa/validate.mjs --placeholder-cast --all-frames
node build_deliverables.mjs
python3 make_sound.py
node assets/verify-assets.mjs
python3 pack_source.py --public
```

The clean video has subtitles but no audio track. `make_sound.py` synthesizes restrained original cues, not music or speech. Future voiceover requires updating subtitle, graphic and score-reveal timing to the actual recording.

## Generated files

The source import deliberately omits historical generated records and exports:

- `qa/checks.json` / `checks_long_names.json`: produced by `qa/validate.mjs`; add `--stress-cast` for the latter.
- `qa/semantic_checks.json`: produced by `qa/content.mjs`.
- `qa/font_checks.json`: produced by `qa/check_fonts.py`, after layout QA supplies the text inventory.
- `qa/sound_manifest.json`: produced by `make_sound.py`.
- `qa/media_*.json`: run `python3 qa/verify_media.py output/game_theory_textbook_v2_clean_1920.mp4` after a full 173.3-second local render; the verifier checks the full-length episode, not a short preview.
- `assets/asset-verification.json` and `assets/contact_sheet.png`: produced by `assets/verify-assets.mjs`.
- `narration/exports/`, resolved timeline, SRT and recording-reference text: produced by `build_deliverables.mjs`.
- `typography/fonts/prepared_font_manifest.json`: produced by `setup_fonts.py`; font binaries are excluded.
- `SOURCE_MANIFEST.json`: included inside an archive produced by `pack_source.py`.

The old private-image `asset-manifest.json`, `qa/asset_manifest_checks.json`, historical `qa/QA_REPORT_zh.md` and prior machine-specific `font_manifest.json` are not part of this public module. No runtime module reads them. Private-image hashes and private-media pass claims are not copied into this public snapshot.

## Checks performed for this source import

On Linux, a clean `npm ci --ignore-scripts` install and local SC extraction succeeded. Five representative 1080p placeholder stills rendered; all six semantic checks passed; 633 layout samples produced 10,065 text draws and 4,997 paths with zero reported issues; both Sans weights covered 246 characters. The text-export and five-SVG asset-verification scripts also ran. Missing private assets without the placeholder flag failed with `PRIVATE_ASSET_MISSING` as intended. This import does not claim a newly rendered full video, encoded-video QA or GitHub CI pass. Workflow unification and the integration of duplicated foundation/production utilities are separate work.

## Rendering and review boundaries

Canvas and vectors are drawn at the target resolution. Separately supplied raster characters remain raster artwork; rendering 4K does not invent new painted detail. The optional encoder uses H.264, yuv420p and BT.709. Inspect decoded output before claiming production quality; bitrate alone is not a sharpness measure.

New long names, payoff dimensions or diagrams can require layout changes. Run checks after edits and inspect transitions and small-display previews. Rectangles cannot replace visual review.

The repository’s existing [MIT LICENSE](../LICENSE) applies to original code/SVGs. Noto fonts have their own [OFL text](typography/fonts/LICENSE-Noto.txt). Third-party characters are not relicensed under MIT. See the repository’s [third-party content boundary](../docs/third-party-content.md).
