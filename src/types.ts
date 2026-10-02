import type {Rect} from 'sn-plugin-lib';

// PluginCommAPI's .d.ts under-types its calls as Promise<Object | null | undefined>;
// at runtime they resolve to this shape (confirmed in docs + sn-plugin-lib's APIResponse.d.ts).
export type ApiResponse<T> = {
  success: boolean;
  result: T | null;
  error: {code: number; message: string} | null;
};

// What one lasso capture produces: the OCR'd text, a path to a saved .sticker
// file holding the original ink (Supernote's own ink format, not a raster
// image), and where it came from — all best-effort, null if unavailable.
// notePath/page/rect also locate the checkbox drawn next to the handwriting.
export type Capture = {
  text: string;
  stickerPath: string | null;
  notePath: string | null;
  page: number | null;
  rect: Rect | null;
  // `userData` tag of the ☐ drawn in the note (src/note/checkbox.ts); null
  // when none could be drawn.
  checkboxTag: string | null;
};

// How far ahead a todo is planned. 'future' is the bullet-journal future log.
export type Horizon = 'day' | 'week' | 'month' | 'future';

export type TodoItem = {
  id: string;
  text: string;
  // The plugin's half of the checked state; the note's half is the checkbox.
  done: boolean;
  // null = not sorted yet, i.e. the Inbox.
  horizon: Horizon | null;
  // The day the horizon was set, as local 'YYYY-MM-DD' (no timezone, so it
  // can't slip to yesterday). "Today" is worked out from this when shown.
  plannedOn: string | null;
  stickerPath: string | null;
  notePath: string | null;
  page: number | null;
  rect: Rect | null;
  checkboxTag: string | null;
};
