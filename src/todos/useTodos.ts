import {useEffect, useState} from 'react';
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

  // Reads the saved list once, when the plugin opens.
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
        setStatus('ready');
      })
      .catch((error: Error) => {
        if (cancelled) {
          return;
        }
        setErrorMessage(error.message || 'Could not read the saved todo list.');
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Every change goes through here: show the new list, then save it. The list
  // is small, so we rewrite all of it rather than track which item changed.
  function commit(next: TodoItem[]) {
    setTodos(next);
    saveTodos(next).catch((error: Error) => {
      setErrorMessage(error.message || 'Could not save the todo list.');
      setStatus('error');
    });
  }

  function addTodo(capture: Capture) {
    commit([...todos, {id: createId(), done: false, ...capture}]);
  }

  // Eventually this is also where the note's mark gets updated.
  function toggleTodo(id: string) {
    commit(
      todos.map(todo => (todo.id === id ? {...todo, done: !todo.done} : todo)),
    );
  }

  // The OCR gets words wrong; this is how the user fixes one.
  function updateTodoText(id: string, text: string) {
    commit(todos.map(todo => (todo.id === id ? {...todo, text} : todo)));
  }

  // Takes the whole todo, not just the id, because it needs `stickerPath`.
  // The handwriting in the note is left alone — it's the user's, not ours.
  function deleteTodo(todo: TodoItem) {
    commit(todos.filter(other => other.id !== todo.id));
    // Best-effort: a leftover .sticker file is untidy but harmless.
    if (todo.stickerPath) {
      FileUtils.deleteFile(todo.stickerPath).catch(() => {});
    }
  }

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
