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
