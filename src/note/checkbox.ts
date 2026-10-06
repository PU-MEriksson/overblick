import {
  Element,
  PluginCommAPI,
  PluginFileAPI,
  PluginManager,
  PluginNoteAPI,
} from 'sn-plugin-lib';
import type {Rect} from 'sn-plugin-lib';
import type {ApiResponse, Horizon, NoteBox} from '../types';

// The on-page half of a todo: a text element holding one glyph, found again by
// its `userData` tag. Needs firmware >= 3.29.45 — older firmware drops userData
// on read. See docs/api-notes.md.

export const GLYPH_OPEN = '☐';
export const GLYPH_DONE = '☑';
// A migrated box: the todo was carried on to a later page, like a
// bullet journal's `>`. No longer linked to the todo.
export const GLYPH_MIGRATED = '>';

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
// Typed todo text. 44 matched Malin's handwriting on-device.
const TEXT_FONT_SIZE = 44;
// Height of one wrapped line at TEXT_FONT_SIZE. A guess; tune on-device.
const TEXT_LINE_HEIGHT = 60;
// Push the text down so its first line sits level with the bigger box.
const TEXT_NUDGE_DOWN = 8;
// Space between the box's rect and the typed text's rect. Below zero because a
// text box draws its text about 23 px in from its left edge; this leaves the
// same ~30 px between box and words as next to handwriting (measured
// on-device).
const TEXT_GAP = -5;
// Space kept free at the page's right edge by typed text.
const LINE_MARGIN = 60;
// Average character width as a share of the font size, for guessing where
// text wraps. Generous, so the rect is rather too tall than too short.
const CHAR_WIDTH_RATIO = 0.55;

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
export function boxRectFor(lasso: Rect): Rect {
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
 * Draws a ☐ next to the lassoed handwriting. Returns the box, or null if it
 * couldn't be drawn — the todo is still worth keeping then, so this never
 * throws.
 */
export async function insertCheckbox(
  notePath: string,
  page: number,
  lasso: Rect,
): Promise<NoteBox | null> {
  const rect = boxRectFor(lasso);
  const tag = createTag();
  try {
    await insertTexts(notePath, page, [
      {content: GLYPH_OPEN, rect, fontSize: BOX_FONT_SIZE, tag},
    ]);
    // Its level is unknown: a lasso capture lands in the Inbox.
    return {notePath, page, tag, rect, level: null};
  } catch {
    return null;
  }
}

// Where a typed todo goes: the box, the text to its right, and how far down
// the page the two reach.
export type TodoLineLayout = {box: Rect; text: Rect; bottom: number};

/**
 * Lays out a typed todo with its box's top-left at `left`/`top`. The text runs
 * to the page's right margin; its height is a guess at how many lines it wraps
 * to, from an average character width, since the font's real widths aren't
 * known. Every value is a whole number: the API rejects a rect with decimals.
 */
export function todoLineLayout(
  text: string,
  left: number,
  top: number,
  pageWidth: number,
): TodoLineLayout {
  left = Math.round(left);
  top = Math.round(top);
  const box = {left, top, right: left + BOX_SIZE, bottom: top + BOX_SIZE};
  const textLeft = box.right + TEXT_GAP;
  const right = Math.round(pageWidth - LINE_MARGIN);
  const charsPerLine = Math.max(
    1,
    Math.floor((right - textLeft) / (TEXT_FONT_SIZE * CHAR_WIDTH_RATIO)),
  );
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  const textTop = top + TEXT_NUDGE_DOWN;
  const textRect = {
    left: textLeft,
    top: textTop,
    right,
    bottom: textTop + lines * TEXT_LINE_HEIGHT,
  };
  return {box, text: textRect, bottom: Math.max(box.bottom, textRect.bottom)};
}

export type TodoLine = {text: string; layout: TodoLineLayout};

/**
 * Writes todos as typed text, each with a ☐ in front, in one write. Two
 * elements per todo, because one text element has one font size and the box
 * must match the lasso boxes. Like a handwritten todo, they're moved together
 * with the lasso. `level` is the list the page is for (null: the todos' own).
 * Returns the boxes in the same order as `lines`. Throws with the reason if
 * nothing could be written.
 */
export async function insertTodoLines(
  notePath: string,
  page: number,
  lines: TodoLine[],
  level: Horizon | null,
): Promise<NoteBox[]> {
  const tags = lines.map(() => createTag());
  await insertTexts(
    notePath,
    page,
    lines.flatMap((line, i) => [
      {
        content: GLYPH_OPEN,
        rect: line.layout.box,
        fontSize: BOX_FONT_SIZE,
        tag: tags[i],
      },
      // No tag: it's just the words; the plugin never needs to find it again.
      {
        content: line.text,
        rect: line.layout.text,
        fontSize: TEXT_FONT_SIZE,
        tag: null,
      },
    ]),
  );
  return lines.map((line, i) => ({
    notePath,
    page,
    tag: tags[i],
    rect: line.layout.box,
    level,
  }));
}

type TextSpec = {
  content: string;
  rect: Rect;
  fontSize: number;
  // `userData`, so the element can be found again; null for none.
  tag: string | null;
};

// Inserts text elements onto a page in one write. Throws with the reason
// (the API's own message where there is one) if it fails.
async function insertTexts(
  notePath: string,
  page: number,
  texts: TextSpec[],
): Promise<void> {
  const elements: Record<string, unknown>[] = [];
  try {
    if (!(await ensureNotePermissions())) {
      throw new Error('no permission to read and write notes');
    }

    // Flush the open note to disk BEFORE writing by path, never after: a save
    // afterwards writes the note's older in-memory copy back over our insert.
    await PluginNoteAPI.saveCurrentNote();

    for (const text of texts) {
      const created = (await PluginCommAPI.createElement(
        Element.TYPE_TEXT,
      )) as ApiResponse<Record<string, unknown>>;
      if (!created?.success || !created.result) {
        throw new Error(
          `createElement failed: ${created?.error?.message ?? 'no answer'}`,
        );
      }
      const element = created.result;
      elements.push(element);
      if (text.tag !== null) {
        element.userData = text.tag;
      }
      element.pageNum = page;
      // Every style field set, so the text doesn't inherit the user's last text style.
      element.textBox = {
        fontSize: text.fontSize,
        textContentFull: text.content,
        textRect: text.rect,
        textAlign: 0,
        textBold: 0,
        textItalics: 0,
        textFrameWidthType: 0,
        textFrameStyle: 0,
        textEditable: 0,
      };
    }

    const inserted = (await PluginFileAPI.insertElements(
      notePath,
      page,
      elements,
    )) as ApiResponse<boolean>;
    if (!inserted?.success) {
      throw new Error(
        `insertElements failed: ${inserted?.error?.message ?? 'no answer'}`,
      );
    }

    await redrawPage();
  } finally {
    // createElement's objects live in a native cache; release them either way.
    for (const element of elements) {
      PluginCommAPI.recycleElement(String(element.uuid));
    }
  }
}

/** Sets the box to ☑ (done) or ☐. See setBoxGlyph. */
export function setCheckbox(
  notePath: string,
  page: number,
  tag: string,
  done: boolean,
): Promise<boolean> {
  return setBoxGlyph(notePath, page, tag, done ? GLYPH_DONE : GLYPH_OPEN);
}

/**
 * Changes what the box shows (☐, ☑ or >). Works whether or not its note is
 * open. Returns false if the box couldn't be found or changed — e.g. the user
 * erased it — which is harmless: the todo list is the source of truth.
 */
export async function setBoxGlyph(
  notePath: string,
  page: number,
  tag: string,
  glyph: string,
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
      (box.textBox as {textContentFull: string}).textContentFull = glyph;
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

/**
 * Deletes the pen stroke that ticked a box, so only the ☑ is left. Works on the
 * open note, not by path: the next `saveCurrentNote` (in `setCheckbox`) writes
 * it out, which keeps the "save before writing by path" rule. The caller must
 * have checked this index really is that stroke: a wrong one would delete the
 * user's handwriting.
 */
export async function deleteTickStroke(stroke: Element): Promise<boolean> {
  try {
    const res = (await PluginCommAPI.deletePageElements(
      [stroke.numInPage],
      stroke.pageNum,
      stroke.layerNum,
    )) as ApiResponse<boolean>;
    return res?.success === true;
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
