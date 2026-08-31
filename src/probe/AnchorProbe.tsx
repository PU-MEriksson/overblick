/**
 * TEMPORARY — a spike for milestone step 4, not part of the plugin.
 *
 * Question it exists to answer: once we draw a checkbox into a note, how do we
 * find that same checkbox again later in order to toggle it? `Element` carries
 * both a `uuid` ("unique identifier") and a `userData` ("custom user data")
 * field, but the docs never say whether either survives being written into the
 * .note file and read back in a later session.
 *
 * Design rule for this file, learned the hard way: **nothing may fail
 * silently.** Every handler is wrapped so a thrown error is printed rather than
 * rejecting an async onPress and leaving a button looking dead. Each step is
 * also independent — one failing call must not block the others, since a probe
 * that stops at the first problem tells us about that problem only.
 *
 * Delete this file, and its use in App.tsx, once the findings are written up in
 * docs/api-notes.md.
 */
import React, {useCallback, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {
  Element,
  Geometry,
  PluginCommAPI,
  PluginFileAPI,
  PluginManager,
  PluginNoteAPI,
} from 'sn-plugin-lib';
import type {ApiResponse} from '../types';

// Reading a note's *contents* is permissioned too, not just writing — the note
// lives in shared Note/ storage. Confirmed on-device: without FILE:READ, even
// getPageSize/getElementNumList fail with error 1503, "File read permission has
// not been requested". Only the plugin's own directory is exempt.
const FILE_READ = 'plugin.permission.FILE:READ';
const FILE_WRITE = 'plugin.permission.FILE:WRITE';

// Hardcoded on purpose. The first version derived these from the page size,
// which meant a failed getPageSize blocked the experiment entirely. EMR
// coordinates run to roughly 21632 on a normal page, so a square at 2000,2000
// should land in the upper-left area — and if it lands somewhere unexpected,
// that itself tells us which coordinate space geometry points use.
// Screen/page pixels, NOT EMR. Established on-device by dumping a straight line
// drawn with the Supernote's own shape tool: its points came back as
// [{x:259,y:874},{x:986,y:874}] on a 1404x1872 page. Earlier versions sent EMR
// values (~2000+) and the shape landed off-page — inserted and persisted
// correctly, just never visible. Element.maxX/maxY are EMR; Geometry.points
// are not, and nothing in the docs says so.
const SQUARE_LEFT = 300;
const SQUARE_TOP = 500;
const SQUARE_SIDE = 120;

// insertGeometry rejects a thinner pen with error 107, "pen width must be
// >= 100". The device's own straight line uses 500, so penWidth is evidently
// not in the same units as the points.
const MIN_PEN_WIDTH = 100;

// Copied from that same native straight line. Guessed values (penType 1) were
// wrong; these are known to render.
const NATIVE_PEN = {type: 10, color: 0, width: 500};

export function AnchorProbe() {
  const [log, setLog] = useState<string[]>([]);

  const say = useCallback((line: string) => {
    setLog(prev => [...prev, line]);
  }, []);

  /**
   * Runs one step, printing whatever happens — including a thrown error, which
   * is the case that previously made buttons look dead.
   */
  const step = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      try {
        await fn();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        say(`${label} THREW: ${message}`);
      }
    },
    [say],
  );

  /** Prints an APIResponse's success/result/error without assuming success. */
  const report = useCallback(
    (label: string, res: ApiResponse<unknown> | null | undefined) => {
      if (res === null || res === undefined) {
        say(`${label}: null/undefined`);
        return;
      }
      say(`${label}: success=${String(res.success)}`);
      if (res.error) {
        say(`  error ${String(res.error.code)}: ${res.error.message}`);
      }
      return;
    },
    [say],
  );

  /** Note path + page only — deliberately no page size, see note above. */
  const currentPage = useCallback(async (): Promise<{
    notePath: string;
    page: number;
  } | null> => {
    const pathRes = (await PluginCommAPI.getCurrentFilePath()) as ApiResponse<string>;
    if (!pathRes?.success || !pathRes.result) {
      report('getCurrentFilePath', pathRes);
      say('No current file — open a note first.');
      return null;
    }
    const pageRes = (await PluginCommAPI.getCurrentPageNum()) as ApiResponse<number>;
    const page = pageRes?.success ? pageRes.result ?? 0 : 0;
    say(`note=${pathRes.result}`);
    say(`page=${String(page)} (raw success=${String(pageRes?.success)})`);
    return {notePath: pathRes.result, page};
  }, [report, say]);

  type Pen = {type: number; color: number; width: number};

  /**
   * Borrows the pen the user is actually holding, so we use a type/color/width
   * combination the device already considers valid instead of guessing at
   * undocumented enum values. Falls back to the documented minimum.
   */
  const currentPen = useCallback(async (): Promise<Pen> => {
    const fallback: Pen = {...NATIVE_PEN};
    try {
      const res = (await PluginCommAPI.getPenInfo()) as ApiResponse<Pen>;
      if (res?.success && res.result) {
        const pen = res.result;
        say(
          `getPenInfo type=${String(pen.type)} color=${String(pen.color)} ` +
            `width=${String(pen.width)}`,
        );
        return {...pen, width: Math.max(MIN_PEN_WIDTH, pen.width)};
      }
      report('getPenInfo', res);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      say(`getPenInfo THREW: ${message}`);
    }
    say(`  falling back to ${JSON.stringify(fallback)}`);
    return fallback;
  }, [report, say]);

  /**
   * Calls each read-only API separately so one failure can't hide the others.
   * This is what tells us which calls work on this firmware at all.
   */
  const diagnose = useCallback(async () => {
    say('=== diagnose ===');
    const target = await currentPage();

    await step('getPageDisplaySize', async () => {
      const res = (await PluginCommAPI.getPageDisplaySize()) as ApiResponse<{
        width: number;
        height: number;
      }>;
      report('getPageDisplaySize', res);
      if (res?.success && res.result) {
        say(`  ${String(res.result.width)} x ${String(res.result.height)}`);
      }
    });

    if (target) {
      await step('getPageSize', async () => {
        const res = (await PluginFileAPI.getPageSize(
          target.notePath,
          target.page,
        )) as ApiResponse<{width: number; height: number}>;
        report('getPageSize', res);
        if (res?.success && res.result) {
          say(`  ${String(res.result.width)} x ${String(res.result.height)}`);
        }
      });

      await step('getNoteType', async () => {
        const res = (await PluginFileAPI.getNoteType(
          target.notePath,
        )) as ApiResponse<number>;
        report('getNoteType', res);
        say(`  type=${String(res?.result)} (0=normal, 1=recognition)`);
      });

      await step('getLayers', async () => {
        const res = (await PluginFileAPI.getLayers(
          target.notePath,
          target.page,
        )) as ApiResponse<
          {layerId: number; name: string; isVisible: boolean}[]
        >;
        report('getLayers', res);
        (res?.result ?? []).forEach(layer => {
          say(
            `  layer ${String(layer.layerId)} "${layer.name}" ` +
              `visible=${String(layer.isVisible)}`,
          );
        });
      });

      await step('getElementNumList', async () => {
        const res = (await PluginFileAPI.getElementNumList(
          target.notePath,
          target.page,
        )) as ApiResponse<number[]>;
        report('getElementNumList', res);
        say(`  nums=${JSON.stringify(res?.result ?? null)}`);
      });
    }

    await step('getPenInfo', async () => {
      await currentPen();
    });

    await step('hasPermission', async () => {
      const read = await PluginManager.hasPermission(FILE_READ);
      const write = await PluginManager.hasPermission(FILE_WRITE);
      say(`hasPermission READ=${String(read)} WRITE=${String(write)}`);
      say('  0=not granted, 1=granted');
    });
  }, [currentPage, currentPen, report, say, step]);

  /**
   * Requests both. READ comes first because without it every file-scoped call
   * fails with 1503 before writing is even reachable.
   */
  const askPermissions = useCallback(async () => {
    say('=== request permissions ===');
    await step('requestPermission(READ)', async () => {
      const granted = await PluginManager.requestPermission(
        FILE_READ,
        'Överblick needs to read this note to find its checkboxes.',
      );
      say(`READ -> ${String(granted)} (0=denied, 1=while using, 2=always)`);
    });
    await step('requestPermission(WRITE)', async () => {
      const granted = await PluginManager.requestPermission(
        FILE_WRITE,
        'Överblick needs to draw a checkbox into this note.',
      );
      say(`WRITE -> ${String(granted)} (0=denied, 1=while using, 2=always)`);
    });
  }, [say, step]);

  const buildSquare = useCallback((pen: Pen): Geometry => {
    const square = new Geometry();
    square.type = Geometry.TYPE_POLYGON;
    square.points = [
      {x: SQUARE_LEFT, y: SQUARE_TOP},
      {x: SQUARE_LEFT + SQUARE_SIDE, y: SQUARE_TOP},
      {x: SQUARE_LEFT + SQUARE_SIDE, y: SQUARE_TOP + SQUARE_SIDE},
      {x: SQUARE_LEFT, y: SQUARE_TOP + SQUARE_SIDE},
      {x: SQUARE_LEFT, y: SQUARE_TOP},
    ];
    square.penColor = pen.color;
    square.penType = pen.type;
    square.penWidth = pen.width;
    square.showLassoAfterInsert = false;
    square.ellipseCenterPoint = null;
    square.ellipseMajorAxisRadius = 0;
    square.ellipseMinorAxisRadius = 0;
    square.ellipseAngle = 0;
    return square;
  }, []);

  const reportLastElement = useCallback(async () => {
    await step('getLastElement', async () => {
      const res = (await PluginFileAPI.getLastElement()) as ApiResponse<
        Record<string, unknown>
      >;
      report('getLastElement', res);
      if (res?.success && res.result) {
        const el = res.result;
        say(`  num=${String(el.numInPage)} type=${String(el.type)}`);
        say(`  uuid=${String(el.uuid)}`);
        say(`  userData=${JSON.stringify(el.userData)}`);
      }
    });
  }, [report, say, step]);

  /**
   * Borrows pen settings from ink already on the page. Better than getPenInfo
   * for our purposes: whatever the user drew with is provably visible, so if
   * our square still doesn't show, colour is ruled out as the cause.
   */
  const penFromPage = useCallback(
    async (target: {notePath: string; page: number}): Promise<Pen | null> => {
      const res = (await PluginFileAPI.getElements(
        target.page,
        target.notePath,
      )) as ApiResponse<Record<string, unknown>[]>;
      if (!res?.success || !res.result) {
        return null;
      }
      // Prefer an existing geometry: it's the exact kind of element we're
      // inserting, so its pen values are known-good for this path.
      const shape = res.result.find(
        el => Number(el.type) === Element.TYPE_GEO && el.geometry,
      );
      if (shape) {
        const geo = shape.geometry as {
          penColor: number;
          penType: number;
          penWidth: number;
        };
        say(
          `borrowing shape pen from #${String(shape.numInPage)}: ` +
            `color=${String(geo.penColor)} type=${String(geo.penType)} ` +
            `width=${String(geo.penWidth)}`,
        );
        return {
          type: geo.penType,
          color: geo.penColor,
          width: Math.max(MIN_PEN_WIDTH, geo.penWidth),
        };
      }

      const inked = res.result.find(
        el => Number(el.type) === Element.TYPE_STROKE && el.stroke,
      );
      if (!inked) {
        say('  no existing ink on this page to copy pen settings from');
        return null;
      }
      const stroke = inked.stroke as {penColor: number; penType: number};
      const width = Math.max(MIN_PEN_WIDTH, Number(inked.thickness) || 0);
      say(
        `borrowing ink from #${String(inked.numInPage)}: ` +
          `color=${String(stroke.penColor)} type=${String(stroke.penType)} ` +
          `thickness=${String(inked.thickness)} -> width=${String(width)}`,
      );
      return {type: stroke.penType, color: stroke.penColor, width};
    },
    [say],
  );

  /** Says where on the page the square should appear, so we know where to look. */
  const describePlacement = useCallback(async () => {
    await step('placement', async () => {
      const res = (await PluginCommAPI.getPageDisplaySize()) as ApiResponse<{
        width: number;
        height: number;
      }>;
      say(
        `square px (${String(SQUARE_LEFT)},${String(SQUARE_TOP)}) ` +
          `size ${String(SQUARE_SIDE)}`,
      );
      if (res?.success && res.result) {
        say(
          `page is ${String(res.result.width)} x ${String(res.result.height)} px`,
        );
      }
    });
  }, [say, step]);

  /**
   * A square built from four separate straight lines, copying the one geometry
   * shape we have a known-good example of. GEO_polygon may well work, but the
   * device's own shape tool only produces straight lines here, so we have no
   * evidence it renders — this path needs no such assumption.
   */
  const buildSquareLines = useCallback((pen: Pen): Geometry[] => {
    const l = SQUARE_LEFT;
    const t = SQUARE_TOP;
    const r = SQUARE_LEFT + SQUARE_SIDE;
    const b = SQUARE_TOP + SQUARE_SIDE;
    const corners: [number, number, number, number][] = [
      [l, t, r, t],
      [r, t, r, b],
      [r, b, l, b],
      [l, b, l, t],
    ];
    return corners.map(([x1, y1, x2, y2]) => {
      const line = new Geometry();
      line.type = Geometry.TYPE_STRAIGHT_LINE;
      line.points = [
        {x: x1, y: y1},
        {x: x2, y: y2},
      ];
      line.penColor = pen.color;
      line.penType = pen.type;
      line.penWidth = pen.width;
      line.showLassoAfterInsert = false;
      line.ellipseCenterPoint = null;
      line.ellipseMajorAxisRadius = 0;
      line.ellipseMinorAxisRadius = 0;
      line.ellipseAngle = 0;
      return line;
    });
  }, []);

  /**
   * The comm APIs edit the live in-memory document; getElements reads the file.
   * Without a save, an insert can report success and still be invisible to a
   * read-back — which is exactly what we observed.
   */
  const save = useCallback(async () => {
    await step('saveCurrentNote', async () => {
      const res = (await PluginNoteAPI.saveCurrentNote()) as ApiResponse<boolean>;
      report('saveCurrentNote', res);
    });
  }, [report, step]);

  /** The rendered page may be stale even when the data is written. */
  const reload = useCallback(async () => {
    await step('reloadFile', async () => {
      const res = (await PluginCommAPI.reloadFile()) as ApiResponse<boolean>;
      report('reloadFile', res);
    });
  }, [report, step]);

  const insertSimple = useCallback(async () => {
    say('=== insertGeometry (simple) ===');
    const target = await currentPage();
    const pen = (target ? await penFromPage(target) : null) ?? (await currentPen());
    say(`using pen ${JSON.stringify(pen)}`);
    await describePlacement();
    await step('insertGeometry', async () => {
      const res = (await PluginCommAPI.insertGeometry(
        buildSquare(pen),
      )) as ApiResponse<boolean>;
      report('insertGeometry', res);
      say(`  result=${String(res?.result)}`);
    });
    await reportLastElement();
    await save();
    await reload();
  }, [
    buildSquare,
    currentPage,
    currentPen,
    describePlacement,
    penFromPage,
    reload,
    report,
    reportLastElement,
    save,
    say,
    step,
  ]);

  /** Four straight lines, inserted one at a time via the path we know works. */
  const insertLines = useCallback(async () => {
    say('=== four straight lines ===');
    const target = await currentPage();
    const pen = (target ? await penFromPage(target) : null) ?? (await currentPen());
    say(`using pen ${JSON.stringify(pen)}`);
    await describePlacement();

    const lines = buildSquareLines(pen);
    for (let i = 0; i < lines.length; i += 1) {
      await step(`insertGeometry line ${String(i + 1)}`, async () => {
        const res = (await PluginCommAPI.insertGeometry(
          lines[i],
        )) as ApiResponse<boolean>;
        report(`line ${String(i + 1)}`, res);
      });
    }
    await save();
    await reload();
  }, [
    buildSquareLines,
    currentPage,
    currentPen,
    describePlacement,
    penFromPage,
    reload,
    report,
    save,
    say,
    step,
  ]);

  /**
   * Third path: write straight to the file by path, rather than to the live
   * document. If the comm-API inserts are being lost because they never reach
   * the file, this one should stick where they didn't.
   */
  const insertViaFile = useCallback(async () => {
    say('=== PluginFileAPI.insertElements (file) ===');
    const target = await currentPage();
    if (!target) {
      return;
    }
    const pen = (await penFromPage(target)) ?? (await currentPen());
    say(`using pen ${JSON.stringify(pen)}`);

    let element: Record<string, unknown> | null = null;
    await step('createElement', async () => {
      const res = (await PluginCommAPI.createElement(
        Element.TYPE_GEO,
      )) as ApiResponse<Record<string, unknown>>;
      report('createElement', res);
      if (res?.success && res.result) {
        element = res.result;
      }
    });
    if (!element) {
      return;
    }
    const el: Record<string, unknown> = element;

    const tag = `overblick:file:${Date.now()}`;
    el.userData = tag;
    el.pageNum = target.page;
    el.geometry = buildSquare(pen);
    say(`userData=${tag}`);

    await step('insertElements', async () => {
      const res = (await PluginFileAPI.insertElements(
        target.notePath,
        target.page,
        [el],
      )) as ApiResponse<boolean>;
      report('insertElements', res);
      say(`  result=${String(res?.result)}`);
    });

    await step('recycleElement', async () => {
      PluginCommAPI.recycleElement(String(el.uuid));
    });
    await reload();
  }, [
    buildSquare,
    currentPage,
    currentPen,
    penFromPage,
    reload,
    report,
    say,
    step,
  ]);

  const insertTagged = useCallback(async () => {
    say('=== createElement + insertPageElements (tagged) ===');
    const target = await currentPage();
    if (!target) {
      return;
    }

    let element: Record<string, unknown> | null = null;

    await step('createElement', async () => {
      const res = (await PluginCommAPI.createElement(
        Element.TYPE_GEO,
      )) as ApiResponse<Record<string, unknown>>;
      report('createElement', res);
      if (res?.success && res.result) {
        element = res.result;
        say(`  created uuid=${String(res.result.uuid)}`);
      }
    });

    if (!element) {
      say('No element to insert — stopping here.');
      return;
    }
    const el: Record<string, unknown> = element;

    const pen = (await penFromPage(target)) ?? (await currentPen());
    say(`using pen ${JSON.stringify(pen)}`);
    await describePlacement();
    const tag = `overblick:probe:${Date.now()}`;
    await step('populate element', async () => {
      el.userData = tag;
      el.pageNum = target.page;
      el.geometry = buildSquare(pen);
      say(`  userData set to ${tag}`);
    });

    await step('insertPageElements', async () => {
      const res = (await PluginCommAPI.insertPageElements(
        [el],
        target.page,
      )) as ApiResponse<boolean>;
      report('insertPageElements', res);
      say(`  result=${String(res?.result)}`);
    });

    await reportLastElement();

    await step('recycleElement', async () => {
      PluginCommAPI.recycleElement(String(el.uuid));
      say('  recycled');
    });

    await save();
    await reload();
  }, [
    buildSquare,
    currentPage,
    currentPen,
    describePlacement,
    penFromPage,
    reload,
    report,
    reportLastElement,
    save,
    say,
    step,
  ]);

  /**
   * Ground truth for the coordinate space. Our geometry elements insert and
   * persist but never render, and the leading suspect is that Geometry.points
   * wants a different coordinate space than the EMR values we're sending — in
   * which case our square is simply off-page.
   *
   * Reading the raw points of ink the user drew settles it: if they run to
   * ~15819 it's EMR, if they run to ~1404 it's screen pixels. Drawing a shape
   * with the Supernote's own shape tool and dumping it gives us a complete,
   * known-good Geometry to copy.
   */
  const dumpDetails = useCallback(async () => {
    say('=== dump details ===');
    const target = await currentPage();
    if (!target) {
      return;
    }
    await step('getElements', async () => {
      const res = (await PluginFileAPI.getElements(
        target.page,
        target.notePath,
      )) as ApiResponse<Record<string, unknown>[]>;
      report('getElements', res);
      if (!res?.success || !res.result) {
        return;
      }
      for (const el of res.result.slice(0, 8)) {
        const type = Number(el.type);
        say(`#${String(el.numInPage)} type=${String(type)}`);

        if (el.geometry) {
          const geo = el.geometry as {
            type?: string;
            points?: {x: number; y: number}[];
            penColor?: number;
            penType?: number;
            penWidth?: number;
          };
          const points = geo.points ?? [];
          say(
            `  geo=${String(geo.type)} color=${String(geo.penColor)} ` +
              `penType=${String(geo.penType)} width=${String(geo.penWidth)}`,
          );
          say(`  ${String(points.length)} pts: ${JSON.stringify(points.slice(0, 4))}`);
        }

        if (type === Element.TYPE_STROKE && el.stroke) {
          const stroke = el.stroke as {
            penColor?: number;
            penType?: number;
            points?: {
              size: () => Promise<number>;
              getRange: (i: number, c: number) => Promise<unknown[]>;
            };
          };
          say(
            `  ink color=${String(stroke.penColor)} ` +
              `penType=${String(stroke.penType)} ` +
              `thickness=${String(el.thickness)}`,
          );
          try {
            const size = (await stroke.points?.size()) ?? 0;
            const first = (await stroke.points?.getRange(
              0,
              Math.min(3, size),
            )) as unknown[];
            say(`  ${String(size)} ink pts: ${JSON.stringify(first)}`);
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            say(`  ink points unreadable: ${message}`);
          }
        }
      }
    });
  }, [currentPage, report, say, step]);

  /** The actual test: does anything we stamped survive a reopen? */
  const readBack = useCallback(async () => {
    say('=== read back ===');
    const target = await currentPage();
    if (!target) {
      return;
    }
    await step('getElements', async () => {
      const res = (await PluginFileAPI.getElements(
        target.page,
        target.notePath,
      )) as ApiResponse<Record<string, unknown>[]>;
      report('getElements', res);
      if (!res?.success || !res.result) {
        return;
      }
      say(`${String(res.result.length)} element(s):`);
      res.result.forEach(el => {
        const data = String(el.userData ?? '');
        say(
          `  #${String(el.numInPage)} type=${String(el.type)} ` +
            `uuid=${String(el.uuid).slice(0, 8)}…`,
        );
        say(`     userData=${data === '' ? '(empty)' : data}`);
        // Coordinate bounds of the user's own ink tell us, empirically, which
        // coordinate space this page uses — which is what our square needs.
        say(
          `     maxX=${String(el.maxX)} maxY=${String(el.maxY)} ` +
            `layer=${String(el.layerNum)}`,
        );
      });
    });
  }, [currentPage, report, say, step]);

  // Last line of defence: anything that escapes `step` still gets printed
  // rather than vanishing into an unhandled rejection.
  const fire = useCallback(
    (label: string, fn: () => Promise<void>) => () => {
      fn().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        say(`${label} handler failed: ${message}`);
      });
    },
    [say],
  );

  const buttons: {label: string; onPress: () => void}[] = [
    {label: '1. Permissions', onPress: fire('Permissions', askPermissions)},
    {label: '2. Diagnose', onPress: fire('Diagnose', diagnose)},
    {label: '3. Read back', onPress: fire('Read back', readBack)},
    {label: '4. Dump details', onPress: fire('Dump', dumpDetails)},
    {label: 'A: polygon', onPress: fire('A', insertSimple)},
    {label: 'D: 4 lines', onPress: fire('D', insertLines)},
    {label: 'B: pageElements', onPress: fire('B', insertTagged)},
    {label: 'C: file insert', onPress: fire('C', insertViaFile)},
    {label: 'Save', onPress: fire('Save', save)},
    {label: 'Reload page', onPress: fire('Reload', reload)},
    {label: 'Clear', onPress: () => setLog([])},
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Anchor probe (temporary)</Text>
      <View style={styles.buttonRow}>
        {buttons.map(b => (
          <Pressable key={b.label} style={styles.button} onPress={b.onPress}>
            <Text style={styles.buttonText}>{b.label}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView style={styles.logBox}>
        {log.length === 0 ? (
          <Text style={styles.logLine}>
            Open a scratch note, then tap Diagnose first.
          </Text>
        ) : (
          log.map((line, i) => (
            <Text key={i} style={styles.logLine}>
              {line}
            </Text>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Takes the whole plugin view while spiking — the log is the entire point
    // of this screen, and the first version clipped it into unreadability.
    flex: 1,
    borderWidth: 2,
    borderColor: '#000000',
    margin: 8,
    padding: 8,
  },
  heading: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
    color: '#000000',
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  button: {
    borderWidth: 1,
    borderColor: '#000000',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginRight: 6,
    marginBottom: 6,
  },
  buttonText: {
    fontSize: 14,
    color: '#000000',
  },
  logBox: {
    flex: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#000000',
    paddingTop: 6,
  },
  logLine: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#000000',
    marginBottom: 1,
  },
});
