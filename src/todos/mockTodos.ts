import type {TodoItem} from '../types';
import {todayKey} from './horizon';

/**
 * TEMPORARY — dev-loop scaffolding, delete once it stops being useful.
 *
 * Todos can only be created by lassoing handwriting, which needs the Supernote
 * plugin host. In the `yarn android` dev loop the app runs standalone, so
 * there's no lasso, no `PluginCommAPI`, and the list is always empty — which
 * makes it impossible to look at the list UI without doing a full package build
 * and installing on the device.
 *
 * These stand in for real captures so the list can be worked on with Fast
 * Refresh. The note-side fields are all null, exactly as they'd be if a capture
 * failed to record where it came from.
 */
export const MOCK_TODOS: TodoItem[] = [
  {
    id: 'mock-1',
    // Planned on an earlier day and not done: should still show under Today.
    text: 'Book the ferry tickets',
    done: false,
    doneOn: null,
    horizon: 'day',
    plannedOn: '2026-09-29',
    stickerPath: null,
    notePath: null,
    page: null,
    rect: null,
    boxes: [],
  },
  {
    id: 'mock-2',
    // Done with no date, as if ticked before `doneOn` existed: Logbook.
    text: 'Call the dentist back about the appointment',
    done: true,
    doneOn: null,
    horizon: null,
    plannedOn: null,
    stickerPath: null,
    notePath: null,
    page: null,
    rect: null,
    boxes: [],
  },
  {
    id: 'mock-3',
    // Long on purpose: checks that the text wraps and the trash icon stays put
    // instead of being pushed off the edge of the row.
    text: 'Ask about whether the balcony railing needs to be replaced before the inspection in the spring',
    done: false,
    doneOn: null,
    horizon: 'future',
    plannedOn: '2026-09-15',
    stickerPath: null,
    notePath: null,
    page: null,
    rect: null,
    boxes: [],
  },
  {
    id: 'mock-4',
    // Done today: top of the Logbook, above the undated one.
    text: 'Check the weather forecast for the weekend',
    done: true,
    doneOn: todayKey(),
    horizon: 'week',
    plannedOn: '2026-09-28',
    stickerPath: null,
    notePath: null,
    page: null,
    rect: null,
    boxes: [],
  },
];
