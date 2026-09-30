import React, {useState} from 'react';
import {
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  Text,
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

// TEMPORARY — flip to true to swap the list for the note-writing test screen.
// Delete along with src/probe/ once step 4 is finished.
const SHOW_ANCHOR_PROBE = false;

/**
 * Plugin View
 * Shows the list of handwriting captured via lasso selections.
 */
function App(): React.JSX.Element {
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

  // Which todo the action bar is acting on, or null for no bar. Lives here
  // because both the list and the header slot need it.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedTodo = todos.find(todo => todo.id === selectedId) ?? null;

  // Which todo is open in the editor. Separate from `selectedId`: the row is
  // deselected when the editor opens.
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

  const isBusy = storageStatus === 'loading' || captureStatus === 'loading';
  // A storage error wins: there's nowhere to put a capture until storage works.
  const failure =
    storageStatus === 'error'
      ? storageError
      : captureStatus === 'error'
      ? captureError
      : '';

  // What goes under the header. The first matching case wins.
  const renderBody = () => {
    if (SHOW_ANCHOR_PROBE) {
      return <AnchorProbe />;
    }
    if (isBusy) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
        </View>
      );
    }
    if (failure !== '') {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{failure}</Text>
        </View>
      );
    }
    return (
      <TodoList
        todos={todos}
        onToggle={toggleTodo}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
    );
  };

  return (
    <View style={styles.container}>
      {/*
        Selecting a todo swaps the header for the action bar. They're the same
        height, so nothing below moves — a layout shift is slow on e-ink.
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
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {renderBody()}

      {/* Only mounted while editing; unmounting throws the draft away. */}
      {editingTodo !== null && (
        <TodoEditor
          todo={editingTodo}
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
    color: '#000000',
  },
});

export default App;
