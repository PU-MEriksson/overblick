import {useCallback, useEffect, useRef, useState} from 'react';
import {FileUtils} from 'sn-plugin-lib';
import type {Capture, TodoItem} from '../types';
import {loadTodos, saveTodos} from './todoStorage';
import {MOCK_TODOS} from './mockTodos';

// TEMPORARY — see mockTodos.ts. Flip to false to get the empty list back.
// The `__DEV__` guard below means this can never reach a plugin package:
// buildPlugin.sh bundles with `--dev false`, which makes `__DEV__` false, so
// the seeding is dead code there whatever this says.
const USE_MOCK_TODOS = true;

// Ids have to stay unique across sessions now that the list is persisted — the
// old per-session counter restarted at 1 every launch and would have collided
// with ids already saved to disk. The counter only breaks ties between two
// captures made within the same millisecond.
let counter = 0;

function createId(): string {
  counter += 1;
  return `${Date.now()}-${counter}`;
}

type Status = 'loading' | 'ready' | 'error';

export function useTodos() {
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  // Guards the save effect below so it can't fire before the first read
  // finishes — otherwise the initial empty state would overwrite saved todos.
  const hasLoaded = useRef(false);

  useEffect(() => {
    let cancelled = false;

    loadTodos()
      .then(loaded => {
        if (cancelled) {
          return;
        }
        // Seed the mock todos only when there's nothing stored, so a dev-loop
        // list you've already edited isn't clobbered on every reload.
        const seed = __DEV__ && USE_MOCK_TODOS && loaded.length === 0;
        setTodos(seed ? MOCK_TODOS : loaded);
        hasLoaded.current = true;
        setStatus('ready');
      })
      .catch((error: Error) => {
        if (cancelled) {
          return;
        }
        // `hasLoaded` deliberately stays false: if we couldn't read what's
        // stored, we must not write over it.
        setErrorMessage(error.message || 'Could not read the saved todo list.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Saves the whole list on every change. The list is small enough that
  // rewriting all of it is cheaper than tracking which item changed. This also
  // runs once right after loading, harmlessly writing back what we just read.
  useEffect(() => {
    if (!hasLoaded.current) {
      return;
    }
    saveTodos(todos).catch((error: Error) => {
      setErrorMessage(error.message || 'Could not save the todo list.');
      setStatus('error');
    });
  }, [todos]);

  const addTodo = useCallback((capture: Capture) => {
    setTodos(prev => [...prev, {id: createId(), done: false, ...capture}]);
  }, []);

  // Flips one todo's done state. The save effect above picks the change up and
  // persists the whole list, so there's nothing to write here. Eventually this
  // is also where the note's mark gets updated — the two halves of milestone
  // step 4 have to move together, and this is the single place that knows a
  // toggle happened.
  const toggleTodo = useCallback((id: string) => {
    setTodos(prev =>
      prev.map(todo => (todo.id === id ? {...todo, done: !todo.done} : todo)),
    );
  }, []);

  // Replaces a todo's text — the OCR gets words wrong, and this is the only way
  // to fix one. Like the toggle above, the save effect persists it; nothing to
  // write here.
  const updateTodoText = useCallback((id: string, text: string) => {
    setTodos(prev =>
      prev.map(todo => (todo.id === id ? {...todo, text} : todo)),
    );
  }, []);

  // Removes a todo from the list, and deletes the ink snapshot that went with
  // it. Takes the whole todo rather than just an id because it needs the
  // `stickerPath`, and the `[]` deps below mean this can't read `todos` — that
  // closure still holds the empty array from the first render.
  //
  // Not cleaned up here: the handwriting itself, which is the user's note and
  // none of our business, and the mark on the page, which doesn't exist yet.
  // See CLAUDE.md — once a capture starts drawing a stroke link, deleting the
  // todo has to remove that too.
  const deleteTodo = useCallback((todo: TodoItem) => {
    // State first, so the row goes immediately; the save effect above rewrites
    // the stored list without it. Nothing here can fail.
    setTodos(prev => prev.filter(other => other.id !== todo.id));

    // Then the file. Deliberately outside the updater above: React treats
    // updaters as pure and may call them more than once (StrictMode does so on
    // purpose in dev), which would fire the delete twice. Best-effort for the
    // same reason writing it was — a leftover .sticker is untidy, but failing
    // the delete over one would be worse, and there's nothing the user could
    // do about it anyway.
    if (todo.stickerPath) {
      FileUtils.deleteFile(todo.stickerPath).catch(() => {});
    }
  }, []);

  return {
    todos,
    addTodo,
    toggleTodo,
    updateTodoText,
    deleteTodo,
    status,
    errorMessage,
  };
}
