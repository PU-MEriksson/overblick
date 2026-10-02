import {
  PluginCommAPI,
  PluginFileAPI,
  PluginManager,
  PluginNoteAPI,
} from 'sn-plugin-lib';
import type {Element, MotionEvent, Rect} from 'sn-plugin-lib';
import type {ApiResponse} from '../types';
import {ensureLoaded, getState, toggleTodo} from '../todos/todoStore';
import {boxRectFor, deleteTickStroke} from './checkbox';

// Ticking a ☐ in the note. Registered from index.js so it works while the
// plugin view is closed. Touch x/y are the same screen px as the boxes'
// textRect (see docs/api-notes.md).
// - A finger tap on a box toggles its todo.
// - A pen tap or small pen tick on a box only ticks: a stray stroke on a ☑
//   never un-does a task. The tick's stroke is then deleted, so only the ☑
//   shows, but only after checking it's that exact stroke.

// Moved further than this between down and up = a drag, not a tap.
const TAP_MAX_PX = 16;
// A pen stroke wider or taller than this is writing, not a tick. A tick
// measured about 45 x 20 px; the box is 80.
const TICK_MAX_PX = 120;
// Slack around the box, so a tap just off its edge still counts.
const HIT_PAD_PX = 10;
// A firmware call that never answers would otherwise keep `busy` set and
// silently swallow every later tap.
const STEP_TIMEOUT_MS = 8000;

const FINGER = 1;
const PEN = 2;
const ACTION_DOWN = 0;
const ACTION_UP = 1;
const ACTION_MOVE = 2;
// The lasso also reports a pen stroke, with this pen type (see api-notes).
const LASSO_PEN_TYPE = 4;

let down: {x: number; y: number} | null = null;
// The area the current pen stroke covers, grown on every move.
let penStroke: Rect | null = null;
// The last finished pen stroke, waiting for event_pen_up to say if it was ink.
let finishedPenStroke: Rect | null = null;
// One tap at a time: a second tap while the first is still writing the note
// would read the box before the first flip landed.
let busy = false;

// Keep these the plugin's ONLY motion and pen-up listeners. sn-plugin-lib ids
// listeners by Date.now(), so two of the same kind registered in the same
// millisecond share an id and the second silently replaces the first.
export function startBoxTaps(): void {
  // Load the list now: the pen check below reads it from memory, and the
  // plugin view may not have been opened since the device started.
  ensureLoaded();

  PluginManager.registerMotionListener(1, {
    onMsg: (event: MotionEvent) => {
      if (event.toolType === PEN) {
        trackPenStroke(event);
        return;
      }
      const isFinger = event.toolType === FINGER && event.pointerCount === 1;
      if (event.action === ACTION_DOWN) {
        down = isFinger ? {x: event.x, y: event.y} : null;
        return;
      }
      if (event.action !== ACTION_UP || !isFinger || down === null) {
        return;
      }
      const moved = Math.max(
        Math.abs(event.x - down.x),
        Math.abs(event.y - down.y),
      );
      down = null;
      if (moved < TAP_MAX_PX && !busy) {
        busy = true;
        handleTap(event.x, event.y, {kind: 'finger'}).finally(() => {
          busy = false;
        });
      }
    },
  });

  // Fires after the motion listener's pen UP. Its elements tell real ink
  // apart from the lasso (penType 4) and the eraser (no elements).
  PluginManager.registerEventListener('event_pen_up', 1, {
    onMsg: (msg: unknown) => {
      const area = finishedPenStroke;
      finishedPenStroke = null;
      const elements = Array.isArray(msg) ? (msg as Element[]) : [];
      const ink = elements.find(
        el => el?.type === 0 && el.stroke && el.stroke.penType !== LASSO_PEN_TYPE,
      );
      const x = area ? (area.left + area.right) / 2 : 0;
      const y = area ? (area.top + area.bottom) / 2 : 0;
      const isTick =
        area !== null &&
        ink !== undefined &&
        !busy &&
        area.right - area.left <= TICK_MAX_PX &&
        area.bottom - area.top <= TICK_MAX_PX &&
        nearAnyBox(x, y);
      if (!isTick) {
        recycle(elements);
        return;
      }
      busy = true;
      handleTap(x, y, {kind: 'pen', stroke: ink}).finally(() => {
        recycle(elements);
        busy = false;
      });
    },
  });
}

// Pen MOVE events come many per second while writing, so this only does
// arithmetic. No calls to the device here.
function trackPenStroke(event: MotionEvent) {
  const {x, y} = event;
  if (event.action === ACTION_DOWN) {
    penStroke = {left: x, top: y, right: x, bottom: y};
  } else if (penStroke !== null && event.action === ACTION_MOVE) {
    penStroke = {
      left: Math.min(penStroke.left, x),
      top: Math.min(penStroke.top, y),
      right: Math.max(penStroke.right, x),
      bottom: Math.max(penStroke.bottom, y),
    };
  } else if (event.action === ACTION_UP) {
    finishedPenStroke = penStroke;
    penStroke = null;
  }
}

// Elements handed to us live in the native cache until released.
function recycle(elements: Element[]) {
  for (const el of elements) {
    PluginCommAPI.recycleElement(String(el.uuid));
  }
}

