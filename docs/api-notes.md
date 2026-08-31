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
- Milestone step 4 needs a mark *on the page*, so the checkbox has to be drawn ourselves. Don't
  re-investigate `linkType` hoping for a shortcut — the feature exists, it just renders in the
  wrong place.
- For jumping from our list back to the source note we don't need links anyway:
  `PluginFileAPI.openFile(filePath, page)` does exactly that, and we already store
  `notePath`/`page` on every `TodoItem`.

## Drawing on a page: what's actually available

Not yet used — collected while scoping milestone step 4.

- Element types (`Element` / `ElementType` in `model/Element.d.ts`): `TYPE_STROKE` 0,
  `TYPE_TITLE` 100, `TYPE_PICTURE` 200, `TYPE_TEXT` 500, `TYPE_LINK` 600, `TYPE_GEO` 700,
  `TYPE_FIVE_STAR` 800. There is no checkbox type — consistent with the finding above.
- `Geometry` supports only `straightLine`, `GEO_circle`, `GEO_ellipse`, `GEO_polygon` — **no
  rectangle primitive**. A square checkbox would be a polygon, four straight lines, or an
  inserted `.sticker`/picture.
- Insert/modify/delete: `PluginCommAPI.insertPageElements` / `modifyPageElements` /
  `deletePageElements` / `batchUpdatePageElements` (each takes an optional layer), and the
  `PluginFileAPI` equivalents that take an explicit `notePath`. Writing to a note needs
  `FILE:WRITE` — see the permission section above.
- Open question for step 4's design: elements are addressed by **index within the page**
  (`numsInPage`, `getElement(notePath, page, num)` — "starting from 1"). Whether those indices
  stay stable when the user edits the page around our checkbox is unverified, and it's the crux
  of keeping a checkbox tied to its todo. `searchFiveStars(filePath)` suggests the device solves
  the same "find my marks again" problem for five-star marks by scanning — worth studying as a
  precedent before inventing an anchoring scheme.

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
