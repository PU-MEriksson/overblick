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

## There is no storage API — and no way to write arbitrary bytes at all

- Searched 2026-08-31 for any persistence/write API: `sn-plugin-lib`'s types have none, and the
  docs index (`docs.supernote.com/llms.txt`) lists no storage/database/preferences page.
- `FileUtils` (`NativeFileUtils.d.ts`) does file *management* only — `exists`, `makeDir`,
  `copyFile`, `renameToFile`, `listFiles`, `deleteFile`, `getFileMD5`,
  `getStorageAvailableSpace`. There is **no `writeFile`/`readFile`**. It can move bytes that
  already exist; it cannot create them from a string.
- `PluginFileAPI` is entirely note internals (elements, layers, pages, keywords, titles).
  `PluginManager` has no preferences API.
- Note `FileUtils` appears in the `.d.ts` files but in **none** of the official docs — the types
  are the only reference for it.
- Consequence: persisting anything (e.g. a todo list as JSON) requires a **native Android
  module**, which means `buildPlugin.sh`'s Gradle path. Writing a JSON file into the plugin's
  own directory is *not* a way to avoid that — you still need a native module to do the writing.
  The only reason `.sticker` files can land there is that `saveStickerByLasso` is itself a
  native API that does the write for us.

## Permission model: the plugin's private dir is the only exempt path

- Source: `docs.supernote.com/en/plugin-base/permission.md`, read 2026-08-31. Matches
  `PluginManager.hasPermission(...)` / `requestPermission(...)` in the types.
- Permissions are `plugin.permission.FILE:READ`, `FILE:WRITE`, `FILE:DELETE`, `INTERNET`.
  `requestPermission` returns 0 = denied, 1 = allow while in use, 2 = always allow, and shows a
  user-facing dialog.
- The plugin's private directory (`/data/data/.../plugins/<pluginID>`, i.e. what
  `getPluginDirPath()` returns) is **the only path exempt from all permissions** — free
  read/write/delete. This explains why our `.sticker` writes work with no permission request.
- Shared storage (`Note/`, `Document/`, `Export/`, `Inbox/`, `MyStyle/`, `Screenshot/`) requires
  the matching permission. Paths outside both sets are unreachable regardless of permissions.
- `FILE:WRITE` also covers *modifying note content* — including element deletion. Relevant to
  the future "draw a checkbox into the note" work, which will need to request it.
- **Reading a note's contents needs `FILE:READ`, and it is not optional.** Confirmed on-device
  2026-08-31: with no permissions granted, `getPageSize`, `getNoteType` and `getElementNumList`
  all fail with `success: false`, `error.code: 1503`,
  `message: "File read permission has not been requested"`. Notes live in shared `Note/` storage,
  so every file-scoped call is gated — reads included, not just writes.
- Which calls are *not* gated is the useful distinction: anything scoped to the current view or
  selection works with no permission at all. `getCurrentFilePath`, `getCurrentPageNum`,
  `getPageDisplaySize`, `getLassoElements`, `recognizeElements` and `saveStickerByLasso` all
  succeed unpermissioned — which is why the whole lasso capture feature never needed a permission
  prompt. The moment we address a note *by path*, `FILE:READ` becomes mandatory.
- Practical consequence: request `FILE:READ` **before** `FILE:WRITE`. Without read, file-scoped
  calls fail at 1503 long before any write is attempted, which makes a missing read permission
  look like a broken write.
- **Permissions must be DECLARED in `PluginConfig.json` before they can be requested.** This is
  the step that isn't obvious from `PluginManager`'s types at all — `requestPermission` looks
  self-contained, but calling it for an undeclared permission **throws**
  `"This permission has not been declared"` (confirmed on-device 2026-08-31; the docs describe it
  as error 1500). It throws rather than returning a failed `APIResponse`, so an un-caught call
  looks like a dead button.
- The declaration field is `uses-permissions`, a string array, in the **root**
  `PluginConfig.json`:
  ```json
  "uses-permissions": [
    "plugin.permission.FILE:READ",
    "plugin.permission.FILE:WRITE"
  ]
  ```
  `buildPlugin.sh` copies the root config into `build/generated/` wholesale before adding
  `iconPath`/`reactPackages`/`nativeCodePackage`, so extra fields carry through untouched.
