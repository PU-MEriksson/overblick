import AsyncStorage from '@react-native-async-storage/async-storage';
import type {TodoItem} from '../types';

// AsyncStorage isn't sandboxed to this plugin the way `getPluginDirPath()` is —
// it writes into the Supernote host app's own storage, shared with any other
// plugin using it. So every key we own is namespaced. See docs/api-notes.md.
const STORAGE_KEY = 'overblick:todos';

// Bump this when the shape of a stored TodoItem changes, and handle the old
// shape in `parseDocument`. Reading data written before a field existed is the
// normal case here — this list is meant to outlive several rounds of feature
// work (planned dates, importance, done state), so the version marker has to be
// in the very first thing we ever write.
const SCHEMA_VERSION = 1;

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

  // A version we don't recognise means data written by a newer build of the
  // plugin. Refusing to read it is deliberate: the alternative is dropping
  // fields we don't understand and writing the result back, which loses them.
  if (document.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `The saved todo list uses an unknown format (version ${String(
        document.schemaVersion,
      )}).`,
    );
  }

  return document.todos;
}
