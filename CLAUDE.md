# CLAUDE.md — overblick

## What this is

**overblick** ("overview" in Swedish) is a plugin for the **Supernote Nomad** e-ink device. It
turns handwritten text in a note into a todo item and gives an overview of all todos across notes.

## Why it exists

This is a personal tool for my own workflow, not a general product. I practise **bullet
journaling** (Ryder Carroll's practical method, not the aesthetic kind) on e-ink tablets. It's
the task system that has worked best for me, and handwriting is what makes it stick.

Its weakness: **tasks get lost.** It's easy to miss migrating one, or to forget to check the
future log. Daily, weekly, monthly and future logs live on different pages, and there's no way to
see everything at once. I can't fully trust the system, because I don't always check everywhere.

So **the note stays the workspace; the plugin is the overview.** Judge design choices by "does this
fit a handwritten bullet-journal practice", not by todo-app convention.

## The vision (long-term, NOT in scope yet)

This is where the app is heading. Use it to avoid painting us into a corner, but don't build any
of it until the milestone below is done.

**1. Capture and organise.**
- Select handwriting → it becomes a todo (works today).
- **Quick add:** the todo lands in an **Inbox**, to be sorted later.
- **Detailed add:** set the time horizon straight away, so it lands in the right place directly.
  It should also be possible to do this from the note itself.
- Every todo has a **time horizon**: today, this week, this month. Beyond that is undecided
  (quarter? year? someday?). Agreed model: store an anchor date plus a granularity
  (`plannedOn` + `horizon`), never a literal "today", which would go stale overnight.
- Later: schedule a todo for a **specific date**.
- Later still: **projects**.

**2. Overview, inspired by Things, adapted for e-ink.**
- A sidebar (maybe collapsible) with **Inbox, Today, This Week, This Month, Upcoming**.
- Much of what makes Things feel good relies on dragging and a fast screen. The Nomad has
  neither, so this needs trying out on-device rather than designing in the abstract.

**3. The note shows what's been captured.**
- A **checkbox to the left of the handwritten task**, its state synced with the app. Maybe also a
  dashed underline or similar.
- Flipping through a daily log, I should see at a glance which tasks are already in the app.

**4. Import from the app into a note.**
- Open a new page and import e.g. **today's todos**.
- Either as the original handwriting (the saved `.sticker`) or as typed text.

## The milestone (the only thing in scope)

1. User selects handwritten text with the lasso.
2. It becomes a todo, stored with both the handwritten ink and its OCR text.
3. The plugin shows the todos as a text list.
4. A checkbox next to the handwriting on the page, kept in sync with the plugin's list.

Recurring tasks, tags, due dates and filters are out of scope. Do not build ahead.

## Where things are

- `App.tsx`: the screen. Picks what to show (spinner, error, list, editor).
- `src/todos/useTodos.ts`: the todo list and every change to it. Each change goes through
  `commit()`, which updates state **and** saves.
- `src/todos/todoStorage.ts`: reads/writes the list to AsyncStorage (key `overblick:todos`,
  wrapped in a `schemaVersion` envelope; older data is migrated, never refused).
- `src/lasso/useLassoCapture.ts`: the lasso button (id `200`, registered in `index.js`) →
  OCR + `.sticker` ink snapshot + note path/page/rect.
- `src/types.ts`: `Capture` and `TodoItem`.
- `src/probe/`: temporary test screen for note-writing experiments (`SHOW_ANCHOR_PROBE` in
  `App.tsx`). Delete once step 4 is finished.
- `docs/api-notes.md`: everything learned about the Supernote API and build tooling.

## Status

Steps 1–3 are done and work on-device. Todos persist across restarts and reinstalls.

Step 4 is half done:

- **Plugin side: done.** Checkbox in the list, `done` is saved.
- **Note side: not built yet.** What's known:
  - Anchoring is solved: a **stroke link** (`setLassoStrokeLink`) follows the handwriting and
    can be found again later.
  - The plugin can change the note without it being open (`modifyElements`).
  - Open question: **what the mark on the page should look like.** A stroke link is tappable
    and opens a browser search, so it isn't shippable as-is.
  - All the details and dead ends are in `docs/api-notes.md`.

**Next step:** survey what other community plugins draw on the page, then decide on the mark.

## Build & deploy

- **Dev loop:** `yarn start` + `yarn android`. Runs as a normal app, **not** inside the plugin
  host, so anything using `PluginManager` / the plugin bridge won't work there.
- **Plugin package:** `./buildPlugin.sh` → `build/outputs/overblick.snplg`. Needs JDK 21 and
  `ANDROID_HOME` (both set in `~/.zshrc`). If the Gradle step fails, the script still writes a
  broken `.snplg`, so check `build/generated/PluginConfig.json` for `nativeCodePackage` before
  installing. Details in `docs/api-notes.md`.
- **Install:** copy the `.snplg` to the device's `MyStyle` folder → Settings → Apps → Plugins →
  Add Plugin.

## How I want you to work with me

I know web development (mostly Vue) but I'm **new to React Native**, rusty on React and JS syntax,
and new to the Supernote plugin API.

- **Explain what you're doing and why.** When something is React- or RN-specific, say how it
  differs from what I'd expect on the web.
- **One concept at a time.** A small change I understand beats a big one I don't.
- **Keep the flow explicit.** Prefer code that reads top to bottom (e.g. call save where the
  change happens) over things that happen implicitly somewhere else.
- **Keep comments short.** Say why, not the history of how we got here.

## UI

The screen is **black-and-white e-ink**.

- No dark mode.
- Never use color to carry meaning. Use weight, italics, borders or layout instead.

## Research rules for plugin code

The Supernote plugin API is not well represented in your training data, and it changes between
firmware versions. Assume you don't know it.

Before using any `sn-plugin-lib` / `PluginManager` API:

1. Check the official docs: https://docs.supernote.com/en
2. Check the types: `node_modules/sn-plugin-lib/**/*.d.ts`. If docs and types disagree, the types
   win.
3. If neither confirms it exists, **say so and stop.** Don't guess method names.
4. Community hearsay (label it as such): https://www.reddit.com/r/Supernote_dev/

When you learn something non-obvious about the API, add it to `docs/api-notes.md`.