- Full flow, in order: declare in `PluginConfig.json` → `hasPermission()` to check →
  `requestPermission()` to prompt the user → then call the file-scoped API. Skipping the
  declaration fails at step 3; skipping the request fails at step 4 with 1503.
- Deleting *elements* inside a note is validated against `FILE:WRITE`, not `FILE:DELETE` —
  `FILE:DELETE` is about deleting files in shared storage. We don't need it.
- Still unverified: whether files under `getPluginDirPath()` survive a plugin
  uninstall/reinstall. Note this is a *separate* question from AsyncStorage's durability (see
  below) — AsyncStorage writes to the host app's storage, the plugin dir belongs to the plugin.
  This matters because `TodoItem.stickerPath` points into the plugin dir: if that dir is wiped on
  reinstall but the todo list isn't, saved todos will reference `.sticker` files that no longer
  exist. Nothing renders stickers yet, so it's latent rather than broken — but whatever reads
  them must tolerate a missing file.

## `buildPlugin.sh` silently skips `@react-native-*` scoped native modules

- `buildPlugin.sh` decides whether to run the Gradle native build by scanning `node_modules` for
  packages containing `.java`/`.kt` sources (`scan_node_modules_native_code`), filtered through
  `is_ignored_module_name`. That filter skips anything matching the glob `@react-native*`, which
  is meant to exclude React Native's own internals.
- **`@react-native-async-storage/async-storage` matches that glob** and is therefore ignored.
  Verified 2026-08-31 by extracting `is_ignored_module_name` and running it standalone:
  `@react-native-async-storage/async-storage` → ignored; `react-native-sqlite-storage` and
  `react-native-fs` → detected.
- Consequence: with only AsyncStorage added, `should_build_native` stays false, the script
  prints *"Build conditions not met; skipping native build and reactPackages update"*, and still
  produces a `.snplg` — but one with no `app.npk` and no `nativeCodePackage` in
  `PluginConfig.json`. The build **looks successful**; the native module is simply absent.
