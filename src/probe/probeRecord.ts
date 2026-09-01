/**
 * TEMPORARY — supports the milestone step 4 spike in AnchorProbe.tsx.
 * Delete along with the rest of src/probe/ once the findings are written up in
 * docs/api-notes.md.
 *
 * Why this file exists at all: the anchoring test requires closing and
 * reopening the note, which means leaving the plugin — and the probe's log
 * lives in useState, so reopening the plugin loses the tag we were hunting for.
 * Without a record that outlives the plugin view, the read-back is just a wall
 * of uuids with nothing to compare them against.
 *
 * AsyncStorage is the right home for it: it writes into the Supernote host
 * app's storage, not the plugin's, and is already proven on-device to survive a
 * device restart and even a plugin reinstall (see docs/api-notes.md). Closing
 * the plugin view is a far weaker test than either.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// Namespaced for the same reason as the todo list: this storage is shared with
// the host app and any other plugin using AsyncStorage.
const STORAGE_KEY = 'overblick:probe:lastInsert';

const SCHEMA_VERSION = 2;

export type ProbeRecord = {
  /**
   * The `userData` string we stamped onto the element. Kept only as a control —
   * confirmed on-device 2026-09-01 that it always reads back empty.
   */
  tag: string;
  /**
   * The element's uuid at insert time. Also a control: uuid is a native-cache
   * handle regenerated on every read, so this never matches anything.
   */
  uuid: string;
  /** Index within the page at insert time. -1 when we couldn't read it back. */
  numInPage: number;
  /**
   * Where we drew the square, in screen pixels. This is the only anchor with
   * any chance of working, so it's the one thing worth recording properly:
   * geometry points do survive the round trip, so the square can be searched
   * for by shape and position.
   */
  box: {left: number; top: number; side: number};
  notePath: string;
  page: number;
  insertedAt: string;
};

type StoredDocument = {
  schemaVersion: number;
  record: ProbeRecord;
};

export async function saveProbeRecord(record: ProbeRecord): Promise<void> {
  const document: StoredDocument = {schemaVersion: SCHEMA_VERSION, record};
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(document));
}

/**
 * Returns null when nothing has been stamped yet, or when what's stored can't
 * be understood. Unlike the todo list this deliberately does NOT throw on
 * damaged data — losing a probe record costs one re-run of the experiment,
 * whereas a probe that refuses to start is a probe that tells us nothing.
 */
export async function loadProbeRecord(): Promise<ProbeRecord | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const document = parsed as Partial<StoredDocument>;
  if (document.schemaVersion !== SCHEMA_VERSION || !document.record) {
    return null;
  }

  return document.record;
}

export async function clearProbeRecord(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Stroke-link experiment
//
// Kept under its own key rather than folded into ProbeRecord: the two
// experiments are independent, and sharing a record would mean a schema bump on
// one of them silently discarding the other's results mid-session.
// ---------------------------------------------------------------------------

const LINK_KEY = 'overblick:probe:lastLink';
const LINK_SCHEMA_VERSION = 1;

/** The link's own border box, as the device reports it on `Element.link`. */
export type LinkRect = {x: number; y: number; width: number; height: number};

export type LinkRecord = {
  /**
   * The made-up URL we stored in `destPath`. This is the anchor under test —
   * an arbitrary string the device keeps verbatim because linkType 4 says
   * "website URL", so it never tries to resolve it.
   */
  destPath: string;
  notePath: string;
  page: number;
  /**
   * Where the border sat when we created it, so a later read can tell whether
   * the link followed the handwriting after the user dragged it. Null when the
   * read-back after creation didn't return a rect.
   */
  rect: LinkRect | null;
  createdAt: string;
};

type StoredLinkDocument = {
  schemaVersion: number;
  record: LinkRecord;
};

export async function saveLinkRecord(record: LinkRecord): Promise<void> {
  const document: StoredLinkDocument = {
    schemaVersion: LINK_SCHEMA_VERSION,
    record,
  };
  await AsyncStorage.setItem(LINK_KEY, JSON.stringify(document));
}

export async function loadLinkRecord(): Promise<LinkRecord | null> {
  const raw = await AsyncStorage.getItem(LINK_KEY);
  if (raw === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const document = parsed as Partial<StoredLinkDocument>;
  if (document.schemaVersion !== LINK_SCHEMA_VERSION || !document.record) {
    return null;
  }

  return document.record;
}

export async function clearLinkRecord(): Promise<void> {
  await AsyncStorage.removeItem(LINK_KEY);
}
