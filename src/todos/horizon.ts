import type {TodoItem} from '../types';

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
  const open = todos.filter(
    todo => !todo.done || lingering.includes(todo.id),
  );
  return SECTIONS.map(({bucket, title}) => ({
    title,
    data: open.filter(todo => bucketFor(todo) === bucket),
  })).filter(section => section.data.length > 0);
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
