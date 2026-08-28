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

/**
 * Plugin View
 * Shows the list of handwriting captured via lasso selections.
 */
function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const {todos, addTodo} = useTodos();
  const {status, errorMessage} = useLassoCapture(addTodo);

  const handleClose = () => {
    PluginManager.closePluginView();
  };

  const textColor = {color: isDarkMode ? '#ffffff' : '#000000'};

  return (
    <View style={styles.container}>
      <Pressable style={styles.closeButton} onPress={handleClose}>
        <Text style={[styles.closeText, textColor]}>✕</Text>
      </Pressable>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={isDarkMode ? '#000000' : '#ffffff'}
      />
      {status === 'loading' && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
        </View>
      )}
      {status === 'error' && (
        <View style={styles.centered}>
          <Text style={[styles.errorText, textColor]}>{errorMessage}</Text>
        </View>
      )}
      {status === 'idle' && <TodoList todos={todos} textColor={textColor} />}
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