- **Fixed in this repo 2026-08-31**: `is_ignored_module_name` now matches the RN-owned scopes
  exactly (`@react-native/*`, `@react-native-community/*`, `@react-navigation/*`) instead of the
  bare prefix. Verified afterwards that `scan_node_modules_native_code` reports exactly one
  module — `@react-native-async-storage/async-storage` — and nothing else was swept in.
  `buildPlugin.ps1` has the same bug and has NOT been fixed (we don't build on Windows).
- Second, separate issue — stale autolinking. In `main()`, `get_react_packages_from_autolinking_source`
  reads `android/app/build/generated/autolinking/src/main/java/com/facebook/react/PackageList.java`
  *before* `build_android_apk` runs Gradle, which is what regenerates that file. So on the first
  build after adding any native dependency, the list is stale and the new package won't be
  written into `reactPackages`. (As of 2026-08-31 ours contains only `MainReactPackage` and
  `PluginPackage`.) Affects any native module, not just scoped ones.
- **Workaround for both:** add the package manually in `MainApplication.kt`'s `getPackages()` —
  `find_manual_react_packages_from_application` parses that file directly, so it both triggers
  the native build and lands in `reactPackages` with no staleness. It strips `//` comments before
  matching, so the template's commented-out `// add(MyReactNativePackage())` correctly triggers
  nothing.
- Note: `buildPlugin.sh` has **no** support for a `node_change/` patched-dependency directory.
  Some community plugins (ink2task) reference one for patching `react-native-sqlite-storage` —
  that is their own fork of the build script, not stock tooling.

## Supernote's native "to-do" can't serve as the on-page checkbox

- The SDK hints at a native to-do concept: `LassoElementTypeNum.todoLinkNum` counts "todo links"
  inside a lasso, and `Link` carries an undocumented `linkType: number`. That looked like it
  might give us milestone step 4 for free.
- It doesn't. Confirmed on-device 2026-08-31 by Malin: adding selected text to the native to-do
  produces a **link back to the note, visible only inside the to-do app**. The note page itself
  gets **no visual indication** that the text is now a to-do.
- Milestone step 4 needs a mark *on the page*, so the checkbox itself has to be drawn ourselves.

**Correction, 2026-09-01.** This section used to end with "don't re-investigate `linkType` hoping
for a shortcut". That advice was wrong and nearly cost us the best anchor available. What's true
is narrow: the *native to-do feature* draws nothing on the page. It does **not** follow that link
elements are useless — a plugin creating its own stroke link with `style: 2` **does** draw a
dashed border around the handwriting. See "Stroke links are the real anchor" below. Lesson worth
keeping: "feature X doesn't do what we want" is not evidence about the API primitive underneath
it.
- For jumping from our list back to the source note we don't need links anyway:
  `PluginFileAPI.openFile(filePath, page)` does exactly that, and we already store
  `notePath`/`page` on every `TodoItem`.

## Drawing a shape on a page — the working recipe

Established on-device 2026-08-31 via `src/probe/AnchorProbe.tsx`. Almost none of this is in the
docs, and several parts contradict what the docs imply.

- Element types (`Element` / `ElementType`): `TYPE_STROKE` 0, `TYPE_TITLE` 100, `TYPE_PICTURE`
  200, `TYPE_TEXT` 500, `TYPE_LINK` 600, `TYPE_GEO` 700, `TYPE_FIVE_STAR` 800. No checkbox type.
- `Geometry` supports `straightLine`, `GEO_circle`, `GEO_ellipse`, `GEO_polygon` — no rectangle
  primitive. **`GEO_polygon` renders correctly when inserted by a plugin**, so a checkbox can be
  a single element. (Worth noting because the Nomad's own shape tool only offers straight lines,
  which made polygons look unproven.)

### `Geometry.points` are SCREEN PIXELS, not EMR

The single most expensive thing we got wrong. `Element.maxX`/`maxY` are documented as being "in
the EMR coordinate system", and it is tempting to assume geometry points match. **They do not.**

- Geometry points are page/screen pixels — on the Nomad, a 1404 x 1872 space.
- A straight line drawn with the device's own shape tool dumped as
  `[{x:259,y:874},{x:986,y:874}]` — plainly pixels, not the ~15819 EMR range.
- `PointUtils.androidPoint2Emr` is for a *different* job. Note it also rotates and flips
  (`srcPoint = {x: point.y, y: pageSize.width - 1 - point.x}`), so EMR x runs down the page and
  EMR y runs right-to-left. Don't reach for it when building geometry.
- Failure mode if you get this wrong is nasty: EMR-sized coordinates produce an element that
  inserts, persists, and reads back **successfully** — it's just drawn off the page. Every API
  reports success and nothing is visible.

### Pen values that actually render

Copied from a native straight line; guessed values did not work.

- `penType: 10`, `penColor: 0` (black), `penWidth: 500`.
- `penWidth` must be >= 100 or `insertGeometry` fails with error 107. Note 500 is the native
  value, so penWidth is evidently *not* in the same units as the points.
- General technique that repeatedly beat guessing: **read an existing element off the page and
  copy its values.** Undocumented enums (`penType`, `penColor`) are answered instantly by
  whatever the device itself produced.

### Insert paths — all three work

`PluginCommAPI.insertGeometry(geometry)` (simplest, but can't set `userData` since that lives on
`Element`), `PluginCommAPI.insertPageElements(elements, page, layer?)`, and
`PluginFileAPI.insertElements(notePath, page, elements)`. All three insert and persist.

- `PluginNoteAPI.saveCurrentNote()` exists and is worth calling after a comm-API insert — the
  comm APIs edit the live document while `getElements` reads the file. (It is on `PluginNoteAPI`,
  not `PluginCommAPI` — easy to miss.)
- `PluginCommAPI.reloadFile()` refreshes the rendered page.
- `getLastElement()` returns the last *existing* element, so it is not proof your insert worked —
  it happily returns someone else's element after a failed insert.

### Recognition notes can't use layers

`getLayers` on a note with handwriting recognition enabled fails with error 804, "recognized
notes cannot operate on layers". Ordinary notes report layer 0 "Main layer", visible. Step 4 will
have to either special-case recognition notes or not offer checkboxes there.

### `userData` works on firmware 3.29.45 — the loss was a firmware bug

Supersedes the "Don't try to tag them" conclusion below, for `userData` only (`uuid` is still a
per-read handle).

**Confirmed on-device 2026-10-01, Nomad on Chauvet 3.29.45 Beta, sn-plugin-lib 0.1.65**, with the
probe's T1/T2/T3 (`src/probe/AnchorProbe.tsx`):

- A `TYPE_TEXT` element with `textContentFull: '☐'` and a `userData` tag, inserted via
  `PluginFileAPI.insertElements`, **keeps its tag across a full device restart**.
- **Toggling works by path:** find the element by `userData`, set `textBox.textContentFull = '☑'`
  (and `pageNum`), `PluginFileAPI.modifyElements`, `reloadFile`. The glyph changes on the page and
  the tag survives the modify.
- The Nomad's font renders both `☐` and `☑` in a text box.
- **The toggle also works on a note that isn't open** (confirmed 2026-10-01 via the real feature,
  `setCheckbox` in `src/note/checkbox.ts`): ticking a todo from another note's page flipped its
  box, visible when that note was opened afterwards.
