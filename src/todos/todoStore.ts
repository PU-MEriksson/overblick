import {FileUtils} from 'sn-plugin-lib';
import type {Capture, TodoItem} from '../types';
import {loadTodos, saveTodos} from './todoStorage';
import {MOCK_TODOS} from './mockTodos';
import {setCheckbox} from '../note/checkbox';

// The one copy of the todo list. Lives outside React so code with no component
// (the tap listener in index.js) changes the same list the screen shows.
// Components read it through useTodos; nothing else keeps its own copy.

// TEMPORARY — see mockTodos.ts. Flip to false to get the empty list back.
// The `__DEV__` guard below means this can never reach a plugin package:
// buildPlugin.sh bundles with `--dev false`, which makes `__DEV__` false, so
// the seeding is dead code there whatever this says.
const USE_MOCK_TODOS = true;

type Status = 'loading' | 'ready' | 'error';

export type TodoState = {
  todos: TodoItem[];
  status: Status;
  errorMessage: string;
};

// Replaced, never mutated: React compares snapshots by reference to decide
// whether to re-render.
let state: TodoState = {todos: [], status: 'loading', errorMessage: ''};
const listeners = new Set<() => void>();

function setState(next: Partial<TodoState>) {
  state = {...state, ...next};
  listeners.forEach(listener => listener());
}

export function getState(): TodoState {
  return state;
}

/** Called by React with a function to run on every change; returns the undo. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Ids have to stay unique across sessions now that the list is persisted. The
// counter only breaks ties between two captures made within the same millisecond.
let counter = 0;

function createId(): string {
  counter += 1;
  return `${Date.now()}-${counter}`;
}

let loading: Promise<boolean> | null = null;

/**
 * Reads the saved list the first time it's asked for; later calls get the same
 * answer. Resolves to whether the list is safe to change: after a failed read
 * we must not save, or we'd overwrite the data we couldn't read.
 */
export function ensureLoaded(): Promise<boolean> {
  if (loading === null) {
    loading = loadTodos()
      .then(loaded => {
        // Seed the mock todos only when there's nothing stored, so a dev-loop
        // list you've already edited isn't clobbered on every reload.
        const seed = __DEV__ && USE_MOCK_TODOS && loaded.length === 0;
        setState({todos: seed ? MOCK_TODOS : loaded, status: 'ready'});
        return true;
      })
      .catch((error: Error) => {
        setState({
          status: 'error',
          errorMessage: error.message || 'Could not read the saved todo list.',
        });
        return false;
      });
  }
  return loading;
}

// Every change goes through here: show the new list, then save it. The list
// is small, so we rewrite all of it rather than track which item changed.
function commit(next: TodoItem[]) {
  setState({todos: next});
  saveTodos(next).catch((error: Error) => {
    setState({
      status: 'error',
      errorMessage: error.message || 'Could not save the todo list.',
    });
  });
}

// Each change waits for the list to be loaded, so a capture that finishes
// before the read can't save a list missing everything already stored.

export async function addTodo(capture: Capture) {
  if (!(await ensureLoaded())) {
    return;
  }
  // A lasso capture is a quick add: it lands unsorted, in the Inbox.
  commit([
    ...state.todos,
    {id: createId(), done: false, horizon: null, plannedOn: null, ...capture},
  ]);
}

// Updates the list first, then mirrors it onto the box in the note. The note
// write isn't awaited: if the box is gone, the list is still right.
export async function toggleTodo(id: string) {
  if (!(await ensureLoaded())) {
    return;
  }
  const todo = state.todos.find(other => other.id === id);
  if (!todo) {
    return;
  }
  const done = !todo.done;
  commit(state.todos.map(other => (other.id === id ? {...other, done} : other)));

  const {notePath, page, checkboxTag} = todo;
  if (notePath !== null && page !== null && checkboxTag !== null) {
    setCheckbox(notePath, page, checkboxTag, done);
  }
}

// The OCR gets words wrong; this is how the user fixes one.
export async function updateTodoText(id: string, text: string) {
  if (!(await ensureLoaded())) {
    return;
  }
  commit(state.todos.map(todo => (todo.id === id ? {...todo, text} : todo)));
}

// Takes the whole todo, not just the id, because it needs `stickerPath`.
// The handwriting in the note is left alone — it's the user's, not ours.
export async function deleteTodo(todo: TodoItem) {
  if (!(await ensureLoaded())) {
    return;
  }
  commit(state.todos.filter(other => other.id !== todo.id));
  // Best-effort: a leftover .sticker file is untidy but harmless.
  if (todo.stickerPath) {
    FileUtils.deleteFile(todo.stickerPath).catch(() => {});
  }
}
