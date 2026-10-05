import {PluginCommAPI, PluginFileAPI, PluginNoteAPI} from 'sn-plugin-lib';
import type {Element} from 'sn-plugin-lib';
import type {ApiResponse, TodoItem} from '../types';
import {addBoxes} from '../todos/todoStore';
import {
  ensureNotePermissions,
  insertTodoLines,
  todoLineLayout,
} from './checkbox';
import type {TodoLine} from './checkbox';
import {lowestContent} from './pageContent';

// Putting todos from the plugin onto the page that's open in the note, as
// typed text with a ☐ in front, each box linked to its todo. They go below
// whatever is written there, one under the other.

// Where each box's rect starts. 50 puts the ☐ where a lasso box sits next to
// handwriting written at the page's usual left edge (measured on-device).
const LINE_LEFT = 50;
// Where the first todo goes on an empty page.
const EMPTY_PAGE_TOP = 150;
// Space between what's written and the first todo.
const GAP_BELOW_CONTENT = 40;
// Space between one todo and the next.
const GAP_BETWEEN = 16;
// No todo is placed closer than this to the page's bottom edge.
const BOTTOM_MARGIN = 60;

// Todo ids, sorted by what happened to them. `ok: false` means nothing was
// written; `reason` says which step failed, for showing on screen.
export type ImportResult =
  | {ok: true; added: string[]; alreadyHere: string[]; didntFit: string[]}
  | {ok: false; reason: string};

/** Writes todos onto the open page, in the order given, and links their boxes. */
export async function importTodos(todos: TodoItem[]): Promise<ImportResult> {
  let elements: Element[] = [];
  // What's being done right now, so an unexpected error can say where.
  let step = 'asking for permission';
  try {
    if (!(await ensureNotePermissions())) {
      return {ok: false, reason: 'No permission to read and write notes.'};
    }
    step = 'finding the open page';
    const pathRes =
      (await PluginCommAPI.getCurrentFilePath()) as ApiResponse<string>;
    const pageRes =
      (await PluginCommAPI.getCurrentPageNum()) as ApiResponse<number>;
    const notePath = pathRes?.success ? pathRes.result : null;
    const page = pageRes?.success ? pageRes.result : null;
    if (notePath === null || page === null) {
      return {ok: false, reason: 'Could not find the open note and page.'};
    }

    step = 'reading the page size';
    const sizeRes = (await PluginFileAPI.getPageSize(
      notePath,
      page,
    )) as ApiResponse<{width: number; height: number}>;
    if (!sizeRes?.success || !sizeRes.result) {
      return {ok: false, reason: 'Could not read the page size.'};
    }
    const pageSize = sizeRes.result;

    step = 'reading the page';
    // What was just written (the heading) is only in the file once saved.
    await PluginNoteAPI.saveCurrentNote();
    const res = (await PluginFileAPI.getElements(
      page,
      notePath,
    )) as ApiResponse<Element[]>;
    if (!res?.success || !res.result) {
      return {ok: false, reason: 'Could not read what is on the page.'};
    }
    elements = res.result;

    // Already here = its box is really on this page, not just remembered as
    // being there: an erased box doesn't count.
    const tagsHere = new Set(elements.map(el => el.userData));
    const isHere = (todo: TodoItem) =>
      todo.boxes.some(
        box =>
          box.notePath === notePath &&
          box.page === page &&
          tagsHere.has(box.tag),
      );
    const alreadyHere = todos.filter(isHere).map(todo => todo.id);

    step = `finding the handwriting (page ${pageSize.width} × ${pageSize.height})`;
    const lowest = await lowestContent(elements, pageSize);
    let top = lowest === null ? EMPTY_PAGE_TOP : lowest + GAP_BELOW_CONTENT;

    const lines: TodoLine[] = [];
    const placed: TodoItem[] = [];
    const didntFit: string[] = [];
    for (const todo of todos) {
      if (isHere(todo)) {
        continue;
      }
      const layout = todoLineLayout(todo.text, LINE_LEFT, top, pageSize.width);
      // Once one doesn't fit, none after it is placed either, so the page
      // keeps the order they were picked in.
      if (
        didntFit.length > 0 ||
        layout.bottom > pageSize.height - BOTTOM_MARGIN
      ) {
        didntFit.push(todo.id);
        continue;
      }
      lines.push({text: todo.text, layout});
      placed.push(todo);
      top = layout.bottom + GAP_BETWEEN;
    }

    if (lines.length > 0) {
      step = `writing onto the page (first todo at y ${lines[0].layout.box.top})`;
      const boxes = await insertTodoLines(notePath, page, lines);
      await addBoxes(placed.map((todo, i) => ({id: todo.id, box: boxes[i]})));
    }
    return {
      ok: true,
      added: placed.map(todo => todo.id),
      alreadyHere,
      didntFit,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {ok: false, reason: `Failed while ${step}: ${message}`};
  } finally {
    // Every element getElements returned lives in the native cache.
    for (const el of elements) {
      PluginCommAPI.recycleElement(String(el.uuid));
    }
  }
}
