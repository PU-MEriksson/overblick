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
import React, {useCallback, useEffect, useRef, useState} from 'react';
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
import type {LinkRecord, LinkRect, ProbeRecord} from './probeRecord';
import {
  clearLinkRecord,
  clearProbeRecord,
  loadLinkRecord,
  loadProbeRecord,
  saveLinkRecord,
  saveProbeRecord,
} from './probeRecord';

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

// How far a shape's corners may sit from where we drew them and still count as
// ours. Deliberately small: the point of the match is to identify one specific
// square, and a generous tolerance would start claiming the user's own shapes.
// Whether any tolerance is needed at all is exactly what "find my square"
// measures — if points come back verbatim this can drop to 0.
const MATCH_TOLERANCE_PX = 4;

export function AnchorProbe() {
  const [log, setLog] = useState<string[]>([]);

  const say = useCallback((line: string) => {
    setLog(prev => [...prev, line]);
  }, []);

  // What we last stamped into a note, reloaded from storage on mount. Held in a
  // ref rather than state because nothing renders it — it's only ever read
  // inside async handlers, where a ref also can't go stale mid-experiment.
  const recordRef = useRef<ProbeRecord | null>(null);

  /** Prints the stored record, so every run starts by saying what it hunts for. */
  const describeRecord = useCallback(
    (record: ProbeRecord | null) => {
      if (!record) {
        say('No stamped element on record — run "B: pageElements" first.');
        return;
      }
      say(`hunting for tag=${record.tag}`);
      say(`  uuid=${record.uuid}`);
      say(`  num=${String(record.numInPage)} page=${String(record.page)}`);
      say(
        `  box=(${String(record.box.left)},${String(record.box.top)}) ` +
          `side=${String(record.box.side)}`,
      );
      say(`  note=${record.notePath}`);
      say(`  stamped ${record.insertedAt}`);
    },
    [say],
  );

  // The whole point of persisting the record: this survives closing the plugin
  // to go and close the note, which is the step the experiment can't skip.
  useEffect(() => {
    let cancelled = false;
    loadProbeRecord()
      .then(record => {
        if (cancelled) {
          return;
        }
        recordRef.current = record;
        describeRecord(record);
      })
      .catch((error: Error) => {
        if (!cancelled) {
          say(`loadProbeRecord failed: ${error.message}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [describeRecord, say]);

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

  /**
   * Returns the element it printed so a caller can record its `numInPage`.
   * Still not proof an insert worked — getLastElement happily returns someone
   * else's element after a failed insert — so treat the number as best-effort.
   */
  const reportLastElement = useCallback(async (): Promise<Record<
    string,
    unknown
  > | null> => {
    let found: Record<string, unknown> | null = null;
    await step('getLastElement', async () => {
      const res = (await PluginFileAPI.getLastElement()) as ApiResponse<
        Record<string, unknown>
      >;
      report('getLastElement', res);
      if (res?.success && res.result) {
        const el = res.result;
        found = el;
        say(`  num=${String(el.numInPage)} type=${String(el.type)}`);
        say(`  uuid=${String(el.uuid)}`);
        say(`  userData=${JSON.stringify(el.userData)}`);
      }
    });
    return found;
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

    // Read before recycling: recycleElement releases the native cache behind
    // this object, and the uuid is the thing we most want to remember.
    const uuid = String(el.uuid);

    let inserted = false;
    await step('insertPageElements', async () => {
      const res = (await PluginCommAPI.insertPageElements(
        [el],
        target.page,
      )) as ApiResponse<boolean>;
      report('insertPageElements', res);
      say(`  result=${String(res?.result)}`);
      inserted = res?.success === true;
    });

    const last = await reportLastElement();

    await step('recycleElement', async () => {
      PluginCommAPI.recycleElement(uuid);
      say('  recycled');
    });

    await save();
    await reload();

    // Written last, and only on a successful insert — a record pointing at an
    // element that was never created would send the read-back hunting for
    // something that legitimately isn't there, which is the one result we must
    // not misread as "the tag didn't survive".
    if (!inserted) {
      say('insert did not succeed — nothing recorded.');
      return;
    }

    await step('saveProbeRecord', async () => {
      const record: ProbeRecord = {
        tag,
        uuid,
        numInPage: last ? Number(last.numInPage) : -1,
        box: {left: SQUARE_LEFT, top: SQUARE_TOP, side: SQUARE_SIDE},
        notePath: target.notePath,
        page: target.page,
        insertedAt: new Date().toISOString(),
      };
      await saveProbeRecord(record);
      recordRef.current = record;
      say('recorded — safe to close the plugin and the note now.');
      describeRecord(record);
    });
  }, [
    buildSquare,
    currentPage,
    currentPen,
    describePlacement,
    describeRecord,
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

  /**
   * The actual test: does anything we stamped survive a reopen?
   *
   * Reads one page and states, per anchor, whether it survived. The listing
   * underneath is kept because it's the only way to tell "the tag is gone" from
   * "we're reading the wrong page" — a verdict of LOST against an element list
   * that doesn't contain our square at all means something different.
   */
  const inspect = useCallback(
    async (target: {notePath: string; page: number}) => {
      const record = recordRef.current;
      describeRecord(record);

      await step('getElements', async () => {
        const res = (await PluginFileAPI.getElements(
          target.page,
          target.notePath,
        )) as ApiResponse<Record<string, unknown>[]>;
        report('getElements', res);
        if (!res?.success || !res.result) {
          return;
        }
        const elements = res.result;

        if (record) {
          say('--- verdict ---');

          const byTag = elements.find(
            el => String(el.userData ?? '') === record.tag,
          );
          say(
            byTag
              ? `  userData  SURVIVED  (on element #${String(byTag.numInPage)})`
              : '  userData  LOST      (no element carries the tag)',
          );

          const byUuid = elements.find(
            el => String(el.uuid) === record.uuid,
          );
          say(
            byUuid
              ? `  uuid      SURVIVED  (on element #${String(byUuid.numInPage)})`
              : '  uuid      LOST      (no element carries it)',
          );

          const byNum = elements.find(
            el => Number(el.numInPage) === record.numInPage,
          );
          say(
            byNum
              ? `  numInPage #${String(record.numInPage)} is now type=${String(
                  byNum.type,
                )}${
                  Number(byNum.type) === Element.TYPE_GEO
                    ? ' — still a geometry'
                    : ' — NOT a geometry, the index moved'
                }`
              : `  numInPage #${String(record.numInPage)} no longer exists`,
          );
          say('---------------');
        }

        say(`${String(elements.length)} element(s):`);
        elements.forEach(el => {
          const data = String(el.userData ?? '');
          // Full uuid, not truncated: a shortened one can't be checked against
          // the record by eye, which is the whole reason we're reading it.
          say(
            `  #${String(el.numInPage)} type=${String(el.type)} ` +
              `uuid=${String(el.uuid)}`,
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
    },
    [describeRecord, report, say, step],
  );

  /** Inspects whatever note is open right now. */
  const readBack = useCallback(async () => {
    say('=== read back (current note) ===');
    const target = await currentPage();
    if (!target) {
      return;
    }
    await inspect(target);
  }, [currentPage, inspect, say]);

  /**
   * Inspects the note we stamped, by remembered path — deliberately not asking
   * what's open. Two things at once: it's the only way to read back while the
   * note is closed, and it proves whether the real feature can find checkboxes
   * in notes the user isn't looking at, which the todo list will have to do.
   */
  const readBackLastTarget = useCallback(async () => {
    say('=== read back (last target, by path) ===');
    const record = recordRef.current;
    if (!record) {
      describeRecord(null);
      return;
    }
    say('not using getCurrentFilePath — reading the recorded path directly');
    await inspect({notePath: record.notePath, page: record.page});
  }, [describeRecord, inspect, say]);

  /**
   * The fallback anchor, tested before we build on it: with `userData` and
   * `uuid` both ruled out, can we find our square again purely by its shape and
   * position?
   *
   * Two things to learn here, and the second matters as much as the first:
   * whether a match is findable at all, and whether the points come back
   * *verbatim*. If the device re-encodes or smooths what we inserted, matching
   * needs a real tolerance rather than an equality check — so the drift is
   * printed for every candidate, not just the winner.
   */
  const findMySquare = useCallback(async () => {
    say('=== find my square (geometry match) ===');
    const record = recordRef.current;
    if (!record) {
      describeRecord(null);
      return;
    }
    describeRecord(record);

    const {left, top, side} = record.box;
    const right = left + side;
    const bottom = top + side;

    await step('getElements', async () => {
      const res = (await PluginFileAPI.getElements(
        record.page,
        record.notePath,
      )) as ApiResponse<Record<string, unknown>[]>;
      report('getElements', res);
      if (!res?.success || !res.result) {
        return;
      }

      const shapes = res.result.filter(
        el => Number(el.type) === Element.TYPE_GEO && el.geometry,
      );
      say(`${String(shapes.length)} geometry element(s) on the page`);

      // A plain loop rather than reduce/forEach: the running best has to stay
      // readable after the loop, and closure assignment defeats narrowing.
      let bestNum = -1;
      let bestDrift = Number.POSITIVE_INFINITY;
      let bestPoints: {x: number; y: number}[] = [];

      for (const el of shapes) {
        const geo = el.geometry as {
          type?: string;
          points?: {x: number; y: number}[];
        };
        const points = geo.points ?? [];
        const num = Number(el.numInPage);
        if (points.length === 0) {
          say(`  #${String(num)} ${String(geo.type)} — no points`);
          continue;
        }

        const xs = points.map(p => p.x);
        const ys = points.map(p => p.y);
        const box = {
          left: Math.min(...xs),
          top: Math.min(...ys),
          right: Math.max(...xs),
          bottom: Math.max(...ys),
        };
        // Worst corner error, so one badly-placed edge can't hide behind three
        // good ones the way an average would let it.
        const drift = Math.max(
          Math.abs(box.left - left),
          Math.abs(box.top - top),
          Math.abs(box.right - right),
          Math.abs(box.bottom - bottom),
        );
        say(
          `  #${String(num)} ${String(geo.type)} ` +
            `bbox=(${String(box.left)},${String(box.top)})-` +
            `(${String(box.right)},${String(box.bottom)}) ` +
            `drift=${String(drift)}px`,
        );

        if (drift < bestDrift) {
          bestDrift = drift;
          bestNum = num;
          bestPoints = points;
        }
      }

      say('--- verdict ---');
      if (bestNum === -1) {
        say('  NO MATCH — no geometry with points on this page');
      } else if (bestDrift <= MATCH_TOLERANCE_PX) {
        say(
          `  MATCH element #${String(bestNum)} (drift ${String(bestDrift)}px, ` +
            `tolerance ${String(MATCH_TOLERANCE_PX)}px)`,
        );
        say(
          bestDrift === 0
            ? '  points came back VERBATIM — exact matching would work'
            : '  points shifted — matching needs a tolerance',
        );
        say('  as inserted: 5 pts closing the square');
        say(`  read back:   ${JSON.stringify(bestPoints)}`);
      } else {
        say(
          `  NO MATCH — closest is #${String(bestNum)} at ` +
            `${String(bestDrift)}px, over the ${String(
              MATCH_TOLERANCE_PX,
            )}px tolerance`,
        );
      }
      say('---------------');
    });
  }, [describeRecord, report, say, step]);

  // -------------------------------------------------------------------------
  // Stroke-link experiment
  //
  // Found by reading the SuperTask plugin (see docs/api-notes.md): a link
  // element's `destPath` is an arbitrary string kept verbatim, which is the
  // per-element identity `userData` and `uuid` failed to give us. `style: 2`
  // draws the dashed border, `linkType: 4` says "website URL" so the device
  // stores our made-up scheme instead of trying to resolve it.
  //
  // Three things to learn that SuperTask's code can't tell us: whether it works
  // for us at all, whether the border follows handwriting that gets dragged,
  // and whether it needs FILE:WRITE (it's lasso-scoped, so possibly not).
  // -------------------------------------------------------------------------

  const linkRef = useRef<LinkRecord | null>(null);

  const describeLink = useCallback(
    (record: LinkRecord | null) => {
      if (!record) {
        say('No link on record — run "L: link lasso" first.');
        return;
      }
      say(`link destPath=${record.destPath}`);
      say(`  page=${String(record.page)} note=${record.notePath}`);
      say(
        record.rect
          ? `  rect at creation: x=${String(record.rect.x)} y=${String(
              record.rect.y,
            )} w=${String(record.rect.width)} h=${String(record.rect.height)}`
          : '  rect at creation: unknown',
      );
      say(`  created ${record.createdAt}`);
    },
    [say],
  );

  useEffect(() => {
    let cancelled = false;
    loadLinkRecord()
      .then(record => {
        if (cancelled) {
          return;
        }
        linkRef.current = record;
        if (record) {
          describeLink(record);
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          say(`loadLinkRecord failed: ${error.message}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [describeLink, say]);

  /**
   * Pulls our link off a page and reports its border box. Shared by the create
   * and find paths so both measure the rect the same way.
   */
  const findLinkOnPage = useCallback(
    async (
      notePath: string,
      page: number,
      destPath: string,
    ): Promise<LinkRect | null> => {
      const res = (await PluginFileAPI.getElements(
        page,
        notePath,
      )) as ApiResponse<Record<string, unknown>[]>;
      report('getElements', res);
      if (!res?.success || !res.result) {
        return null;
      }

      const links = res.result.filter(
        el => Number(el.type) === Element.TYPE_LINK && el.link,
      );
      say(`${String(links.length)} link element(s) on the page`);

      let match: LinkRect | null = null;
      for (const el of links) {
        const link = el.link as Record<string, unknown>;
        const path = String(link.destPath ?? '');
        const mine = path === destPath;
        say(
          `  #${String(el.numInPage)} ${mine ? '<-- OURS' : ''} ` +
            `destPath=${path === '' ? '(empty)' : path}`,
        );
        say(
          `     style=${String(link.style)} linkType=${String(
            link.linkType,
          )} category=${String(link.category)}`,
        );
        say(
          `     x=${String(link.X)} y=${String(link.Y)} ` +
            `w=${String(link.width)} h=${String(link.height)}`,
        );
        // The strokes this link governs — if this list is populated, the link
        // is bound to the handwriting rather than to a position on the page.
        const trails = link.controlTrailNums;
        say(
          `     controlTrailNums=${
            Array.isArray(trails) ? JSON.stringify(trails) : String(trails)
          }`,
        );
        if (mine) {
          match = {
            x: Number(link.X),
            y: Number(link.Y),
            width: Number(link.width),
            height: Number(link.height),
          };
        }
      }
      return match;
    },
    [report, say],
  );

  /** Turns the active lasso selection into a dashed-border link. */
  const linkLasso = useCallback(async () => {
    say('=== link lasso (setLassoStrokeLink) ===');
    const target = await currentPage();
    if (!target) {
      return;
    }

    const destPath = `overblick://probe/${Date.now()}`;
    say(`destPath=${destPath}`);

    let ok = false;
    await step('setLassoStrokeLink', async () => {
      const res = (await PluginNoteAPI.setLassoStrokeLink({
        destPath,
        destPage: 0,
        style: 2, // dashed border
        linkType: 4, // URL — keeps our made-up scheme unresolved
      })) as ApiResponse<number>;
      report('setLassoStrokeLink', res);
      // Note this one returns a CODE, not a boolean: 0=success, -1=failure,
      // -2=destination needs upgrade. `success: true` with result -1 is a
      // failure, so checking success alone would be wrong here.
      say(`  code=${String(res?.result)} (0=ok, -1=fail, -2=needs upgrade)`);
      ok = res?.success === true && Number(res.result) === 0;
    });

    if (!ok) {
      say('link not created — is a lasso selection still active?');
      return;
    }

    await save();
    await reload();

    let rect: LinkRect | null = null;
    await step('read back rect', async () => {
      rect = await findLinkOnPage(target.notePath, target.page, destPath);
    });

    await step('saveLinkRecord', async () => {
      const record: LinkRecord = {
        destPath,
        notePath: target.notePath,
        page: target.page,
        rect,
        createdAt: new Date().toISOString(),
      };
      await saveLinkRecord(record);
      linkRef.current = record;
      say('recorded. Now: restart, then "7. Find my link".');
      say('Then drag the handwriting and tap 7 again.');
    });
  }, [currentPage, findLinkOnPage, reload, report, save, say, step]);

  /**
   * The test. Also the drag test: comparing the rect against the one recorded
   * at creation says whether the border follows the handwriting, which decides
   * whether a checkbox can be repositioned to match on every open.
   */
  const findMyLink = useCallback(async () => {
    say('=== find my link ===');
    const record = linkRef.current;
    if (!record) {
      describeLink(null);
      return;
    }
    describeLink(record);

    await step('getElements', async () => {
      const rect = await findLinkOnPage(
        record.notePath,
        record.page,
        record.destPath,
      );

      say('--- verdict ---');
      if (!rect) {
        say('  destPath  LOST — no link on the page carries it');
        say('---------------');
        return;
      }
      say('  destPath  SURVIVED');

      const before = record.rect;
      if (!before) {
        say('  (no rect recorded at creation — nothing to compare)');
      } else {
        const moved =
          Math.abs(rect.x - before.x) + Math.abs(rect.y - before.y);
        const resized =
          Math.abs(rect.width - before.width) +
          Math.abs(rect.height - before.height);
        say(
          `  rect now: x=${String(rect.x)} y=${String(rect.y)} ` +
            `w=${String(rect.width)} h=${String(rect.height)}`,
        );
        say(
          moved === 0 && resized === 0
            ? '  border UNMOVED since creation'
            : `  border MOVED by ${String(moved)}px (size delta ${String(
                resized,
              )}px) — it follows the handwriting`,
        );
      }
      say('---------------');
    });
  }, [describeLink, findLinkOnPage, say, step]);

  // -------------------------------------------------------------------------
  // Can "done" be a border-style flip?
  //
  // `Link.style` (0=solid underline, 1=solid border, 2=dashed border) is
  // persisted. If we can change it *without* the user having the link lassoed,
  // then "done" needs nothing drawn and nothing repositioned — the mark follows
  // the handwriting for free, which a geometry element we insert does not.
  //
  // Two routes, both tested here because the second rescues the first:
  //   8. via PluginFileAPI.modifyElements  — direct, by path, no lasso needed
  //   9. via lassoElements(rect) + modifyLassoLink — programmatically select
  //      the link's own rect first, then use the lasso-scoped API
  // -------------------------------------------------------------------------

  /** Quiet lookup — the flip paths do their own reporting. */
  const getMyLinkElement = useCallback(
    async (
      notePath: string,
      page: number,
      destPath: string,
    ): Promise<Record<string, unknown> | null> => {
      const res = (await PluginFileAPI.getElements(
        page,
        notePath,
      )) as ApiResponse<Record<string, unknown>[]>;
      if (!res?.success || !res.result) {
        report('getElements', res);
        return null;
      }
      const found = res.result.find(
        el =>
          Number(el.type) === Element.TYPE_LINK &&
          el.link &&
          String((el.link as Record<string, unknown>).destPath ?? '') ===
            destPath,
      );
      if (!found) {
        say('our link is not on this page');
        return null;
      }
      return found;
    },
    [report, say],
  );

  /** Reads back and prints the style, so both routes end the same way. */
  const reportStyle = useCallback(
    async (record: LinkRecord, expected: number) => {
      const el = await getMyLinkElement(
        record.notePath,
        record.page,
        record.destPath,
      );
      if (!el) {
        say('  cannot verify — link not found on read-back');
        return;
      }
      const style = Number((el.link as Record<string, unknown>).style);
      say(
        style === expected
          ? `  STYLE CHANGED to ${String(style)} — the flip works`
          : `  style is still ${String(style)}, wanted ${String(expected)}`,
      );
    },
    [getMyLinkElement, say],
  );

  /** Picks the other style, so the button toggles rather than only setting. */
  const nextStyle = (current: number) => (current === 2 ? 1 : 2);

  const flipStyleViaFile = useCallback(async () => {
    say('=== flip style via modifyElements (no lasso) ===');
    const record = linkRef.current;
    if (!record) {
      describeLink(null);
      return;
    }

    await step('modifyElements', async () => {
      const el = await getMyLinkElement(
        record.notePath,
        record.page,
        record.destPath,
      );
      if (!el) {
        return;
      }
      const link = el.link as Record<string, unknown>;
      const current = Number(link.style);
      const wanted = nextStyle(current);
      say(
        `#${String(el.numInPage)} style ${String(current)} -> ${String(
          wanted,
        )} (2=dashed, 1=solid border)`,
      );

      link.style = wanted;
      const res = (await PluginFileAPI.modifyElements(
        record.notePath,
        record.page,
        [el],
      )) as ApiResponse<number[]>;
      report('modifyElements', res);
      // Returns the indices it actually modified, so an empty array is a
      // silent no-op rather than a success.
      say(`  modified indices=${JSON.stringify(res?.result ?? null)}`);

      await reload();
      await reportStyle(record, wanted);
    });
  }, [
    describeLink,
    getMyLinkElement,
    reload,
    report,
    reportStyle,
    say,
    step,
  ]);

  const flipStyleViaLasso = useCallback(async () => {
    say('=== flip style via lassoElements + modifyLassoLink ===');
    const record = linkRef.current;
    if (!record) {
      describeLink(null);
      return;
    }

    await step('lasso + modify', async () => {
      const el = await getMyLinkElement(
        record.notePath,
        record.page,
        record.destPath,
      );
      if (!el) {
        return;
      }
      const link = el.link as Record<string, unknown>;
      const current = Number(link.style);
      const wanted = nextStyle(current);

      // Select the link's own border box. Uses the rect the device reports
      // *now*, not the one recorded at creation — the handwriting may have
      // moved since, and the whole point is that the link tracks it.
      const rect = {
        left: Number(link.X),
        top: Number(link.Y),
        right: Number(link.X) + Number(link.width),
        bottom: Number(link.Y) + Number(link.height),
      };
      say(`lassoElements ${JSON.stringify(rect)}`);
      const lassoRes = (await PluginCommAPI.lassoElements(
        rect,
      )) as ApiResponse<boolean>;
      report('lassoElements', lassoRes);
      if (!lassoRes?.success || lassoRes.result !== true) {
        say('  could not select the region — stopping');
        return;
      }

      say(`style ${String(current)} -> ${String(wanted)}`);
      const res = (await PluginNoteAPI.modifyLassoLink({
        destPath: record.destPath,
        destPage: 0,
        linkType: 4,
        style: wanted,
        fullText: null,
        showText: null,
      })) as ApiResponse<boolean>;
      report('modifyLassoLink', res);

      await save();
      await reload();
      await reportStyle(record, wanted);
    });
  }, [
    describeLink,
    getMyLinkElement,
    reload,
    report,
    reportStyle,
    save,
    say,
    step,
  ]);

  /** Starts the experiment over without reinstalling — storage outlives that. */
  const forgetRecord = useCallback(async () => {
    say('=== forget record ===');
    await step('clearProbeRecord', async () => {
      await clearProbeRecord();
      await clearLinkRecord();
      recordRef.current = null;
      linkRef.current = null;
      say('cleared (square and link).');
    });
  }, [say, step]);

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
    {
      label: '5. Read back last target',
      onPress: fire('Read back last target', readBackLastTarget),
    },
    {label: '6. Find my square', onPress: fire('Find', findMySquare)},
    {label: 'L: link lasso', onPress: fire('Link', linkLasso)},
    {label: '7. Find my link', onPress: fire('Find link', findMyLink)},
    {label: '8. Flip style (file)', onPress: fire('Flip file', flipStyleViaFile)},
    {
      label: '9. Flip style (lasso)',
      onPress: fire('Flip lasso', flipStyleViaLasso),
    },
    {label: 'A: polygon', onPress: fire('A', insertSimple)},
    {label: 'D: 4 lines', onPress: fire('D', insertLines)},
    {label: 'B: pageElements', onPress: fire('B', insertTagged)},
    {label: 'C: file insert', onPress: fire('C', insertViaFile)},
    {label: 'Save', onPress: fire('Save', save)},
    {label: 'Reload page', onPress: fire('Reload', reload)},
    {label: 'Forget record', onPress: fire('Forget', forgetRecord)},
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
            Lasso some handwriting, tap the lasso toolbar button to get here,
            then 1 (permissions).{'\n'}
            Style flip: L (if no link yet) → 8. If 8 fails, try 9. Each tap
            toggles dashed ↔ solid.
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