- So the checkbox can be its own tagged element; no stroke link (and no browser-search-on-tap)
  needed. Trade-off: unlike a stroke link, it does not follow handwriting that gets moved.
- **`PluginCommAPI.getLassoRect()` is in the same screen-px space as `textBox.textRect`.**
  Confirmed on-device 2026-10-01: a box placed from the lasso rect landed right next to the
  handwriting. At box size 80 / font 54, simply centring on the lasso rect looks right (no
  vertical offset needed — the smaller 60 / 40 box had looked slightly high).

Background, from before the update:

- Re-tested on-device 2026-10-01 with collapse-expand's exact recipe (`createElement(TYPE_TEXT)`
  → `userData` → `PluginFileAPI.insertElements` by path, `saveCurrentNote` only *before*). Same
  result: the text box renders, but `getElements` returns it with **empty `userData` immediately**,
  no restart needed.
- The collapse-expand plugin (`github.com/vincentaravantinos/supernote-collapse-expand`, their
  `BUGS/B-016.md`) hit the identical symptom: `getElements`, `getElement` and `getLassoElements`
  return no `userData` for any element type, right after writing it. They traced it to firmware
  **3.29.43 (Manta/Nomad) / 2.26.40 (A5X/A6X)**, reported it (r/Supernote_dev post `1w44uvs`), and
  say Ratta **fixed it in 3.29.44 / 2.26.41**, after which their whole plugin (all state in
  `userData`, payloads up to 425 KB) round-trips fine. Community evidence; not yet confirmed on
  our Nomad.
- The `sn-plugin-lib` JS layer passes elements to native untouched (`PluginFileAPI.insertElements`
  → `NativePluginAPI.insertElements`), so nothing on the JS side strips it — it's the firmware.
- Malin read the release notes (Reddit isn't fetchable from Claude Code — WebFetch and curl are
  both refused): the **Chauvet 3.29.45 Beta for Manta/Nomad** notes
  (r/Supernote_beta `1wfueux`) explicitly list the `getElements`-can't-retrieve-`userData` fix.
  So for the Nomad, 3.29.45 is the version to trust, not collapse-expand's 3.29.44.
- The 3.29.44 preview post (r/Supernote_dev `1w57c45`) says to run
  `yarn upgrade sn-plugin-lib --latest`. Checked 2026-10-01: `latest` on npm is **0.1.65**, which
  we already have — no library change needed for this fix.
- **Consequence: the plugin needs firmware ≥ 3.29.45** on Manta/Nomad. On older firmware the tag
  silently reads back empty and the plugin will never find its own checkboxes.

### Answered — elements have NO stable identity. Don't try to tag them.

Tested on-device 2026-09-01 with `src/probe/AnchorProbe.tsx` ("B: pageElements" stamps
`userData`, "3. Read back" reports a per-anchor verdict). Result: **both `userData` and `uuid`
are lost**, and it takes far less than a reopen to lose them.

