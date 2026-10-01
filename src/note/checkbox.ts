import {
  Element,
  PluginCommAPI,
  PluginFileAPI,
  PluginManager,
  PluginNoteAPI,
} from 'sn-plugin-lib';
import type {Rect} from 'sn-plugin-lib';
import type {ApiResponse} from '../types';

// The on-page half of a todo: a text element holding one glyph, found again by
// its `userData` tag. Needs firmware >= 3.29.45 — older firmware drops userData
// on read. See docs/api-notes.md.

export const GLYPH_OPEN = '☐';
export const GLYPH_DONE = '☑';

const FILE_READ = 'plugin.permission.FILE:READ';
const FILE_WRITE = 'plugin.permission.FILE:WRITE';

// Screen px, same space as the lasso rect (confirmed on-device). Tuned by eye
// on the Nomad: 60/40 read too small next to handwriting.
const BOX_SIZE = 80;
const BOX_FONT_SIZE = 54;
// Space between the box and the handwriting it belongs to.
const BOX_GAP = 10;
// Extra px to push the box down from centre. 0–1 looked equally right at size 80.
const BOX_NUDGE_DOWN = 0;

// reloadFile() can hang indefinitely (found by collapse-expand); a missing
// refresh only delays showing the box, so we don't wait forever for it.
const RELOAD_TIMEOUT_MS = 5000;

/**
 * Writing into a note by path needs both permissions. READ first: without it,
 * file calls fail with 1503 before writing is even attempted.
 * Shows the system dialog only for a permission not yet granted.
 */
export async function ensureNotePermissions(): Promise<boolean> {
  for (const permission of [FILE_READ, FILE_WRITE]) {
    if ((await PluginManager.hasPermission(permission)) === 1) {
      continue;
    }
    const answer = await PluginManager.requestPermission(
      permission,
      'Överblick needs this to draw a checkbox next to your todo.',
    );
    if (answer === 0) {
      return false;
    }
  }
  return true;
}

/**
 * Left of the handwriting, vertically centred on it, kept on the page. At the
 * margin it overlaps the writing; deliberate — the user leaves room when they
 * want a box.
 */
function boxRectFor(lasso: Rect): Rect {
  const middle = (lasso.top + lasso.bottom) / 2;
  const left = Math.max(0, Math.round(lasso.left - BOX_GAP - BOX_SIZE));
  const top = Math.max(0, Math.round(middle - BOX_SIZE / 2 + BOX_NUDGE_DOWN));
  return {left, top, right: left + BOX_SIZE, bottom: top + BOX_SIZE};
}

function createTag(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `overblick:todo:${Date.now()}-${random}`;
}

/**
 * Draws a ☐ next to the lassoed handwriting. Returns the tag that finds it
 * again, or null if it couldn't be drawn — the todo is still worth keeping
 * then, so this never throws.
 */
export async function insertCheckbox(
  notePath: string,
  page: number,
  lasso: Rect,
): Promise<string | null> {
  try {
    if (!(await ensureNotePermissions())) {
      return null;
    }

    // Flush the open note to disk BEFORE writing by path, never after: a save
    // afterwards writes the note's older in-memory copy back over our insert.
    await PluginNoteAPI.saveCurrentNote();

    const created = (await PluginCommAPI.createElement(
      Element.TYPE_TEXT,
    )) as ApiResponse<Record<string, unknown>>;
    if (!created?.success || !created.result) {
      return null;
    }
    const element = created.result;

    const tag = createTag();
    element.userData = tag;
    element.pageNum = page;
    // Every style field set, so the box doesn't inherit the user's last text style.
    element.textBox = {
      fontSize: BOX_FONT_SIZE,
      textContentFull: GLYPH_OPEN,
      textRect: boxRectFor(lasso),
      textAlign: 0,
      textBold: 0,
      textItalics: 0,
      textFrameWidthType: 0,
      textFrameStyle: 0,
      textEditable: 0,
    };

    const inserted = (await PluginFileAPI.insertElements(notePath, page, [
      element,
    ])) as ApiResponse<boolean>;
    // createElement's object lives in a native cache; release it either way.
    PluginCommAPI.recycleElement(String(element.uuid));
    if (!inserted?.success) {
      return null;
    }

    await redrawPage();
    return tag;
  } catch {
    return null;
  }
}

/**
 * Sets the box to ☑ (done) or ☐. Works whether or not its note is open.
 * Returns false if the box couldn't be found or changed — e.g. the user erased
 * it — which is harmless: the todo list is the source of truth.
 */
export async function setCheckbox(
  notePath: string,
  page: number,
  tag: string,
  done: boolean,
): Promise<boolean> {
  try {
    if (!(await ensureNotePermissions())) {
      return false;
    }

    // Same rule as inserting: save before writing by path, never after.
    await PluginNoteAPI.saveCurrentNote();

    const res = (await PluginFileAPI.getElements(
      page,
      notePath,
    )) as ApiResponse<Record<string, unknown>[]>;
    if (!res?.success || !res.result) {
      return false;
    }
    const elements = res.result;

    let changed = false;
    const box = elements.find(el => el.userData === tag);
    if (box) {
      (box.textBox as {textContentFull: string}).textContentFull = done
        ? GLYPH_DONE
        : GLYPH_OPEN;
      box.pageNum = page;
      const modified = (await PluginFileAPI.modifyElements(notePath, page, [
        box,
      ])) as ApiResponse<number[]>;
      changed = modified?.success === true;
    }

    // Every element getElements returned lives in the native cache.
    for (const el of elements) {
      PluginCommAPI.recycleElement(String(el.uuid));
    }

    if (changed) {
      await redrawPage();
    }
    return changed;
  } catch {
    return false;
  }
}

/** Redraws the open note so a change shows now, not on the next page turn. */
async function redrawPage(): Promise<void> {
  await Promise.race([
    PluginCommAPI.reloadFile(),
    new Promise(resolve => setTimeout(resolve, RELOAD_TIMEOUT_MS)),
  ]);
}
