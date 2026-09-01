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
- **Milestone step 4 (synced checkbox on the page):** half done, and split deliberately.
  - *App half — done 2026-09-01.* `TodoItem.done`, a hand-rolled checkbox in
    `src/todos/TodoList.tsx` (RN has no checkbox primitive and core removed its `CheckBox`, so
    every RN checkbox anywhere is a `Pressable` + bordered `View` + glyph — we own ours), and
    `toggleTodo` in `useTodos.ts`. Persisted, with a real v1→v2 migration in `todoStorage.ts`:
    reading *older* data must upgrade it, only *newer* data may be refused. Done state shows as
    tick + strikethrough + italic, never colour.
  - *Note half — anchoring solved, visual parked.* See the anchoring section below. Writing into
    a note needs `PluginManager.requestPermission('plugin.permission.FILE:WRITE')`, unlike the
    plugin's own storage. There's no checkbox element type and not even a rectangle primitive, so
    a drawn box would be a polygon, straight lines, or an inserted sticker.

**Next planned step:** decide what the mark on the note page should look like, after surveying
what other community plugins do. The spike that answered anchoring lives in
`src/probe/AnchorProbe.tsx` + `src/probe/probeRecord.ts` (temporary; `SHOW_ANCHOR_PROBE` in
`App.tsx` is now `false`, flip it to `true` to get the probe screen back, and delete both files
once the note-side visual is settled). Drawing a shape into a note works end-to-end — see
"Drawing a shape on a page" in `docs/api-notes.md` for the recipe, especially that
`Geometry.points` are screen pixels rather than EMR.

### Anchoring: solved 2026-09-01. Use a stroke link.

`PluginNoteAPI.setLassoStrokeLink({destPath, destPage: 0, style: 2, linkType: 4})` turns the
current lasso selection into a link element and draws a **dashed border around the handwriting**.
`destPath` is an arbitrary string stored verbatim (`linkType: 4` = "URL", so the device never
tries to resolve our made-up `overblick://todo/<id>` scheme). Find it again with `getElements` →
`el.type === 600 && el.link.destPath === ...`.

Verified on-device: `destPath` survives a full device restart, and the border **follows the
handwriting when it's dragged** (measured 615px from where it was created). So the anchor tracks
the content rather than the page, and the link's `X/Y/width/height` tells us where the handwriting
*is now*. No coordinates are involved in creating it at all. Found by reading the SuperTask
plugin; full recipe and its gotchas (notably: it returns a result **code**, not a boolean) in
`docs/api-notes.md`.

Two dead ends behind that answer, both confirmed on-device — don't retry either. **`userData` is
silently discarded** (accepted on insert, never written to the file) and **`uuid` is a
native-cache handle** that changes on every single read. Ordinary elements have no identity; only
links do. A geometry fallback (match a drawn square by its points, within a few px — they read
back 1px low on x) is documented in `docs/api-notes.md` but shouldn't be needed.

**Deliberately parked 2026-09-01 — what "done" looks like on the page.** The border-style flip
(dashed ↔ solid) works both ways, but a `linkType: 4` link is **tappable and opens a browser
search** for our fake URL, and flipping the style reflows the link glyph into the handwriting.
Good enough to keep working with, not good enough to ship. Ideas for revisiting it — `fullText`/
`showText` as alternative tag carriers, a harmless `linkType` — are listed in `docs/api-notes.md`.
Malin also wants to survey what other community plugins do before settling this.

**The app→note direction is proven, whatever the mark ends up being.**
`PluginFileAPI.modifyElements(notePath, page, [el])` changed our link's style **by path, with no
lasso and the note not open** (confirmed on-device 2026-09-01). With `insertElements` and
`deleteElements` also available off-lasso, every write step 4 needs can be driven from the plugin's
list. Only note→app is unproven — a mark the user makes by hand can't be watched live and will
have to be noticed when the plugin next opens.

One other thing still undesigned, waiting on the visual decision: repositioning. The link follows
the strokes, but a geometry element we insert does **not**, so a drawn checkbox would have to be
repositioned from the link's current rect on each open.

Keep `src/probe/` until this is finished; it's the cheapest place to test the modify/delete paths.

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