- **`userData` reads back empty.** We set `Element.userData` to a tag before `insertPageElements`;
  the element inserts, renders and persists, but every read-back reports `userData=(empty)`. The
  field exists on the RN model (`Element.d.ts`: `userData: string`, "custom user data") and is
  accepted without error, but it evidently never reaches the `.note` file. **Silent** — no failed
  `APIResponse`, nothing to catch.
- **`uuid` changes on every single read.** Not per session, per *call* — reading the same
  unmodified page twice in a row yields different uuids, with no close/reopen involved.
- The types say why, and it means uuid was never a candidate: `uuid` is a **handle into the
  Android-side native cache**, minted per read, not an identity stored in the file. See
  `ElementDataAccessor`'s `constructor(uuid, type, dataType)` reaching "Android native cache",
  and `PluginCommAPI.recycleElement(uuid)` — "Recycles an Element (Trail) object". A handle you
  are expected to *release* is by definition not a persistent id. (This is also why the probe
  reads `el.uuid` into a local before calling `recycleElement`.)

**Consequence for milestone step 4: there is no way to mark an element so we can find it again.**
Don't spend more time looking for one — `userData`, `uuid` and a custom element type are all
ruled out.

### Stroke links ARE the real anchor — `destPath` is an arbitrary persisted string

Found 2026-09-01 by reading the **SuperTask** plugin
(`github.com/apclark31/supernote-plugin-research/tree/main/plugins/SuperTask`), which marks
captured handwriting with exactly the dashed rectangle we wanted. Confirmed against
`sn-plugin-lib`'s own types, so this is not community hearsay — the API is
`PluginNoteAPI.setLassoStrokeLink`, documented in `PluginNoteAPI.d.ts`.

The whole trick, from `src/screens/TaskAdd.tsx`:

```js
await PluginNoteAPI.setLassoStrokeLink({
  destPath: `supertask://task/${task.id}`, // arbitrary string — THIS is the anchor
  destPage: 0,
  style: 2,     // 0=solid underline, 1=solid border, 2=dashed border
  linkType: 4,  // 0=note page, 1=note file, 2=document, 3=image, 4=URL
});
await PluginNoteAPI.saveCurrentNote();
```

and finding it again, from `src/utils/noteHeal.js`:

```js
const res = await PluginFileAPI.getElements(pageNum, notePath);
const found = res.result.some(
  el => el.type === 600 && el.link?.destPath === `supertask://task/${taskId}`,
);
```

Why this matters so much:

- **`destPath` gives us the element identity we concluded didn't exist.** The "no stable identity"
  finding above is still correct *as stated* — `userData` and `uuid` are both dead ends — but it
  turns out identity does exist on `TYPE_LINK` (600) elements, in a field nominally meant for URLs.
  `linkType: 4` tells the device "this is a website URL", so it stores the string verbatim and
  never tries to resolve it. A custom `scheme://` is then just a tag that happens to live in a
  URL field.
- **It operates on the current lasso selection, so no coordinates are involved.** No page-size
  maths, no EMR-vs-pixels trap, no drift. That's our exact capture flow already.
- **It binds to the strokes, not to a position — verified on-device 2026-09-01.** `destPath`
  survived a full Supernote restart, and after dragging the handwriting across the page the
  border **followed it**, reporting a rect 615px from where it was created. `Link` carries its
  own `X/Y/width/height`, so reading the link back tells us where the handwriting *is now*, not
  where it used to be. This is the decisive advantage over a square drawn at fixed coordinates:
  the anchor tracks the content instead of the page.
- **SuperTask trusts it enough to recover from file renames with it.** `noteHeal.js` finds a
  renamed `.note` by probing candidate files for its own `supertask://` link. You don't build
  that on an anchor you think is flaky.

Also confirmed by their code, independently of our probe: they call `recycleElements(els)` after
every `getElements`, consistent with our finding that `uuid` is a native-cache handle.

Minor: they call `PluginCommAPI.lassoElements(rect)` through an `as any` cast, but it *is* in our
`PluginCommAPI.d.ts` (re-lassoing a region by rect). No cast needed on our version.

**`setLassoStrokeLink` returns a result CODE, not a boolean.** `0=success, -1=failure,
-2=destination needs upgrade`. So `success: true` with `result: -1` is a failed call — checking
`success` alone, the way every other API in this codebase is checked, would silently record a link
that was never created. Check `res.success === true && res.result === 0`.

