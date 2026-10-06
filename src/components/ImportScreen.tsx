import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {Horizon, TodoItem} from '../types';
import {bucketFor, importKind, todayKey} from '../todos/horizon';
import type {Bucket} from '../todos/horizon';
import {importTodos, todosOnOpenPage} from '../note/importTodos';
import type {ImportResult} from '../note/importTodos';

type Props = {
  todos: TodoItem[];
  // Done: what happened ('' if nothing was tried), and whether it all went
  // well, so it's fine to go straight back to the note.
  onClose: (summary: string, backToNote: boolean) => void;
};

// The page you're on, which is also what the todos are planned as. Each shows
// only its own list's todos. Bigger lists (future log) aren't here: those are
// planned in the plugin, not on a page.
const TARGETS: {
  value: Horizon;
  label: string;
  period: string;
  bucket: Bucket;
}[] = [
  {value: 'day', label: 'Daily log', period: 'day', bucket: 'today'},
  {value: 'week', label: 'Weekly log', period: 'week', bucket: 'week'},
  {value: 'month', label: 'Monthly log', period: 'month', bucket: 'month'},
];

// What the screen is doing: reading the page on opening, letting you pick,
// writing, or showing why it couldn't read the page.
type Phase =
  | {kind: 'checking'}
  | {kind: 'picking'; onPage: string[]}
  | {kind: 'writing'; step: string}
  | {kind: 'failed'; reason: string};

/**
 * Pick todos and write them onto the page open in the note. Shown instead of
 * the list while open. The page is written in the order they were picked.
 */
