import type {Rect} from 'sn-plugin-lib';

// PluginCommAPI's .d.ts under-types its calls as Promise<Object | null | undefined>;
// at runtime they resolve to this shape (confirmed in docs + sn-plugin-lib's APIResponse.d.ts).
export type ApiResponse<T> = {
  success: boolean;
  result: T | null;
  error: {code: number; message: string} | null;
};

// One ☐ in a note that belongs to a todo (src/note/checkbox.ts). A todo can
// have several, one per page it's written on; they're ticked together.
export type NoteBox = {
  notePath: string;
  page: number;
  // The box's `userData` tag: how it's found again in the note.
  tag: string;
  // Where the box was drawn, in screen px. The pen check uses it without
  // reading the note; a box moved by hand won't be where this says.
  rect: Rect;
  // The list the box was written for. null = not known (a lasso capture):
  // it counts as the todo's current horizon (`boxLevel` in horizon.ts).
  level: Horizon | null;
};

// What one lasso capture produces: the OCR'd text, a path to a saved .sticker
// file holding the original ink (Supernote's own ink format, not a raster
// image), and where it came from — all best-effort, null if unavailable.
export type Capture = {
  text: string;
  stickerPath: string | null;
  notePath: string | null;
  page: number | null;
  rect: Rect | null;
  // The ☐ drawn next to the handwriting: one, or none if it couldn't be drawn.
  boxes: NoteBox[];
};

// How far ahead a todo is planned. 'future' is the bullet-journal future log.
export type Horizon = 'day' | 'week' | 'month' | 'future';

export type TodoItem = {
  id: string;
  text: string;
  // The plugin's half of the checked state; the note's half is the checkbox.
  done: boolean;
  // The day it was ticked, local 'YYYY-MM-DD'. null when not done, or when
  // done before this was recorded.
  doneOn: string | null;
  // null = not sorted yet, i.e. the Inbox.
  horizon: Horizon | null;
  // The day the horizon was set, as local 'YYYY-MM-DD' (no timezone, so it
  // can't slip to yesterday). "Today" is worked out from this when shown.
  plannedOn: string | null;
  stickerPath: string | null;
  // Where the handwriting was captured. Boxes added later are in `boxes`.
  notePath: string | null;
  page: number | null;
  rect: Rect | null;
  // Every ☐ in a note for this todo. Empty for todos captured before boxes
  // existed, or when drawing one failed.
  boxes: NoteBox[];
};
