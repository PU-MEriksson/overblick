/**
 * Simple Plugin
 *
 * @format
 */

import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  Pressable,
} from 'react-native';
import {PluginManager, PluginCommAPI} from 'sn-plugin-lib';

// Matches the "Lasso Button" registered in index.js (type 2 = lasso toolbar button).
const LASSO_BUTTON_ID = 200;

// PluginCommAPI's .d.ts under-types these calls as Promise<Object | null | undefined>;
// at runtime they resolve to this shape (confirmed in docs + APIResponse.d.ts).
type ApiResponse<T> = {
  success: boolean;
  result: T | null;
  error: {code: number; message: string} | null;
};

type Status = 'idle' | 'loading' | 'done' | 'error';

/**
 * Plugin View
 * Shows the handwriting-recognized text for the user's current lasso selection.
 */
function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const [status, setStatus] = useState<Status>('idle');
  const [recognizedText, setRecognizedText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // The Supernote's native lasso tool is what the user actually draws with — the plugin
  // never renders selection UI itself. The only signal we get is this button press, fired
  // when the user taps our button on the native lasso toolbar after making a selection.
  useEffect(() => {
    const handleLassoButtonPress = async () => {
      setStatus('loading');
      setErrorMessage('');

      const elementsRes = (await PluginCommAPI.getLassoElements()) as
        | ApiResponse<Object[]>
        | null
        | undefined;
      if (!elementsRes?.success) {
        setErrorMessage(
          elementsRes?.error?.message ?? 'Could not read the lasso selection.',
        );
        setStatus('error');
        return;
      }

      const sizeRes = (await PluginCommAPI.getPageDisplaySize()) as
        | ApiResponse<{width: number; height: number}>
        | null
        | undefined;
      if (!sizeRes?.success || !sizeRes.result) {
        setErrorMessage(sizeRes?.error?.message ?? 'Could not read the page size.');
        setStatus('error');
        return;
      }

      const textRes = (await PluginCommAPI.recognizeElements(
        elementsRes.result ?? [],
        sizeRes.result,
      )) as ApiResponse<string> | null | undefined;
      if (!textRes?.success) {
        setErrorMessage(textRes?.error?.message ?? 'Handwriting recognition failed.');
        setStatus('error');
        return;
      }

      setRecognizedText(textRes.result ?? '');
      setStatus('done');
    };

    const subscription = PluginManager.registerButtonListener({
      onButtonPress: event => {
        if (event.id === LASSO_BUTTON_ID) {
          handleLassoButtonPress();
        }
      },
    });

    return () => subscription.remove();
  }, []);

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
      {status === 'idle' && (
        <Text style={[styles.helloText, textColor]}>
          Lasso some handwriting, then tap this plugin's button on the lasso
          toolbar.
        </Text>
      )}
      {status === 'loading' && <ActivityIndicator size="large" />}
      {status === 'done' && (
        <Text style={[styles.helloText, textColor]}>
          {recognizedText || '(no text recognized)'}
        </Text>
      )}
      {status === 'error' && (
        <Text style={[styles.errorText, textColor]}>{errorMessage}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  helloText: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});

export default App;
