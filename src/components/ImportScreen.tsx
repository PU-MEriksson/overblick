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
import {groupByBucket, importKind, todayKey} from '../todos/horizon';
import {Checkbox} from '../todos/TodoList';
import {importTodos, todosOnOpenPage} from '../note/importTodos';
import type {ImportResult} from '../note/importTodos';

type Props = {
  todos: TodoItem[];
  // Back to the list, with what happened ('' if nothing was tried).
  onClose: (summary: string) => void;
};

// What adding to a page plans the todos as. Bigger lists (future log) aren't
// here: those are planned in the plugin, not on a page.
const TARGETS: {value: Horizon; label: string; period: string}[] = [
  {value: 'day', label: 'Today', period: 'day'},
  {value: 'week', label: 'This week', period: 'week'},
  {value: 'month', label: 'This month', period: 'month'},
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
    onClose(summarize(result));
  };

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

    const sections = groupByBucket(todos);
    const today = todayKey();
    const period = TARGETS.find(option => option.value === target)?.period;
    return (
      <>
        <View style={styles.targetArea}>
          <Text style={styles.heading}>PLAN AS</Text>
          <View style={styles.targetRow}>
            {TARGETS.map(option => {
              const selected = option.value === target;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.targetButton, selected && styles.filled]}
                  onPress={() => setTarget(option.value)}
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
          <Text style={styles.hint}>
            Their boxes on other pages stay. Ticking one ticks them all.
          </Text>
          <Text style={styles.hint}>
            Already in this list from an earlier {period}? It migrates: the
            old box becomes &gt;.
          </Text>
        </View>

        <ScrollView style={styles.list}>
          {sections.map(section => (
            <View key={section.title}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.data.map(todo => {
                if (phase.onPage.includes(todo.id)) {
                  return (
                    <View key={todo.id} style={styles.row}>
                      <Text style={[styles.rowText, styles.onPage]}>
                        {todo.text} · already on this page
                      </Text>
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
                    <Checkbox checked={order >= 0} />
                    <View style={styles.rowBody}>
                      <Text style={styles.bodyText}>{todo.text}</Text>
                      {migrates && (
                        <Text style={styles.migrates}>
                          Migrates: the old box becomes &gt;
                        </Text>
                      )}
                    </View>
                    {/* Its place on the page: picked first = written first. */}
                    {order >= 0 && (
                      <Text style={styles.order}>{order + 1}</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            style={[styles.addButton, picked.length > 0 && styles.filled]}
            onPress={add}
            disabled={picked.length === 0}
            accessibilityRole="button">
            <Text
              style={[
                styles.buttonText,
                picked.length > 0 && styles.whiteText,
              ]}>
              {picked.length === 0
                ? 'Pick the todos to add'
                : `Add ${picked.length} to page`}
            </Text>
          </Pressable>
        </View>
      </>
    );
  };

  return (
    <View style={styles.container}>
      {/* Same height as the header it replaces, so nothing jumps. */}
      <View style={styles.topBar}>
        <Text style={styles.title}>Add to page</Text>
        {phase.kind !== 'writing' && (
          <Pressable style={styles.cancel} onPress={() => onClose('')}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        )}
      </View>
      {renderBody()}
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
  cancel: {
    position: 'absolute',
    right: 16,
    padding: 8,
  },
  cancelText: {
    fontSize: 16,
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
  sectionTitle: {
    marginTop: 18,
    marginHorizontal: 24,
    paddingBottom: 4,
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
    fontSize: 20,
    fontWeight: '700',
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
  // Not pickable: italic, and no box in front.
  onPage: {
    fontStyle: 'italic',
  },
  order: {
    marginLeft: 12,
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#000000',
  },
  addButton: {
    alignItems: 'center',
    paddingVertical: 14,
    borderWidth: 2,
    borderColor: '#000000',
  },
});
