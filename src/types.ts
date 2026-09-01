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
// notePath/page/rect exist to support future work (persisting into the note,
// drawing a synced checkbox at the capture's location) — nothing reads them yet.
export type Capture = {
  text: string;
  stickerPath: string | null;
  notePath: string | null;
  page: number | null;
  rect: Rect | null;
};

export type TodoItem = {
  id: string;
  text: string;
  // Milestone step 4: the plugin's half of the checked state. The note's half
  // (a mark on the page) isn't built yet — see CLAUDE.md — so for now this is
  // the only place "done" is recorded.
  done: boolean;
  stickerPath: string | null;
  notePath: string | null;
  page: number | null;
  rect: Rect | null;
};