export function ImportScreen({todos, onClose}: Props): React.JSX.Element {
  const [target, setTarget] = useState<Horizon>('day');
  // Ids in the order they were picked.
  const [picked, setPicked] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>({kind: 'checking'});

  // Reads the page once, when the screen opens (that's what the empty [] at
  // the end means). The returned function runs if the screen closes first,
  // so a late answer isn't put into a screen that's gone.
  useEffect(() => {
    let open = true;
    todosOnOpenPage(todos).then(result => {
      if (open) {
        setPhase(
          result.ok
            ? {kind: 'picking', onPage: result.ids}
            : {kind: 'failed', reason: result.reason},
        );
      }
    });
    return () => {
      open = false;
    };
    // Only on opening: a todo ticked meanwhile doesn't change what's on the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Picks from the other log would be hidden but still added, so they go.
  const chooseTarget = (next: Horizon) => {
    setTarget(next);
    setPicked([]);
  };

  const togglePick = (id: string) => {
    setPicked(ids =>
      ids.includes(id) ? ids.filter(other => other !== id) : [...ids, id],
    );
  };

  const add = async () => {
    const chosen = picked
      .map(id => todos.find(todo => todo.id === id))
      .filter((todo): todo is TodoItem => todo !== undefined);
    setPhase({kind: 'writing', step: 'Starting…'});
    const result = await importTodos(chosen, target, step =>
      setPhase({kind: 'writing', step}),
    );
    onClose(summarize(result), result.ok && result.didntFit.length === 0);
  };

  const log = TARGETS.find(option => option.value === target);
  const shown = todos.filter(
    todo => !todo.done && bucketFor(todo) === log?.bucket,
  );

  const allOnPage =
    phase.kind === 'picking' &&
    shown.length > 0 &&
    shown.every(todo => phase.onPage.includes(todo.id));

  const renderBody = () => {
    if (phase.kind === 'checking' || phase.kind === 'writing') {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
          <Text style={styles.status}>
            {phase.kind === 'checking' ? 'Reading the page…' : phase.step}
          </Text>
        </View>
      );
    }
    if (phase.kind === 'failed') {
      return (
        <View style={styles.centered}>
          <Text style={styles.status}>{phase.reason}</Text>
        </View>
      );
    }

    const today = todayKey();
    return (
      <>
        <View style={styles.targetArea}>
          <Text style={styles.heading}>Add to</Text>
          <View style={styles.targetRow}>
            {TARGETS.map(option => {
              const selected = option.value === target;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.targetButton, selected && styles.filled]}
                  onPress={() => chooseTarget(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{selected}}>
                  <Text
                    style={[styles.buttonText, selected && styles.whiteText]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {/* <Text style={styles.hint}>
            Their boxes on other pages stay. Ticking one ticks them all.
          </Text> */}
          {/* <Text style={styles.hint}>
            Already in this list from an earlier {chosen?.period}? It migrates:
            the old box becomes &gt;.
          </Text> */}
        </View>

        <ScrollView style={styles.list}>
          {shown.length === 0 && (
            <Text style={styles.empty}>No open todos in this log.</Text>
          )}
          {shown.map(todo => {
            if (phase.onPage.includes(todo.id)) {
              return (
                <View key={todo.id} style={styles.row}>
                  <View style={[styles.pickMark, styles.pickMarkOff]} />
                  <Text style={styles.rowText}>{todo.text}</Text>
                  <Text style={styles.onPage}>already on this page</Text>
                </View>
              );
            }
            const order = picked.indexOf(todo.id);
            const migrates =
              order >= 0 && importKind(todo, target, today) === 'migrate';
            return (
              <Pressable
                key={todo.id}
                style={styles.row}
                onPress={() => togglePick(todo.id)}
                accessibilityRole="checkbox"
                accessibilityState={{checked: order >= 0}}>
                <PickMark order={order} />
                <View style={styles.rowBody}>
                  <Text style={styles.bodyText}>{todo.text}</Text>
                  {migrates && (
                    <Text style={styles.migrates}>
                      Migrates: the old box becomes &gt;
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </>
    );
  };

  return (
    <View style={styles.container}>
      {/* Same height as the header it replaces, so nothing jumps. */}
      <View style={styles.topBar}>
        <Text style={styles.title}>Which page are you on?</Text>
      </View>
      {renderBody()}

      {/* Cancel is there whenever it can be, also if reading the page failed;
          Add only once there's something to pick. Hidden while writing. */}
      {phase.kind !== 'writing' && (
        <View style={styles.footer}>
          <Pressable
            style={[styles.footerButton, styles.cancelButton]}
            onPress={() => onClose('', true)}
            accessibilityRole="button">
            <Text style={styles.buttonText}>Cancel</Text>
          </Pressable>
          {phase.kind === 'picking' && (
            <Pressable
              style={[
                styles.footerButton,
                styles.filled,
                allOnPage && styles.buttonOff,
              ]}
              onPress={add}
              disabled={picked.length === 0}
              accessibilityRole="button"
              accessibilityState={{disabled: picked.length === 0}}>
              <Text style={[styles.buttonText, styles.whiteText]}>
                {allOnPage
                  ? `All ${log?.bucket} actions are already on this page`
                  : picked.length === 0
                  ? `Pick actions to add to the ${log?.label.toLowerCase()}`
                  : `Add ${picked.length} to the ${log?.label.toLowerCase()}`}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

/**
 * Round, not the list's square box, so picking doesn't look like ticking a
 * todo done. Picked, it's filled black with its place on the page: picked
 * first = written first. `order` is -1 when not picked.
 */
function PickMark({order}: {order: number}): React.JSX.Element {
  return (
    <View style={[styles.pickMark, order >= 0 && styles.filled]}>
      {order >= 0 && <Text style={styles.pickNumber}>{order + 1}</Text>}
    </View>
  );
}

function count(n: number): string {
  return n === 1 ? '1 todo' : `${n} todos`;
}

/** What happened, in a sentence or two for the list's notice line. */
function summarize(result: ImportResult): string {
  if (!result.ok) {
    return result.reason;
  }
  const parts: string[] = [];
  if (result.added.length > 0) {
    parts.push(
      result.migrated.length > 0
        ? `Added ${count(result.added.length)} to the page, ${
            result.migrated.length
          } migrated.`
        : `Added ${count(result.added.length)} to the page.`,
    );
  }
  if (result.alreadyHere.length > 0) {
    parts.push(`${count(result.alreadyHere.length)} already there.`);
  }
  if (result.didntFit.length > 0) {
    parts.push(
      `${count(result.didntFit.length)} didn't fit: add a page and add ${
        result.didntFit.length === 1 ? 'it' : 'them'
      } there.`,
    );
  }
  return parts.join(' ');
}

// Rounded, but only a little: big radii look blurry on e-ink.
const BUTTON_RADIUS = 8;
// A little bigger than the list's 24 px box, to fit a two-digit number.
const PICK_SIZE = 30;
const GREY = '#767676';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  topBar: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000000',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
  },
  status: {
    fontSize: 18,
    fontStyle: 'italic',
    textAlign: 'center',
    color: '#000000',
  },
  targetArea: {
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
  },
  heading: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 12,
    color: '#000000',
  },
  targetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  targetButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: BUTTON_RADIUS,
  },
  // Chosen = filled black, like the editor's buttons: no colour needed.
  filled: {
    backgroundColor: '#000000',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  whiteText: {
    color: '#ffffff',
  },
  hint: {
    marginTop: 12,
    fontSize: 15,
    fontStyle: 'italic',
    color: '#000000',
  },
  list: {
    flex: 1,
  },
  empty: {
    marginTop: 24,
    marginHorizontal: 24,
    fontSize: 18,
    fontStyle: 'italic',
    color: '#000000',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  rowBody: {
    flex: 1,
  },
  rowText: {
    flex: 1,
    fontSize: 18,
    color: '#000000',
  },
  // rowText without flex: inside rowBody it would squash the text's height.
  bodyText: {
    fontSize: 18,
    color: '#000000',
  },
  migrates: {
    marginTop: 4,
    fontSize: 15,
    fontStyle: 'italic',
    color: '#000000',
  },
  // Not pickable: a grey circle, and the reason at the row's right end.
  // Grey is a try-out on e-ink; it doesn't carry the meaning alone.
  pickMarkOff: {
    borderColor: GREY,
    backgroundColor: GREY,
  },
  onPage: {
    marginLeft: 12,
    fontSize: 15,
    fontStyle: 'italic',
    color: '#000000',
  },
  // borderRadius at half the size makes a circle. The border stays when
  // filled, so it keeps its size.
  pickMark: {
    width: PICK_SIZE,
    height: PICK_SIZE,
    marginRight: 16,
    borderRadius: PICK_SIZE / 2,
    borderWidth: 2,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#000000',
  },
  // Cancel takes its text's width; Add fills the rest of the row.
  footerButton: {
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: BUTTON_RADIUS,
  },
  cancelButton: {
    flexGrow: 0,
  },

  buttonOff: {
    backgroundColor: GREY,
    borderColor: GREY,
  },
});
