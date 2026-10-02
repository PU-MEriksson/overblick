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

## The vision (long-term)

This is where the app is heading. Use it to avoid painting us into a corner, but only build what's
in **Current focus** below.

**1. Capture and organise.**

- Select handwriting → it becomes a todo. *(Done.)*
- **Quick add:** the todo lands in an **Inbox**, to be sorted later. *(Done.)*
- **Detailed add:** set the time horizon straight away, so it lands in the right place directly.
  It should also be possible to do this from the note itself.
- Every todo has a **time horizon**: today, this week, this month, future log. *(Done.)* Later:
  the future log split by month.
- Later: schedule a todo for a **specific date**.
- Later still: **projects**.

**2. Overview, inspired by Things, adapted for e-ink.**

- A sidebar (maybe collapsible) with **Inbox, Today, This Week, This Month, Upcoming**. In the
  week and month views, the todos planned for today / this week are included too. In Upcoming,
  each todo appears exactly once (that view exists today, as the main list).
- Much of what makes Things feel good relies on dragging and a fast screen. The Nomad has
  neither, so this needs trying out on-device rather than designing in the abstract.

**3. The note shows what's been captured.**

- A **checkbox to the left of the handwritten task**, its state synced with the app. *(Done.)*
  Maybe also a dashed underline or similar.
- Flipping through a daily log, I should see at a glance which tasks are already in the app.

**4. Import from the app into a note.**

- Open a new page and import e.g. **today's todos**.
- Either as the original handwriting (the saved `.sticker`) or as typed text.

## Current focus

**Not decided yet.** Pick from the vision above together with Malin, then write it here as a few
concrete steps.

Until something is written here, don't build ahead: no recurring tasks, tags, specific dates,
projects or filters.

## Where things are

- `App.tsx`: the screen. Picks what to show (spinner, error, list, editor).
- `src/todos/todoStore.ts`: the one copy of the todo list and every change to it, outside
  React so non-component code (the tap listener) shares it. Each change goes through
  `commit()`, which updates the list **and** saves.
- `src/todos/horizon.ts`: which section of the Upcoming view a todo belongs in, and the
  grouping into those sections. Plain JS, no React.
- `src/todos/useTodos.ts`: how components read the store (`useSyncExternalStore`).
- `src/todos/todoStorage.ts`: reads/writes the list to AsyncStorage (key `overblick:todos`,
  wrapped in a `schemaVersion` envelope; older data is migrated, never refused).
- `src/lasso/useLassoCapture.ts`: the lasso button (id `200`, registered in `index.js`) →
  OCR + `.sticker` ink snapshot + note path/page/rect + the checkbox in the note.
- `src/note/checkbox.ts`: everything that writes into a note: permissions, drawing the `☐`
  (`insertCheckbox`) and flipping it (`setCheckbox`).
- `src/types.ts`: `Capture` and `TodoItem`.
- `src/note/boxTap.ts`: the plugin's only touch listener (registered in `index.js`). A finger
  tap on a box in the note ticks its todo.
- `docs/api-notes.md`: everything learned about the Supernote API and build tooling.

## What works today

All of this works on-device. Todos persist across restarts and plugin reinstalls.

- **Capture:** lasso handwriting → the plugin's lasso button → a todo with the OCR text, the
  ink as a `.sticker`, and where it came from (note, page, rect). It lands in the Inbox.
- **Checkbox in the note:** capture draws a `☐` text element left of the handwriting, tagged
  with `userData` (stored as `TodoItem.checkboxTag`). At the margin it overlaps the writing;
  that's accepted.
- **Ticking stays in sync both ways.** Ticking in the list flips the box to `☑` / `☐`, also in a
  note that isn't open. A finger tap on the box ticks the todo, with the plugin view open or
  closed. Pen taps are ignored (they draw).
- **Edit:** long-press a todo → action bar → Edit: fix the OCR text and choose *when* (Inbox /
  Today / Week / Month / Future). Delete is in the same bar.
- **Time horizon:** `horizon` (`'day' | 'week' | 'month' | 'future'`, `null` = Inbox) plus
  `plannedOn` (local `'YYYY-MM-DD'`, stamped only when the horizon changes).
- **The list is the Upcoming view:** sections Inbox, Today, This week, This month, Future log.
  Each todo is in exactly one; empty sections are hidden.
- **Never overdue (deliberate).** An unfinished todo stays in its section until it's ticked or
  moved. Nothing is ever marked as late.
- **Done todos go straight to the Logbook (deliberate).** Visible done todos feel like
  clutter, even sunk to the bottom or kept only for the day; both were tried on-device. The
  Logbook is a collapsed section at the bottom ("Logbook · 12", tap Show/Hide), newest first
  by `doneOn` (the day it was ticked). Unticking one sends it back to its section.

**Known limits:**

- The box needs firmware **≥ 3.29.45**; older firmware drops `userData` on read.
- The box doesn't follow handwriting that gets moved.
- Todos captured before the box existed have `checkboxTag: null` and have no box.
- The tap listener is off in the dev loop (no plugin host), so box taps can only be tested
  on-device.
- Details and dead ends: `docs/api-notes.md`.

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

I know some web development (mostly Vue) but I'm **new to React Native**, rusty on React and JS syntax,
and new to the Supernote plugin API.

- **Explain what you're doing and why.** Explain to me as you would to a beginner. When something is React- or RN-specific, say how it differs from what I'd expect on the web.
- **One concept at a time.** A small change I understand beats a big one I don't.
- **Keep the flow explicit.**
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
