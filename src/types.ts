// PluginCommAPI's .d.ts under-types its calls as Promise<Object | null | undefined>;
// at runtime they resolve to this shape (confirmed in docs + sn-plugin-lib's APIResponse.d.ts).
export type ApiResponse<T> = {
  success: boolean;
  result: T | null;
  error: {code: number; message: string} | null;
};

// What one lasso capture produces: the OCR'd text plus a path to a saved
// .sticker file holding the original ink (Supernote's own ink format, not a
// raster image — null if the save couldn't be saved).
export type Capture = {
  text: string;
  stickerPath: string | null;
};

export type TodoItem = {
  id: string;
  text: string;
  stickerPath: string | null;
};
