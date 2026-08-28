import {useCallback, useState} from 'react';
import type {Capture, TodoItem} from '../types';

// In-memory only for now — resets when the plugin view closes. A simple
// incrementing counter is fine as an id source since there's no persistence
// to worry about colliding with yet.
let nextId = 0;

export function useTodos() {
  const [todos, setTodos] = useState<TodoItem[]>([]);

  const addTodo = useCallback(({text, stickerPath}: Capture) => {
    nextId += 1;
    setTodos(prev => [...prev, {id: String(nextId), text, stickerPath}]);
  }, []);

  return {todos, addTodo};
}
