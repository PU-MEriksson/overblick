# CLAUDE.md — overblick

## What this project is

**overblick** ("overview" in Swedish) is a plugin for the **Supernote Nomad** e-ink device.
Goal: turn handwritten text in a Supernote note into a trackable todo item, and give the user
an overview of all todos across notes.

The first milestone:

1. User selects handwritten text on the Supernote.
2. That selection becomes a todo item, stored with **both** the handwritten ink and an
   **OCR-converted text** version.
3. The plugin shows a list of todos as converted text.
4. A checkbox is drawn next to the handwritten text on the page. Toggling it updates state in
   **both** places — the note file and the plugin — and the two stay in sync.
   Everything beyond that (recurring tasks, tags, due dates, filters) is out of scope for now.
   Do not build ahead.

## Build & deploy

Two different workflows — don't conflate them:

- **Everyday dev loop:** `yarn start` + `yarn android`/`yarn ios`. Normal React Native: Metro
  serves JS live, Fast Refresh updates the running app. This runs as a standalone app, not
  inside the Supernote plugin host — anything depending on `PluginManager` / the plugin bridge
  won't behave the same here.
- **Building the actual plugin package:** run `./buildPlugin.sh` (macOS/Linux) or
  `.\buildPlugin.ps1` (Windows) from the project root. This bundles the JS in production mode,
  generates `PluginConfig.json` on first run, builds any native Android code into the package,
  and zips it into `build/outputs/<package.json name>.snplg` (e.g. `overblick.snplg`).
- **Install on device:** copy the `.snplg` file to the Supernote's `MyStyle` folder, then on the
  device go to Settings → Apps → Plugins → Add Plugin and select it.

See `docs/api-notes.md` for build-tooling quirks discovered along the way (e.g. the output
filename differs from what the docs describe).

## How I want you to work with me

I know web development but **new to React Native** and new to the Supernote plugin API. I'm learning as I build.

- **Explain what you're doing and why**, not just what to type. When you introduce something
  React Native-specific, say briefly how it differs from what I'd expect on the web.
- **One concept at a time.** Prefer a small working change I understand over a large one I don't.

## Research rules — read this before writing plugin code

The Supernote plugin API is **not well represented in your training data**. Its surface has
changed between firmware releases. Assume you do not know it.

**Before using any `sn-plugin-lib` or `PluginManager` API:**

1. Check the official docs: **https://docs.supernote.com/en** — this is the primary source.
2. Check the actual type definitions on disk:
   `node_modules/sn-plugin-lib/**/*.d.ts`. If the docs and the types disagree, **the types win**.
3. If neither confirms the API exists, **say so and stop.** Do not guess a plausible method
   name.
4. Secondary source when the docs are silent: https://www.reddit.com/r/Supernote_dev/ — treat
   as community hearsay, label it as such.
   When you learn something about the API that isn't obvious from the docs, append it to
   `docs/api-notes.md` so we don't rediscover it later.
