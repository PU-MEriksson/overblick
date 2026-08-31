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

## Current status (as of 2026-08-31)

Working end-to-end on-device, in `src/`:

- **Milestone step 1 (select handwritten text):** done. The existing "Lasso Button"
  (id `200`, registered in `index.js`) is wired up in `src/lasso/useLassoCapture.ts` — on
  press it fetches the lasso selection, OCRs it (`PluginCommAPI.recognizeElements`), saves a
  `.sticker` snapshot of the original ink, and captures the source note path / page number /
  lasso rect (all best-effort — a failure in any of these doesn't block the capture).
- **Milestone step 2 (todo item stored with both ink and OCR text):** done. Each capture
  carries the OCR'd text, the `.sticker` file path, and its note/page/rect — see
  `src/types.ts`'s `Capture`/`TodoItem` — and the list itself now persists.
  `src/todos/todoStorage.ts` saves the whole list as one JSON document via AsyncStorage, under
  the namespaced key `overblick:todos` and wrapped in a `schemaVersion` envelope so fields can
  be added later without having to guess at the shape of old data. Confirmed on-device
  2026-08-31: todos survive both a device restart and a plugin uninstall/reinstall.
- **Milestone step 3 (list of todos as text):** done. `src/todos/TodoList.tsx` renders the
  list, which now loads from storage when the plugin opens.
- **Milestone step 4 (synced checkbox on the page):** not started, and the one step that needs
  real design work rather than wiring. Settled 2026-08-31: the checkbox must be **drawn by us**.
  Supernote's own to-do feature only produces a link visible inside the to-do app — the note page
  gets no visual mark — so it can't stand in for the checkbox (confirmed on-device; see
  `docs/api-notes.md`). There's no checkbox element type and not even a rectangle primitive, so
  a box is a polygon, straight lines, or an inserted sticker. Writing into a note also needs
  `PluginManager.requestPermission('plugin.permission.FILE:WRITE')`, unlike the plugin's own
  storage. The hard part is anchoring: elements are addressed by index within a page, so keeping
  a checkbox tied to its todo across page edits is the problem to solve first.

**Next planned step:** milestone step 4.

**Deferred by decision, not oversight:** planned dates, today/this week/this month, and an
"important" flag are wanted eventually, but stay out of scope until the milestone is finished.
When they land, the agreed model is an anchor date plus a granularity (`plannedOn` +
`horizon` of day/week/month) rather than a literal stored bucket — a stored `'today'` goes
stale overnight, an anchored date doesn't.

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
  Since AsyncStorage was added the project contains native code, so **every** package build now
  runs Gradle, which needs `JAVA_HOME` (JDK **21** — Android Studio's bundled JDK 25 is too new
  and fails with a misleading error) and `ANDROID_HOME`. Both are exported from `~/.zshrc`, so
  `./buildPlugin.sh` takes no prefix. Watch out: if Gradle can't run, the script prints
  "APK build failed" in red and **still writes a `.snplg`** — one with no native code in it. So
  check `build/generated/PluginConfig.json` for `nativeCodePackage` before installing rather
  than trusting that the script finished. After adding any new native dependency, regenerate the
  autolinking list first (`cd android && ./gradlew :app:generateAutolinkingPackageList`) or the
  new package is silently left out. All of this is written up in `docs/api-notes.md`.
- **Install on device:** copy the `.snplg` file to the Supernote's `MyStyle` folder, then on the
  device go to Settings → Apps → Plugins → Add Plugin and select it.

See `docs/api-notes.md` for build-tooling quirks discovered along the way (e.g. the output
filename differs from what the docs describe).

## How I want you to work with me

I know web development but **new to React Native** and new to the Supernote plugin API. I'm learning as I build.

- **Explain what you're doing and why**, not just what to type. When you introduce something
  React Native-specific, say briefly how it differs from what I'd expect on the web.
- **One concept at a time.** Prefer a small working change I understand over a large one I don't.

## UI & styling

The Nomad's screen is **black-and-white e-ink**, not a color display.

- **Dark mode is not needed.** Don't build light/dark theme branching for this app.
- **Style everything for grayscale/black-and-white contrast.** Never rely on color alone to
  convey meaning (e.g. red for errors) — it won't render as intended on-device. Use weight,
  italics, borders, or layout instead to distinguish UI states.

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
