import {useEffect, useSyncExternalStore} from 'react';
import {
  addTodo,
  deleteTodo,
  editTodo,
  ensureLoaded,
  getState,
  planTodos,
  subscribe,
  toggleTodo,
} from './todoStore';

/**
 * The todo list for a component. The list itself lives in todoStore.ts;
 * useSyncExternalStore re-renders this component whenever the store changes,
 * including changes made outside React (a tap in the note).
 */
export function useTodos() {
  const {todos, status, errorMessage} = useSyncExternalStore(
    subscribe,
    getState,
  );

  useEffect(() => {
    ensureLoaded();
  }, []);

  return {
    todos,
    addTodo,
    toggleTodo,
    editTodo,
    deleteTodo,
    planTodos,
    status,
    errorMessage,
  };
}