**Consequence — this is the anchor for milestone step 4.** Link the lasso at capture time, store
`destPath` on the `TodoItem`, and find the handwriting again later by reading elements and
matching `el.type === 600 && el.link.destPath`. The link's `X/Y/width/height` then gives the
*current* position of the handwriting, which is where anything we draw alongside it has to go.
Note the asymmetry: the link follows the strokes, but a geometry element we insert does **not** —
so a drawn checkbox has to be repositioned from the link's rect rather than assumed to still be
in the right place.

### The border-style flip works, but a stroke link is TAPPABLE — that's the catch

Tested on-device 2026-09-01. `Link.style` (0=solid underline, 1=solid border, 2=dashed border) can
be flipped **both ways**, dashed ↔ solid, and the change renders.

**The route that worked is the good one: `PluginFileAPI.modifyElements(notePath, page, [el])` —
by path, with no lasso and no need for the note to be open.** Read the page's elements, find ours
by `destPath`, mutate `el.link.style`, write the element back. The lasso-based fallback
(`lassoElements(rect)` + `modifyLassoLink`) was never needed.

That is a bigger result than the border cosmetics, and it holds regardless of what we decide the
mark should look like: **the whole app→note direction is proven.** Ticking a todo in the plugin's
list can update the note file directly, without opening it. Combined with `insertElements` (also
proven by path) and `deleteElements`, every write we need for step 4 is available off-lasso. The
only direction still unproven is note→app — noticing a mark the user made by hand — which can't
be live and will have to happen when the plugin next opens.

Two findings say the *style flip* shouldn't be the final visual, though:

- **The link is clickable, and tapping it opens a browser search.** With `linkType: 4` the device
  genuinely believes `overblick://probe/<id>` is a website, so tapping the handwriting runs a
  Google search for that string. A user tapping their own note and being thrown into a browser is
  not acceptable, and it's a property of `linkType: 4` itself — not of the style flip. **This
  affects the anchor, not just the done-marker.** SuperTask has the same behaviour with
  `supertask://task/<id>`, so it's inherent to the technique rather than something we got wrong.
- **Changing the style reflows the link decoration.** Going dashed → solid narrows the box and
  moves the little link glyph *into* the handwriting rather than sitting after it. Ugly, and it
  means the two states differ by more than a line style.

Worth trying when we return to this (untested, in rough order of promise):

1. **`Link.fullText` / `showText`** are also persisted fields on `Link`. If either survives a
   round trip, the tag could live there instead of in `destPath` — which would free `destPath` to
   be something harmless.
2. **`linkType: 0` (note page) or `1` (note file) pointing at the note's own path**, so a tap is a
   no-op jump to where you already are instead of a browser launch. Only useful combined with (1),
   since `destPath` would no longer be free to carry the id.
3. **Keep the link purely as an invisible anchor** (if a style exists that draws nothing) and draw
   the checkbox ourselves — back to the original plan, but with a durable anchor underneath it.

### Fallback if a link won't do: match on geometry

Confirmed on-device 2026-09-01 via the probe's "6. Find my square", across a **full Supernote
restart** (a stronger test than reopening the note — and note there is no obvious way to "close" a
note on the device at all, you just open a different one, so restart is the honest test).

A square inserted at left 300, top 500, side 120 read back afterwards as:

```
inserted:  (300,500) (420,500) (420,620) (300,620) (300,500)
read back: (299,500) (419,500) (419,620) (299,620) (299,500)
```

- **The shape survives.** Same five points, same order, closing duplicate intact.
- **x comes back exactly 1px low; y is exact.** Uniform across every point — a constant offset,
  not noise, and it does **not** scale with the size of the shape. A small fixed tolerance is
  therefore permanently sufficient; the probe uses 4px and measured drift of 1px.
- Hypothesis for the off-by-one, unproven and not worth proving: the documented px→EMR transform
  is `{x: point.y, y: pageSize.width - 1 - point.x}` — only x carries a `width - 1` offset, y maps
  straight through. An off-by-one between the write and read halves of that conversion produces
  exactly this signature. Treat as a plausible explanation, not fact. Either way the fix is the
  tolerance.
