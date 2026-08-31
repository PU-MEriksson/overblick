/**
 * Simple Plugin
 *
 * @format
 */

import React from 'react';
import {
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  Pressable,
} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {useLassoCapture} from './src/lasso/useLassoCapture';
import {useTodos} from './src/todos/useTodos';
import {TodoList} from './src/todos/TodoList';
import {AnchorProbe} from './src/probe/AnchorProbe';

// TEMPORARY — spike for milestone step 4. Flip to false to hide, and delete
// this along with src/probe/ once the anchoring question is answered.
const SHOW_ANCHOR_PROBE = true;

/**
 * Plugin View
 * Shows the list of handwriting captured via lasso selections.
 */
function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const {
    todos,
    addTodo,
    status: storageStatus,
    errorMessage: storageError,
  } = useTodos();
  const {status: captureStatus, errorMessage: captureError} =
    useLassoCapture(addTodo);

  const handleClose = () => {
    PluginManager.closePluginView();
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
      <Pressable style={styles.closeButton} onPress={handleClose}>
        <Text style={[styles.closeText, textColor]}>✕</Text>
      </Pressable>
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
        <TodoList todos={todos} textColor={textColor} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 48,
    backgroundColor: '#ffffff',
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  closeText: {
    fontSize: 18,
    fontWeight: '600',
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
