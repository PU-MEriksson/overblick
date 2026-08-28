import {useEffect, useState} from 'react';
import {PluginManager, PluginCommAPI} from 'sn-plugin-lib';
import type {ApiResponse} from '../types';

// Matches the "Lasso Button" registered in index.js (type 2 = lasso toolbar button).
const LASSO_BUTTON_ID = 200;

type Status = 'idle' | 'loading' | 'error';

/**
 * Listens for the Lasso Button and, on each press, fetches the current lasso
 * selection and OCRs it. Recognized text is handed to `onCaptured` — this hook
 * only reports capture status, it doesn't own where the text ends up.
 */
export function useLassoCapture(onCaptured: (text: string) => void) {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const handleLassoButtonPress = async () => {
      setStatus('loading');
      setErrorMessage('');

      // The Supernote's native lasso tool is what the user actually draws with — the
      // plugin never renders selection UI itself. The only signal we get is this button
      // press, fired when the user taps our button on the native lasso toolbar.
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

      onCaptured(textRes.result ?? '');
      setStatus('idle');
    };

    const subscription = PluginManager.registerButtonListener({
      onButtonPress: event => {
        if (event.id === LASSO_BUTTON_ID) {
          handleLassoButtonPress();
        }
      },
    });

    return () => subscription.remove();
    // `onCaptured` must be stable (e.g. wrapped in useCallback by the caller) so this
    // effect registers the listener once rather than on every render.
  }, [onCaptured]);

  return {status, errorMessage};
}
