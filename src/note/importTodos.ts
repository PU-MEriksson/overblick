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

type OpenPage = {
  notePath: string;
  page: number;
  pageSize: {width: number; height: number};
  // Everything on the page. The caller must recycle them.
  elements: Element[];
};

/**
 * Finds the page open in the note and reads what's on it. Throws with a
 * reason fit for the screen if any step fails.
 */
async function readOpenPage(): Promise<OpenPage> {
  if (!(await ensureNotePermissions())) {
    throw new Error('No permission to read and write notes.');
  }
  const pathRes =
    (await PluginCommAPI.getCurrentFilePath()) as ApiResponse<string>;
  const pageRes =
    (await PluginCommAPI.getCurrentPageNum()) as ApiResponse<number>;
  const notePath = pathRes?.success ? pathRes.result : null;
  const page = pageRes?.success ? pageRes.result : null;
  if (notePath === null || page === null) {
    throw new Error('Could not find the open note and page.');
  }

  const sizeRes = (await PluginFileAPI.getPageSize(
    notePath,
    page,
  )) as ApiResponse<{width: number; height: number}>;
  if (!sizeRes?.success || !sizeRes.result) {
    throw new Error('Could not read the page size.');
  }

  // What was just written (the heading) is only in the file once saved.
  await PluginNoteAPI.saveCurrentNote();
  const res = (await PluginFileAPI.getElements(page, notePath)) as ApiResponse<
    Element[]
  >;
  if (!res?.success || !res.result) {
    throw new Error('Could not read what is on the page.');
  }
  return {notePath, page, pageSize: sizeRes.result, elements: res.result};
}

/**
 * Whether a todo's box is really on this page, not just remembered as being
 * there: an erased box doesn't count.
 */
function isOnPage(todo: TodoItem, page: OpenPage, tags: Set<string>): boolean {
  return todo.boxes.some(
    box =>
      box.notePath === page.notePath &&
      box.page === page.page &&
      tags.has(box.tag),
  );
}

function tagsOn(page: OpenPage): Set<string> {
  return new Set(page.elements.map(el => el.userData));
}

// Every element getElements returned lives in the native cache.
function recycle(page: OpenPage | null) {
  for (const el of page?.elements ?? []) {
    PluginCommAPI.recycleElement(String(el.uuid));
  }
}

export type OnPageResult =
  | {ok: true; ids: string[]}
  | {ok: false; reason: string};

/** Which of these todos already have a box on the open page. */
export async function todosOnOpenPage(
  todos: TodoItem[],
): Promise<OnPageResult> {
  let page: OpenPage | null = null;
  try {
    // A const, so the filter below knows it's set; `page` is for `finally`.
    const here = await readOpenPage();
    page = here;
    const tags = tagsOn(here);
    return {
      ok: true,
      ids: todos.filter(todo => isOnPage(todo, here, tags)).map(t => t.id),
    };
  } catch (error) {
    return {ok: false, reason: messageOf(error)};
  } finally {
    recycle(page);
  }
}

// Todo ids, sorted by what happened to them. `ok: false` means nothing was
// written; `reason` says which step failed, for showing on screen.
export type ImportResult =
  | {ok: true; added: string[]; alreadyHere: string[]; didntFit: string[]}
  | {ok: false; reason: string};

/**
 * Writes todos onto the open page, in the order given, and links their boxes.
 * `onStep` hears what's happening, for showing while it works.
 */
export async function importTodos(
  todos: TodoItem[],
  onStep: (text: string) => void = () => {},
): Promise<ImportResult> {
  let page: OpenPage | null = null;
  // What's being done right now, so an unexpected error can say where.
  let step = 'reading the page';
  try {
    onStep('Reading the page…');
    // A const, so `isHere` below knows it's set; `page` is for `finally`.
    const here = await readOpenPage();
    page = here;
    const {pageSize} = here;
    const tags = tagsOn(here);
    const isHere = (todo: TodoItem) => isOnPage(todo, here, tags);
    const alreadyHere = todos.filter(isHere).map(todo => todo.id);

    step = `finding the handwriting (page ${pageSize.width} × ${pageSize.height})`;
    onStep('Finding space below what’s written…');
    const lowest = await lowestContent(here.elements, pageSize);
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
      onStep(
        lines.length === 1
          ? 'Writing 1 todo…'
          : `Writing ${lines.length} todos…`,
      );
      const boxes = await insertTodoLines(here.notePath, here.page, lines);
      await addBoxes(placed.map((todo, i) => ({id: todo.id, box: boxes[i]})));
    }
    return {
      ok: true,
      added: placed.map(todo => todo.id),
      alreadyHere,
      didntFit,
    };
  } catch (error) {
    return {ok: false, reason: `Failed while ${step}: ${messageOf(error)}`};
  } finally {
    recycle(page);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
