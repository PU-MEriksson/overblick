/**
 * Simple Plugin
 *
 * @format
 */

import React, {useState} from 'react';
import {
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {useLassoCapture} from './src/lasso/useLassoCapture';
import {useTodos} from './src/todos/useTodos';
import {TodoList} from './src/todos/TodoList';
import {AnchorProbe} from './src/probe/AnchorProbe';
import {Header} from './src/components/header';
import {ActionBar} from './src/components/ActionBar';
import {TodoEditor} from './src/components/TodoEditor';

// TEMPORARY — spike for milestone step 4. The anchoring question is answered
// (stroke links; see docs/api-notes.md), so the probe is off. Flip to true to
// get it back while designing the on-page mark; delete it along with src/probe/
// once that's settled too.
const SHOW_ANCHOR_PROBE = false;

/**
 * Plugin View
 * Shows the list of handwriting captured via lasso selections.
 */
function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const {
    todos,
    addTodo,
    toggleTodo,
    deleteTodo,
    updateTodoText,
    status: storageStatus,
    errorMessage: storageError,
  } = useTodos();
  const {status: captureStatus, errorMessage: captureError} =
    useLassoCapture(addTodo);

  // Selection mode: which todo the action bar is acting on, or null for no bar.
  // It lives up here rather than in TodoList because two siblings need it — the
  // list marks the selected row, and the slot above it swaps the header out for
  // the action bar. Nearest common parent wins, which is this component.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedTodo = todos.find(todo => todo.id === selectedId) ?? null;

  // Kept separate from `selectedId`: selecting a row and editing one are two
  // different states, and the editor opens on top of a row that has already
  // been deselected.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingTodo = todos.find(todo => todo.id === editingId) ?? null;

  const handleClose = () => {
    PluginManager.closePluginView();
  };

  const editSelected = () => {
    setEditingId(selectedId);
    setSelectedId(null);
  };

  const deleteSelected = () => {
    if (selectedTodo) {
      deleteTodo(selectedTodo);
    }
    setSelectedId(null);
  };

  const saveEdit = (text: string) => {
    if (editingId !== null) {
      updateTodoText(editingId, text);
    }
    setEditingId(null);
  };

  const textColor = {color: isDarkMode ? '#ffffff' : '#000000'};

  // Reading the saved list has to finish before the list means anything, and a
  // storage failure hides any capture error behind it — there's nowhere to put
  // a new capture until storage works again.
  const isBusy = storageStatus === 'loading' || captureStatus === 'loading';
  const failure =
    storageStatus === 'error'
      ? storageError
      : captureStatus === 'error'
      ? captureError
      : '';

  return (
    <View style={styles.container}>
      {/*
        One slot, two occupants. Selecting a todo replaces the header with the
        action bar instead of pushing it down — they're the same fixed height
        (headerSlot.ts), so nothing below moves. On a screen that repaints this
        slowly, a layout shift is the expensive part.
      */}
      {selectedTodo !== null ? (
        <ActionBar
          todo={selectedTodo}
          onClear={() => setSelectedId(null)}
          onEdit={editSelected}
          onDelete={deleteSelected}
        />
      ) : (
        <Header onClose={handleClose} />
      )}
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={isDarkMode ? '#000000' : '#ffffff'}
      />
      {SHOW_ANCHOR_PROBE && <AnchorProbe />}
      {!SHOW_ANCHOR_PROBE && isBusy && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
        </View>
      )}
      {!SHOW_ANCHOR_PROBE && !isBusy && failure !== '' && (
        <View style={styles.centered}>
          <Text style={[styles.errorText, textColor]}>{failure}</Text>
        </View>
      )}
      {!SHOW_ANCHOR_PROBE && !isBusy && failure === '' && (
        <TodoList
          todos={todos}
          textColor={textColor}
          onToggle={toggleTodo}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      )}

      {/*
        Mounted only while editing, which is how the editor seeds its draft —
        see the comment on TodoEditor. Unmounting it throws the draft away,
        which is exactly what cancelling should do.
      */}
      {editingTodo !== null && (
        <TodoEditor
          todo={editingTodo}
          textColor={textColor}
          onCancel={() => setEditingId(null)}
          onSave={saveEdit}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 0,
    backgroundColor: '#ffffff',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    fontStyle: 'italic',
    textAlign: 'center',
  },
});

export default App;
