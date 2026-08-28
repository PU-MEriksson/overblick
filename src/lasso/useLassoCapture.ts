import {useEffect, useRef, useState} from 'react';
import {PluginManager, PluginCommAPI, FileUtils} from 'sn-plugin-lib';
import type {ApiResponse, Capture} from '../types';

// Matches the "Lasso Button" registered in index.js (type 2 = lasso toolbar button).
const LASSO_BUTTON_ID = 200;
const STICKERS_DIR_NAME = 'stickers';

type Status = 'idle' | 'loading' | 'error';

/**
 * Listens for the Lasso Button and, on each press, fetches the current lasso
 * selection, OCRs it, and saves a snapshot of the original ink. The capture is
 * handed to `onCaptured` — this hook only reports capture status, it doesn't
 * own where the capture ends up.
 */
export function useLassoCapture(onCaptured: (capture: Capture) => void) {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  // Caches the stickers directory path across captures so we only hit the
  // filesystem to create it once per plugin session, not on every capture.
  const stickersDirRef = useRef<string | null>(null);

  useEffect(() => {
    const ensureStickersDir = async (): Promise<string | null> => {
      if (stickersDirRef.current) {
        return stickersDirRef.current;
      }
      const pluginDir = await PluginManager.getPluginDirPath();
      if (!pluginDir) {
        return null;
      }
      const dir = `${pluginDir}/${STICKERS_DIR_NAME}`;
      if (!(await FileUtils.exists(dir))) {
        const made = await FileUtils.makeDir(dir);
        if (!made) {
          return null;
        }
      }
      stickersDirRef.current = dir;
      return dir;
    };

    // Best-effort: saving the ink snapshot is separate from OCR, so a failure
    // here shouldn't lose the recognized text.
    const saveInkSnapshot = async (): Promise<string | null> => {
      const dir = await ensureStickersDir();
      if (!dir) {
        return null;
      }

      // Must be a `.sticker` path, not `.png` — see docs/api-notes.md.
      const stickerPath = `${dir}/${Date.now()}.sticker`;
      const stickerRes = (await PluginCommAPI.saveStickerByLasso(
        stickerPath,
      )) as ApiResponse<boolean> | null | undefined;
      return stickerRes?.success && stickerRes.result ? stickerPath : null;
    };

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
        setErrorMessage(
          sizeRes?.error?.message ?? 'Could not read the page size.',
        );
        setStatus('error');
        return;
      }

      const textRes = (await PluginCommAPI.recognizeElements(
        elementsRes.result ?? [],
        sizeRes.result,
      )) as ApiResponse<string> | null | undefined;
      if (!textRes?.success) {
        setErrorMessage(
          textRes?.error?.message ?? 'Handwriting recognition failed.',
        );
        setStatus('error');
        return;
      }

      const stickerPath = await saveInkSnapshot();

      onCaptured({text: textRes.result ?? '', stickerPath});
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
