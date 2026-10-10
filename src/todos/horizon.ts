import type {Horizon, NoteBox, TodoItem} from '../types';

// The sections of the Upcoming view. Each todo is in exactly one.
export type Bucket = 'inbox' | 'today' | 'week' | 'month' | 'future';

/**
 * Which section a todo belongs in. A todo stays in its section until it's
 * ticked or moved: a 'day' todo planned last Tuesday is still Today, never
 * overdue.
 *
 * `plannedOn` isn't needed yet, since it's always the day the todo was sorted.
 * It starts to matter once a todo can be planned ahead (e.g. the future log
 * by month).
 */
export function bucketFor(todo: TodoItem): Bucket {
  switch (todo.horizon) {
    case null:
      return 'inbox';
    case 'day':
      return 'today';
    case 'week':
      return 'week';
    case 'month':
      return 'month';
    case 'future':
      return 'future';
  }
}

// The Upcoming view's sections, top to bottom.
const SECTIONS: {bucket: Bucket; title: string}[] = [
  {bucket: 'inbox', title: 'Inbox'},
  {bucket: 'today', title: 'Today'},
  {bucket: 'week', title: 'This week'},
  {bucket: 'month', title: 'This month'},
  {bucket: 'future', title: 'Future log'},
];

export type TodoSection = {title: string; data: TodoItem[]};

/**
 * The open todos grouped into the Upcoming view's sections, in that order.
 * Done todos are in the Logbook instead, so Upcoming only shows what's left.
 * Empty sections are left out to keep the list short. Within a section, todos
 * keep the order they were captured in. `data` is the name SectionList expects.
 * `lingering` ids are just ticked and stay in their section a moment longer.
 */
export function groupByBucket(
  todos: TodoItem[],
  lingering: string[] = [],
): TodoSection[] {
  const open = todos.filter(todo => isShownOpen(todo, lingering));
  return SECTIONS.map(({bucket, title}) => ({
    title,
    data: open.filter(todo => bucketFor(todo) === bucket),
  })).filter(section => section.data.length > 0);
}

// Open, or just ticked and still lingering in its section.
function isShownOpen(todo: TodoItem, lingering: string[]): boolean {
  return !todo.done || lingering.includes(todo.id);
}

/**
 * The Logbook: every done todo, most recently done first. 'YYYY-MM-DD' strings
 * sort the same as the dates they hold; undated ones (done before `doneOn`
 * existed) go last. `lingering` todos are still showing in their section, so
 * they're left out here until they move.
 */
export function logbook(
  todos: TodoItem[],
  lingering: string[] = [],
): TodoItem[] {
  return todos
    .filter(todo => todo.done && !lingering.includes(todo.id))
    .sort((a, b) => (b.doneOn ?? '').localeCompare(a.doneOn ?? ''));
}

// The views you can switch between, in the order of the tabs. Upcoming shows
// every open todo once, by section; the others one section each; the Logbook
// only done todos.
export type View = 'upcoming' | Bucket | 'logbook';

// What each one-section view shows, smallest horizon first: its own todos plus
// the ones planned within it, like a bullet journal's monthly list still
// holding what was moved to this week. The future log is later months, so
// this month's work isn't in it.
const VIEW_BUCKETS: Record<Bucket, Bucket[]> = {
  inbox: ['inbox'],
  today: ['today'],
  week: ['today', 'week'],
  month: ['today', 'week', 'month'],
  future: ['future'],
};

export const VIEWS: {view: View; label: string}[] = [
  {view: 'inbox', label: 'Inbox'},
  {view: 'upcoming', label: 'Upcoming'},
  {view: 'today', label: 'Today'},
  {view: 'week', label: 'Week'},
  {view: 'month', label: 'Month'},
  {view: 'future', label: 'Future'},
  {view: 'logbook', label: 'Logbook'},
];

/**
 * What a view lists: its sections of open todos, and the done todos that
 * belong to it (behind "Show logged" at the bottom). `done` is null
 * for the Logbook view, which is all done todos already.
 *
 * A one-section view always has its section, even empty, so the heading
 * shows; Upcoming leaves empty sections out to stay short. Week and Month
 * include the smaller horizons (VIEW_BUCKETS), today's first; Upcoming keeps
 * each todo under its own heading.
 */
export function viewContent(
  view: View,
  todos: TodoItem[],
  lingering: string[] = [],
): {sections: TodoSection[]; done: TodoItem[] | null} {
  if (view === 'upcoming') {
    return {
      sections: groupByBucket(todos, lingering),
      done: logbook(todos, lingering),
    };
  }
  if (view === 'logbook') {
    return {sections: [{title: 'Logbook', data: logbook(todos)}], done: null};
  }
  const buckets = VIEW_BUCKETS[view];
  // sort() keeps the captured order within the same horizon.
  const mine = todos
    .filter(todo => buckets.includes(bucketFor(todo)))
    .sort(
      (a, b) => buckets.indexOf(bucketFor(a)) - buckets.indexOf(bucketFor(b)),
    );
  const title = SECTIONS.find(section => section.bucket === view)?.title ?? '';
  return {
    sections: [
      {title, data: mine.filter(todo => isShownOpen(todo, lingering))},
    ],
    done: logbook(mine, lingering),
  };
}

/**
 * Today as local 'YYYY-MM-DD'. Built by hand because `toISOString()` gives the
 * UTC date, which in Sweden is still yesterday until 01:00 or 02:00.
 */
export function todayKey(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// A 'YYYY-MM-DD' key as a local Date, the reverse of todayKey.
function fromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// The Monday of the key's week, as a key. getDay() is 0 for Sunday.
function mondayOf(key: string): string {
  const date = fromKey(key);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return todayKey(date);
}

/** Whether two 'YYYY-MM-DD' keys are the same day, week (Monday start) or month. */
export function samePeriod(a: string, b: string, level: Horizon): boolean {
  switch (level) {
    case 'day':
      return a === b;
    case 'week':
      return mondayOf(a) === mondayOf(b);
    case 'month':
      return a.slice(0, 7) === b.slice(0, 7);
    case 'future':
      // The future log isn't split by month yet: it's always the same one.
      return true;
  }
}

/**
 * What adding a todo to a page as `target` does. Same list, planned in an
 * earlier day/week/month: migration (its old box there becomes `>`).
 * Anything else: planning (the old boxes stay, linked). Without a
 * `plannedOn` we can't tell it's earlier, so it's planning.
 */
export function importKind(
  todo: TodoItem,
  target: Horizon,
  today: string,
): 'plan' | 'migrate' {
  return todo.horizon === target &&
    todo.plannedOn !== null &&
    !samePeriod(todo.plannedOn, today, target)
    ? 'migrate'
    : 'plan';
}

/** The list a box belongs to. One of unknown level counts as the todo's own. */
export function boxLevel(box: NoteBox, todo: TodoItem): Horizon | null {
  return box.level ?? todo.horizon;
}
