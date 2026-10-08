# Character artwork boundary

This public renderer contains no EA/PvZ character images, extracted game resources, redrawn character layers or previews derived from them. The cast configuration can name normal-zombie A and conehead-zombie B, but those names and source-code references are not an artwork distribution or a claim of permission.

The private layered-character path expects eight RGBA PNG inputs under `private_characters/pvz/assets/`: an `a_` and `b_` version of `head`, `torso`, `upper` and `forearm`. That entire directory is excluded. No associated image hashes, private-media QA reports or production asset manifest are published here.

For public use, pass `--placeholder-cast` to rendering and scene-QA commands. It selects the original `assets/person_a.svg` and `assets/person_b.svg`. The original red, blue and back-of-card SVGs remain editable teaching props in both modes. Without private files or an explicit placeholder flag, loading fails with `PRIVATE_ASSET_MISSING`.

`src/rgba_character_rig.mjs` contains transform/pivot mathematics; `src/character_adapter.mjs` maps a layered rig into scene slots. The adapter uses the shared `IDLE_HAND=[250,190]` prepared-space chest rest for its default and both releases. The 164/218 bone lengths, pivots and physical card grip remain fixed. Cloud candidate comparison found this rest less intrusive than y170/y150 and clear in the initial/release keyframes; repeat real-pixel acceptance for the final commit and every supplied image set. Geometry-only checks cannot certify baked fingers or forearm alpha. Neither contains embedded image pixels. Any independently supplied artwork must be appropriate for the intended use, and the existing raster-size limits still apply.

Use `npm run pack:source` from the repository root for a unified public source archive. The script requires `--public` and has no private archive mode. It uses the Git source candidate list and the same publication guard as CI, excluding ignored media, dependencies, fonts and private artwork. Inspect the file-list manifest before any separately authorized upload.

See the repository’s [third-party content boundary](../docs/third-party-content.md) and [EA content policy](https://help.ea.com/en/articles/security-and-rules/ea-content-policy/). The project does not provide a legal-permission guarantee. Its MIT license covers original source and original SVGs, not third-party characters or fonts.
