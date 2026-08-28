# API notes

Things learned about the Supernote plugin API / build tooling that aren't obvious from
docs.supernote.com alone. Append here as we discover more — don't rediscover twice.

## Plugin package output filename

- Docs (`docs.supernote.com/en/first-plugin`) describe the packaging step as producing
  `build/outputs/plugin.snplg`.
- The actual `buildPlugin.sh` / `buildPlugin.ps1` in this repo name the file after
  `package.json`'s `name` field instead — so for this project it's
  `build/outputs/overblick.snplg`, not `plugin.snplg`.
- Confirmed 2026-08-27 by reading `buildPlugin.sh` directly (see `rename_to_snplg_file`).
  Per CLAUDE.md's research rules, the script is ground truth over the docs here.

## `saveStickerByLasso` requires a `.sticker` extension, not `.png`

- `PluginCommAPI.saveStickerByLasso(path)`'s `.d.ts` comment just says "Sticker output path" —
  no format/extension is specified there.
- Calling it with a `.png` path fails with `success: false`, `error.code: 1204`,
  `error.message: "Invalid file path. Cannot call the API!"`. Confirmed on-device 2026-08-28.
- The docs example (`docs.supernote.com/.../plugin-comm-api/save-sticker-by-lasso`) uses
  `/storage/emulated/0/Note/stickers/lasso.sticker` — `.sticker`, not `.png`. `insertSticker`'s
  doc example also uses `.sticker`. Switching to `.sticker` fixed the "Invalid file path" error.
- Confusingly, sibling APIs that also deal with "stickers" use `.png` in their own doc examples:
  `getStickerSize` (`demo.png`) and `convertElement2Sticker` (`out.png`). So "sticker" the
  concept isn't one file format — `saveStickerByLasso`/`insertSticker` produce/consume Supernote's
  own `.sticker` ink format (re-insertable, not a raster image you can display directly);
  `.png` is a separate rasterized path used elsewhere. Don't assume one extension works for all
  "sticker" methods — check each method's own doc example.
- Directory does NOT need to match the docs' `/storage/emulated/0/Note/stickers/` example — a
  plugin-private directory under `getPluginDirPath()` (e.g. `<pluginDirPath>/stickers/`) works
  fine too. Confirmed end-to-end on-device 2026-08-28: `.sticker` extension + plugin-private
  directory succeeds. The docs example path was just an illustrative absolute path, not a
  requirement.
