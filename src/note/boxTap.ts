import {PluginCommAPI, PluginFileAPI, PluginManager} from 'sn-plugin-lib';
import type {MotionEvent, Rect} from 'sn-plugin-lib';
import type {ApiResponse} from '../types';
import {ensureLoaded, getState, toggleTodo} from '../todos/todoStore';

// A finger tap on a ☐/☑ in the note ticks its todo. Registered from index.js
// so it hears taps while the plugin view is closed. Touch x/y are the same
// screen px as the boxes' textRect (see docs/api-notes.md).

// Moved further than this between down and up = a drag, not a tap.
const TAP_MAX_PX = 16;
// Slack around the box, so a tap just off its edge still counts.
const HIT_PAD_PX = 10;
// A firmware call that never answers would otherwise keep `busy` set and
// silently swallow every later tap.
const STEP_TIMEOUT_MS = 8000;

const FINGER = 1;
const ACTION_DOWN = 0;
const ACTION_UP = 1;

let down: {x: number; y: number} | null = null;
// One tap at a time: a second tap while the first is still writing the note
// would read the box before the first flip landed.
let busy = false;

// Keep this the plugin's ONLY motion listener. sn-plugin-lib ids listeners by
// Date.now(), so two registered in the same millisecond share an id and the
// second silently replaces the first. Need another? Dispatch from here.
export function startBoxTaps(): void {
  PluginManager.registerMotionListener(1, {
    onMsg: (event: MotionEvent) => {
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
        handleTap(event.x, event.y).finally(() => {
          busy = false;
        });
      }
    },
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

async function handleTap(x: number, y: number): Promise<void> {
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

    // No permission pre-check: without FILE:READ this read fails (1503)
    // without a dialog, which is what a stray tap should do anyway.
    // Read the boxes' current rects rather than storing them: the user can
    // move a box, and the page is the truth about where it is now.
    const res = (await withTimeout(
      PluginFileAPI.getElements(page, notePath),
    )) as ApiResponse<Record<string, unknown>[]>;
    if (!res?.success || !res.result) {
      return;
    }
    const rects = new Map<string, Rect>();
    for (const el of res.result) {
      const textBox = el.textBox as {textRect?: Rect} | null;
      if (typeof el.userData === 'string' && textBox?.textRect) {
        rects.set(el.userData, textBox.textRect);
      }
      PluginCommAPI.recycleElement(String(el.uuid));
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
    if (hit) {
      // Same path as ticking in the list: updates the list, then the box.
      await withTimeout(toggleTodo(hit.id));
    }
  } catch {
    // A tap that fails or times out just does nothing; the next one tries again.
  }
}
