import {useEffect, useRef, useState} from 'react';
import {PluginManager, PluginCommAPI, FileUtils} from 'sn-plugin-lib';
import type {Rect} from 'sn-plugin-lib';
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

  // `onCaptured` is a new function on every render, and each one sees the todo
  // list as it was at that render. A capture takes a while (OCR), so by the
  // time it finishes, the version the listener started with may be stale.
  // Keeping the newest one in a ref means we always call the up-to-date one,
  // and the listener below only has to be registered once.
  const onCapturedRef = useRef(onCaptured);
  useEffect(() => {
    onCapturedRef.current = onCaptured;
  });

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

    // Best-effort, same as the sticker: which note/page/rect this capture came
    // from isn't used yet, but later work (persisting into the note, drawing a
    // synced checkbox) will need it, so we record it now rather than lose it.
    const captureLocation = async (): Promise<{
      notePath: string | null;
      page: number | null;
      rect: Rect | null;
    }> => {
      const [pathRes, pageRes, rectRes] = (await Promise.all([
        PluginCommAPI.getCurrentFilePath(),
        PluginCommAPI.getCurrentPageNum(),
        PluginCommAPI.getLassoRect(),
      ])) as [
        ApiResponse<string> | null | undefined,
        ApiResponse<number> | null | undefined,
        ApiResponse<Rect> | null | undefined,
      ];

      return {
        notePath: pathRes?.success ? pathRes.result ?? null : null,
        page: pageRes?.success ? pageRes.result ?? null : null,
        rect: rectRes?.success ? rectRes.result ?? null : null,
      };
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

      const [stickerPath, location] = await Promise.all([
        saveInkSnapshot(),
        captureLocation(),
      ]);

      onCapturedRef.current({
        text: textRes.result ?? '',
        stickerPath,
        ...location,
      });
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
  }, []);

  return {status, errorMessage};
}
