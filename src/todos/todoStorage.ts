import AsyncStorage from '@react-native-async-storage/async-storage';
import type {TodoItem} from '../types';

// AsyncStorage isn't sandboxed to this plugin the way `getPluginDirPath()` is —
// it writes into the Supernote host app's own storage, shared with any other
// plugin using it. So every key we own is namespaced. See docs/api-notes.md.
const STORAGE_KEY = 'overblick:todos';

// Bump this when the shape of a stored TodoItem changes, and add a migration in
// `migrate` below. Reading data written before a field existed is the normal
// case here — this list is meant to outlive several rounds of feature work
// (planned dates, importance, done state), so the version marker has to be in
// the very first thing we ever write.
//
// 1 -> 2 (2026-09-01): added `done` for the milestone step 4 checkbox.
// 2 -> 3 (2026-10-01): added `checkboxTag`, the ☐ drawn in the note.
const SCHEMA_VERSION = 3;

type StoredDocument = {
  schemaVersion: number;
  todos: TodoItem[];
};

/**
 * Reads the saved todo list. Returns an empty list when nothing has been saved
 * yet; throws when something *was* saved but can't be understood, so the caller
 * can refuse to overwrite it rather than silently starting from scratch.
 */
export async function loadTodos(): Promise<TodoItem[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    return [];
  }
  return parseDocument(raw);
}

export async function saveTodos(todos: TodoItem[]): Promise<void> {
  const document: StoredDocument = {schemaVersion: SCHEMA_VERSION, todos};
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(document));
}

function parseDocument(raw: string): TodoItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('The saved todo list is damaged and could not be read.');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('The saved todo list is damaged and could not be read.');
  }

  const document = parsed as Partial<StoredDocument>;
  if (!Array.isArray(document.todos)) {
    throw new Error('The saved todo list is damaged and could not be read.');
  }

  const version = document.schemaVersion;

  // A version NEWER than ours means data written by a later build of the
  // plugin. Refusing to read it is deliberate: the alternative is dropping
  // fields we don't understand and writing the result back, which loses them.
  if (typeof version !== 'number' || version > SCHEMA_VERSION) {
    throw new Error(
      `The saved todo list uses an unknown format (version ${String(version)}).`,
    );
  }

  // Older data, though, is the normal case and must be upgraded rather than
  // rejected — the first version of this function rejected it too, which would
  // have locked the user out of their own list the moment a field was added.
  return migrate(document.todos, version);
}

/**
 * Brings todos written by an older build up to the current shape. Runs on read
 * only; the upgraded list is written back by the normal save path, so a
 * migration that turns out to be wrong can be corrected before it's persisted.
 */
function migrate(todos: TodoItem[], from: number): TodoItem[] {
  if (from >= SCHEMA_VERSION) {
    return todos;
  }

  return todos.map(todo => ({
    ...todo,
    // Version 1 had no `done` field. Everything saved before the checkbox
    // existed was, by definition, not yet ticked off. This has to come *after*
    // the spread, or a stored `done: undefined` would win over the default.
    done: todo.done ?? false,
    // Before version 3 nothing was drawn in the note, so there's no box to find.
    checkboxTag: todo.checkboxTag ?? null,
  }));
}
