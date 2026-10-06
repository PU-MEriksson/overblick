import {importKind, samePeriod} from '../src/todos/horizon';
import type {Horizon, TodoItem} from '../src/types';

function todo(horizon: Horizon | null, plannedOn: string | null): TodoItem {
  return {
    id: '1',
    text: 'Call the dentist',
    done: false,
    doneOn: null,
    horizon,
    plannedOn,
    stickerPath: null,
    notePath: null,
    page: null,
    rect: null,
    boxes: [],
  };
}

describe('samePeriod', () => {
  it('compares days exactly', () => {
    expect(samePeriod('2026-10-06', '2026-10-06', 'day')).toBe(true);
    expect(samePeriod('2026-10-05', '2026-10-06', 'day')).toBe(false);
  });

  it('starts weeks on Monday', () => {
    // 2026-10-04 is a Sunday, 2026-10-05 a Monday.
    expect(samePeriod('2026-10-04', '2026-10-05', 'week')).toBe(false);
    expect(samePeriod('2026-10-05', '2026-10-11', 'week')).toBe(true);
  });

  it('keeps a week together across a month and a year', () => {
    expect(samePeriod('2026-09-30', '2026-10-02', 'week')).toBe(true);
    // Monday 2026-12-28 to Sunday 2027-01-03.
    expect(samePeriod('2026-12-31', '2027-01-03', 'week')).toBe(true);
  });

  it('compares months, not just month numbers', () => {
    expect(samePeriod('2026-10-01', '2026-10-31', 'month')).toBe(true);
    expect(samePeriod('2025-10-15', '2026-10-15', 'month')).toBe(false);
  });
});

describe('importKind', () => {
  const today = '2026-10-06';

  it('migrates a todo from an earlier day of the same list', () => {
    expect(importKind(todo('day', '2026-10-05'), 'day', today)).toBe(
      'migrate',
    );
  });

  it('plans when the todo was planned in the same period', () => {
    expect(importKind(todo('day', today), 'day', today)).toBe('plan');
    // Monday of the same week.
    expect(importKind(todo('week', '2026-10-05'), 'week', today)).toBe('plan');
  });

  it('plans when the list is a different one', () => {
    expect(importKind(todo('month', '2026-09-01'), 'day', today)).toBe('plan');
    expect(importKind(todo(null, null), 'day', today)).toBe('plan');
  });

  it('plans when it is unknown when the todo was planned', () => {
    expect(importKind(todo('day', null), 'day', today)).toBe('plan');
  });
});
