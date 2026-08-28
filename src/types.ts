// PluginCommAPI's .d.ts under-types its calls as Promise<Object | null | undefined>;
// at runtime they resolve to this shape (confirmed in docs + sn-plugin-lib's APIResponse.d.ts).
export type ApiResponse<T> = {
  success: boolean;
  result: T | null;
  error: {code: number; message: string} | null;
};

export type TodoItem = {
  id: string;
  text: string;
};