// A quick check from memory, using where each box was drawn, so ordinary
// writing doesn't cost a read of the note for every letter. A box the user
// has moved by hand won't pass; a finger tap still works on it.
function nearAnyBox(x: number, y: number): boolean {
  return getState().todos.some(todo => {
    if (todo.done || todo.checkboxTag === null || todo.rect === null) {
      return false;
    }
    const box = boxRectFor(todo.rect);
    return (
      x >= box.left - HIT_PAD_PX &&
      x <= box.right + HIT_PAD_PX &&
      y >= box.top - HIT_PAD_PX &&
      y <= box.bottom + HIT_PAD_PX
    );
  });
}

/** Rejects instead of waiting forever on a call that never answers. */
function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timed out')), STEP_TIMEOUT_MS),
    ),
  ]);
}

// A finger tap toggles the todo either way. A pen tick only marks an open
// todo done, and its stroke is deleted so only the ☑ is left.
type Tap = {kind: 'finger'} | {kind: 'pen'; stroke: Element};

async function handleTap(x: number, y: number, tap: Tap): Promise<void> {
  let elements: Element[] = [];
  try {
    if (!(await withTimeout(ensureLoaded()))) {
      return;
    }
    // One at a time, NOT Promise.all: asked together from this listener, the
    // two calls never answered on-device (see docs/api-notes.md).
    const pathRes = (await withTimeout(
      PluginCommAPI.getCurrentFilePath(),
    )) as ApiResponse<string>;
    const pageRes = (await withTimeout(
      PluginCommAPI.getCurrentPageNum(),
    )) as ApiResponse<number>;
    const notePath = pathRes?.success ? pathRes.result : null;
    const page = pageRes?.success ? pageRes.result : null;
    if (notePath === null || page === null) {
      return;
    }

    // From memory: most taps are on pages with no boxes and stop here,
    // without reading the note.
    const todosHere = getState().todos.filter(
      todo =>
        todo.notePath === notePath &&
        todo.page === page &&
        todo.checkboxTag !== null,
    );
    if (todosHere.length === 0) {
      return;
    }

    // A pen stroke only reaches the file when the note is saved, and we need
    // it there to check it before deleting it.
    if (tap.kind === 'pen') {
      await withTimeout(PluginNoteAPI.saveCurrentNote());
    }

    // No permission pre-check: without FILE:READ this read fails (1503)
    // without a dialog, which is what a stray tap should do anyway.
    // Read the boxes' current rects rather than storing them: the user can
    // move a box, and the page is the truth about where it is now.
    const res = (await withTimeout(
      PluginFileAPI.getElements(page, notePath),
    )) as ApiResponse<Element[]>;
    if (!res?.success || !res.result) {
      return;
    }
    elements = res.result;
    const rects = new Map<string, Rect>();
    for (const el of elements) {
      if (typeof el.userData === 'string' && el.textBox?.textRect) {
        rects.set(el.userData, el.textBox.textRect);
      }
    }

    const hit = todosHere.find(todo => {
      const rect = rects.get(todo.checkboxTag as string);
      return (
        rect !== undefined &&
        x >= rect.left - HIT_PAD_PX &&
        x <= rect.right + HIT_PAD_PX &&
        y >= rect.top - HIT_PAD_PX &&
        y <= rect.bottom + HIT_PAD_PX
      );
    });
    if (!hit || (tap.kind === 'pen' && hit.done)) {
      return;
    }
    if (tap.kind === 'pen') {
      // Only delete what is provably the tick. If the check fails the todo is
      // still ticked; the ink just stays.
      const inFile = elements.find(el => el.numInPage === tap.stroke.numInPage);
      if (inFile && (await sameStroke(tap.stroke, inFile))) {
        await withTimeout(deleteTickStroke(tap.stroke));
      }
    }
    // Same path as ticking in the list: updates the list, then the box.
    await withTimeout(toggleTodo(hit.id));
  } catch {
    // A tap that fails or times out just does nothing; the next one tries again.
  } finally {
    recycle(elements);
  }
}

/**
 * Whether the element read from the file is the stroke the pen just drew:
 * same kind, same number of points, same points. Points are EMR integers
 * straight from the pen, so they should match exactly; 1 unit of slack anyway.
 */
async function sameStroke(drawn: Element, inFile: Element): Promise<boolean> {
  if (inFile.type !== 0 || !inFile.stroke || !drawn.stroke) {
    return false;
  }
  // One call at a time: from a listener, parallel calls never answered.
  const count = await withTimeout(drawn.stroke.points.size());
  const countInFile = await withTimeout(inFile.stroke.points.size());
  if (count === 0 || count !== countInFile) {
    return false;
  }
  const points = await withTimeout(drawn.stroke.points.getRange(0, count));
  const pointsInFile = await withTimeout(
    inFile.stroke.points.getRange(0, count),
  );
  return (
    points.length === count &&
    pointsInFile.length === count &&
    points.every(
      (p, i) =>
        Math.abs(p.x - pointsInFile[i].x) <= 1 &&
        Math.abs(p.y - pointsInFile[i].y) <= 1,
    )
  );
}