- **Don't match on equality.** The obvious implementation — compare inserted points to read-back
  points — fails on every single element because of that 1px.

So the anchoring recipe is: **record where you drew the box (screen px), then find it again by
searching the page for a `TYPE_GEO` element whose bounding box matches within a few px.**

`numInPage` still has one job, but only a fleeting one. It's how `deleteElements` and
`modifyElements` address elements, so the pattern must be **search by geometry → act on the index
you just resolved, immediately**. Never persist an index between sessions: it's an index within
the page and shifts as the user edits above it.

Indices are **1-based**: `getElement(notePath, page, num)`'s doc says so, and the probe's match
landed on element `#1` on a page whose only geometry was ours. An off-by-one here would delete
the wrong element.

## Touches: `registerMotionListener` — confirmed on-device 2026-10-01

Tested with a temporary touch logger (since deleted) registered from `index.js`, on a Nomad, 3.29.45.

- **Fires while the plugin view is closed**, for every touch on the screen, as long as the
  listener is registered at plugin startup (`index.js`), not from a component.
- **Module memory is shared** between that listener and the plugin view: touches recorded while
  the view was closed were still in the module's array when the view opened. Same JS runtime.
- **`x`/`y` are the same screen px as `textBox.textRect` and the lasso rect.** Three finger taps
  on `☐` boxes all fell well inside their `textRect`; no offset, no scaling.
- **`toolType` tells them apart: 1 = finger, 2 = pen** (as the types say). A pen tap is also
  drawing, so only finger taps should act.
- A finger tap's DOWN and UP report identical coordinates.
- It **also reports taps on the Supernote's own UI** (toolbar at y≈27, sidebar buttons): there is
  no flag for "native UI consumed this". Hit-testing against our boxes filters almost all of
  these; a native menu drawn over a box can't be told apart (collapse-expand's `BUGS/B-008.md`).
- Registration: `PluginManager.registerMotionListener(1, {onMsg})`. Use action 0 (DOWN) and
  1 (UP); 2 (MOVE) floods while writing.

### Inside the listener: call the API one call at a time, not with `Promise.all`

Observed on-device 2026-10-01 (Nomad, 3.29.45), via a step trace in `src/note/boxTap.ts`:

- With `Promise.all([getCurrentFilePath(), getCurrentPageNum()])` called from the motion
  listener (plugin view closed), the tap handler **never resumed**. No error, no answer. Its
  `busy` flag stayed set and every later tap was dropped.
- The same two calls awaited **one after the other** answered at once (same millisecond in the
  trace), and the whole tap — both calls, `getElements`, toggle — finished within a second.
- The same `Promise.all` pattern works from the plugin view (`useLassoCapture` uses it), so this
  looks specific to calls made from the listener. Observation, not a confirmed mechanism.
  Collapse-expand also calls them sequentially from its tap handler.
- Defence kept in `boxTap.ts`: every awaited call has an 8 s timeout, so a call that never
  answers costs one tap instead of all of them.

### Register only ONE listener per event — ids are `Date.now()`

Found 2026-10-01 when the real tap handler (`src/note/boxTap.ts`) did nothing on-device while the
probe's touch logger, registered right after it, kept recording.

- In `sn-plugin-lib/src/PluginManager.ts`, `registerEventListener` (which `registerMotionListener`
  and the pen-up listener go through) sets `const id = Date.now()` and stores the subscription in
  a per-event `Map` keyed by that id.
- Two registrations in the same millisecond, e.g. back-to-back calls in `index.js`, get the
  **same id**, so the second `Map.set` **silently replaces** the first. No error, no warning;
  the first listener just never fires.
- Rule: one motion listener for the whole plugin (ours is in `boxTap.ts`), dispatching to
  anything else that needs touches. Collapse-expand does the same.

### Event listeners crash the `yarn android` dev loop

- Found 2026-10-02: `registerMotionListener` (any `registerEventListener`) in the standalone dev
  loop throws a native `NullPointerException` on `HostCommonAPI.registerPenUpListener(...)`:
  there's no plugin host, so the host API object is null. Shows as a red screen at startup.
