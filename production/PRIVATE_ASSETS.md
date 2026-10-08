# Character artwork boundary

This public renderer contains no EA/PvZ character images, extracted game resources, redrawn character layers or previews derived from them. The cast configuration can name normal-zombie A and conehead-zombie B, but those names and source-code references are not an artwork distribution or a claim of permission.

The private layered-character path expects eight RGBA PNG inputs under `private_characters/pvz/assets/`: an `a_` and `b_` version of `head`, `torso`, `upper` and `forearm`. That entire directory is excluded. No associated image hashes, private-media QA reports or production asset manifest are published here.

For public use, pass `--placeholder-cast` to rendering and scene-QA commands. It selects the original `assets/person_a.svg` and `assets/person_b.svg`. The original red, blue and back-of-card SVGs remain editable teaching props in both modes. Without private files or an explicit placeholder flag, loading fails with `PRIVATE_ASSET_MISSING`.

`src/rgba_character_rig.mjs` contains transform/pivot mathematics; `src/character_adapter.mjs` maps a layered rig into scene slots. Neither contains embedded image pixels. Any independently supplied artwork must be appropriate for the intended use, and the existing raster-size limits still apply.

Use `python3 pack_source.py --public` for a renderer-only source archive. The script’s no-flag mode is for a deliberately private archive; do not publish its output. Generated media, dependencies, fonts, logs and private artwork stay outside Git. Public packaging needs an explicit file-list review before upload.

See the repository’s [third-party content boundary](../docs/third-party-content.md) and [EA content policy](https://help.ea.com/en/articles/security-and-rules/ea-content-policy/). The project does not provide a legal-permission guarantee. Its MIT license covers original source and original SVGs, not third-party characters or fonts.
