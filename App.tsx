import React, {useEffect, useState} from 'react';
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
import {Header} from './src/components/header';
import {ActionBar} from './src/components/ActionBar';
import {TodoEditor} from './src/components/TodoEditor';
import {ImportScreen} from './src/components/ImportScreen';
import {Sidebar} from './src/components/Sidebar';
import {VIEWS} from './src/todos/horizon';
import type {View as ListView} from './src/todos/horizon';
import {importTodos} from './src/note/importTodos';
import type {Horizon} from './src/types';

// How long the notice line under the header stays before it clears itself.
const NOTICE_MS = 4000;

// The sidebar buttons registered in index.js.
const OPEN_BUTTON_ID = 100;
const ADD_TO_PAGE_BUTTON_ID = 400;

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
    editTodo,
    status: storageStatus,
    errorMessage: storageError,
  } = useTodos();
  const {status: captureStatus, errorMessage: captureError} =
    useLassoCapture(addTodo);

  // Which todo the action bar is acting on, or null for no bar. Lives here
  // because both the list and the header slot need it.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedTodo = todos.find(todo => todo.id === selectedId) ?? null;

  // Which view the list shows. Starts on Upcoming each time the plugin opens:
  // everything open, each todo once, so nothing gets lost.
  const [view, setView] = useState<ListView>('upcoming');

  // Whether the sidebar shows. Lives here, not in Sidebar, because the
  // header's ☰ button changes it and the sidebar reads it.
  // Starts hidden: the list gets the full width, the header names the view.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // With the sidebar hidden, the header names the view so you know where you are.
  const viewLabel = VIEWS.find(option => option.view === view)?.label ?? '';

  // A selected todo may not be in the next view, so switching clears it.
  const changeView = (next: ListView) => {
    setSelectedId(null);
    setView(next);
  };

  // Which todo is open in the editor. Separate from `selectedId`: the row is
  // deselected when the editor opens.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingTodo = todos.find(todo => todo.id === editingId) ?? null;

  // True while a todo is being written onto the page. `notice` says what
  // happened, for a few seconds.
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState('');

  // Runs every time `notice` changes. A new notice starts a timer that clears
  // it; the returned function cancels that timer if the notice changes (or
  // the screen closes) first, so an old timer can't clear a newer notice.
  useEffect(() => {
    if (notice === '') {
      return;
    }
    const timer = setTimeout(() => setNotice(''), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // Whether the "Add to page" screen is showing instead of the list.
  const [importOpen, setImportOpen] = useState(false);

  // Which sidebar button opened the plugin decides the screen. Registered
  // once, when the app starts; the press that opened the view still arrives,
  // because the library hands a new listener the last second's press.
  useEffect(() => {
    const subscription = PluginManager.registerButtonListener({
      onButtonPress: event => {
        if (event.id === ADD_TO_PAGE_BUTTON_ID) {
          setNotice('');
          setSelectedId(null);
          setImportOpen(true);
        } else if (event.id === OPEN_BUTTON_ID) {
          setImportOpen(false);
        }
      },
    });
    return () => subscription.remove();
  }, []);

  // Back to the note when the screen's work is done, so you're where you
  // started; otherwise to the list, showing what went wrong.
  const closeImport = (summary: string, backToNote: boolean) => {
    setImportOpen(false);
    if (backToNote) {
      PluginManager.closePluginView();
    } else {
      setNotice(summary);
    }
  };

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

  // async, so it can wait for the write before hiding the spinner.
  const toPageSelected = async () => {
    if (selectedTodo === null) {
      return;
    }
    setSelectedId(null);
    setNotice('');
    setImporting(true);
    const result = await importTodos([selectedTodo], null);
    setImporting(false);
    if (!result.ok) {
      setNotice(result.reason);
    } else if (result.alreadyHere.length > 0) {
      setNotice('That todo is already on this page.');
    } else if (result.didntFit.length > 0) {
      setNotice("That todo didn't fit below what's written on this page.");
    }
  };

  const saveEdit = (text: string, horizon: Horizon | null) => {
    if (editingId !== null) {
      editTodo(editingId, text, horizon);
    }
    setEditingId(null);
  };

  if (importOpen) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
        <ImportScreen todos={todos} onClose={closeImport} />
      </View>
    );
  }

  const isBusy =
    storageStatus === 'loading' || captureStatus === 'loading' || importing;
  // A storage error wins: there's nowhere to put a capture until storage works.
  const failure =
    storageStatus === 'error'
      ? storageError
      : captureStatus === 'error'
      ? captureError
      : '';

  // What goes under the header. The first matching case wins.
  const renderBody = () => {
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
        view={view}
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
          onToPage={toPageSelected}
        />
      ) : (
        <Header
          onClose={handleClose}
          onMenu={() => setSidebarOpen(!sidebarOpen)}
          menuLabel={sidebarOpen ? '' : viewLabel}
        />
      )}
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      {/* <ViewTabs view={view} onChange={changeView} />

      {notice !== '' && <Text style={styles.notice}>{notice}</Text>}
      {renderBody()} */}

      <View style={styles.main}>
        {sidebarOpen && <Sidebar view={view} onChange={changeView} />}
        <View style={styles.body}>
          {notice !== '' && <Text style={styles.notice}>{notice}</Text>}
          {renderBody()}
        </View>
      </View>

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
  notice: {
    marginHorizontal: 24,
    marginTop: 12,
    fontSize: 18,
    fontStyle: 'italic',
    color: '#000000',
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    fontStyle: 'italic',
    textAlign: 'center',
    color: '#000000',
  },
  main: {
    flex: 1,
    flexDirection: 'row',
  },
  body: {
    // Takes whatever width the sidebar leaves.
    flex: 1,
  },
});

export default App;