- `index.js` therefore only calls `startBoxTaps()` when `!__DEV__`. Tapping boxes can only be
  tested on-device anyway.

## The native build needs JDK 21 — Android Studio's bundled JDK is too new

- `./buildPlugin.sh` only invokes Gradle when a native module is present, so this doesn't bite
  until the first native dependency is added.
- Android Studio (as installed here, 2026-08-31) bundles **JDK 25** at
  `/Applications/Android Studio.app/Contents/jbr/Contents/Home`. Building with it fails early in
  settings evaluation:
  `Error resolving plugin [id: 'com.facebook.react.settings'] > 25.0.2` — the version number in
  that message is the *JDK* version, which makes it look like a plugin-version problem when it
  isn't.
- Works with Homebrew's `openjdk@21`:
  `JAVA_HOME=/opt/homebrew/opt/openjdk@21 ANDROID_HOME=$HOME/Library/Android/sdk ./buildPlugin.sh`
- There is no `android/local.properties` in this repo, so `ANDROID_HOME` must be set in the
  environment (or the file created) for Gradle to find the SDK.
- **A Gradle failure does not fail the build.** In `main()`, `build_android_apk` is called inside
  an `if`, so when Gradle can't run the script prints "APK build failed" in red and then carries
  on to zip the package anyway — producing a `.snplg` with no `app.npk` and no
  `nativeCodePackage`. Same silent outcome as the glob bug above, different cause. Treat
  `build/generated/PluginConfig.json` as the thing to check, not the script's exit.
- Set up here 2026-08-31 in `~/.zshrc` (`JAVA_HOME`, `ANDROID_HOME`, and JDK 21 on `PATH`), so
  `./buildPlugin.sh` needs no prefix. Worth knowing if this ever breaks again: the machine's
  original Android/Java exports live in `~/.bash_profile`, which **zsh never reads** — that file
  is a decoy.

## AsyncStorage survives both device restart and plugin reinstall

- Confirmed on-device 2026-08-31 with `@react-native-async-storage/async-storage@1.24.0`: todos
  written by the plugin were still there after a **Nomad restart**, and also after
  **uninstalling and reinstalling the plugin**.
- The reinstall result confirms AsyncStorage does not live inside the plugin's own installed
  directory — it writes into the Supernote host app's storage, which a plugin uninstall doesn't
  touch. That's a real advantage over storing a JSON file under `getPluginDirPath()`, and it's
  why key namespacing matters: that storage is shared with the host app and any other plugin
  using AsyncStorage. We namespace as `overblick:*` (see `src/todos/todoStorage.ts`).
- Flip side worth remembering: uninstalling the plugin does **not** clear its data. There is no
  "clean slate" reinstall — resetting state needs an in-app action, not a reinstall.

## Adding a native module: the working recipe

Validated end-to-end 2026-08-31 with `@react-native-async-storage/async-storage@1.24.0`.

1. Install the dependency. Pin to a version a known-good Supernote plugin uses if possible —
   sn-clipper runs the same stack as us (RN 0.79.2, react 19.0.0, sn-plugin-lib ^0.1.65) on
   async-storage 1.24.0. Newer 3.x pulls in KSP + Room and its own AGP classpath, which is a lot
   of extra Gradle surface for no gain here.
2. Regenerate the autolinking list *before* packaging, or the stale-`PackageList.java` problem
   above silently drops the package:
   `cd android && ./gradlew :app:generateAutolinkingPackageList`
3. Run `./buildPlugin.sh`. Then **check `build/generated/PluginConfig.json` before installing** —
   it must contain both `"nativeCodePackage": "/app.npk"` and the new package in
   `reactPackages`. A build that skipped the native step still exits 0 and still writes a
   `.snplg`, so a successful-looking run proves nothing on its own.
4. Do NOT add the package manually to `MainApplication.kt`'s `getPackages()`. Autolinking already
   adds it, so a manual `add(...)` registers it twice; RN rejects duplicate native module names
   and this would break the `yarn android` dev loop. (The vendor template's commented-out
   `// add(MyReactNativePackage())` hint is for packages autolinking genuinely can't see.)
