import React from 'react';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import type {TodoItem} from '../types';

type Props = {
  todos: TodoItem[];
  textColor: {color: string};
  onToggle: (id: string) => void;
  // Which row is in selection mode, and how to change it. Owned by App rather
  // than here, because the header slot above the list needs it too — App swaps
  // the header for the action bar on the strength of it. The list's own job is
  // just to mark the row and report the long press.
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

/**
 * There is no checkbox in React Native — no `<input type="checkbox">`, and core
 * removed its `CheckBox` component (importing it now throws). Every checkbox in
 * every RN library is this: a Pressable wrapping a bordered box and a glyph. So
 * we own it, which suits us — the libraries all style for colour, and this
 * screen is 1-bit e-ink.
 *
 * `hitSlop` is the one non-obvious bit: it extends the touch target beyond the
 * drawn box without making the box bigger. A 28px checkbox is a fiddly target
 * with a fingertip on a device this size; this makes it comfortable without
 * disturbing the layout.
 */
function Checkbox({checked}: {checked: boolean}) {
  return (
    <View style={styles.checkbox}>
      {checked && <Text style={styles.checkmark}>✓</Text>}
    </View>
  );
}

export function TodoList({
  todos,
  textColor,
  onToggle,
  selectedId,
  onSelect,
}: Props) {
  if (todos.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, textColor]}>
          Lasso some handwriting, then tap this plugin's button on the lasso
          toolbar.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        style={styles.list}
        data={todos}
        keyExtractor={item => item.id}
        renderItem={({item}) => (
          <View
            style={[styles.row, item.id === selectedId && styles.rowSelected]}>
            <Pressable
              style={styles.toggleArea}
              onPress={() => onToggle(item.id)}
              accessibilityRole="checkbox"
              accessibilityState={{checked: item.done}}>
              <Checkbox checked={item.done} />
            </Pressable>
            <Pressable
              style={styles.textArea}
              onPress={() => onToggle(item.id)}
              // Long press toggles selection rather than only setting it, so
              // the same gesture that opens the bar also dismisses it. The
              // comparison is done here rather than with a state updater
              // function, because the state now lives a level up.
              onLongPress={() =>
                onSelect(selectedId === item.id ? null : item.id)
              }
              delayLongPress={400}
              accessibilityState={{selected: item.id === selectedId}}>
              <Text
                style={[
                  styles.rowText,
                  textColor,
                  item.done && styles.rowTextDone,
                ]}>
                {item.text}
              </Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    paddingTop: 18,
  },
  list: {
    flex: 1,
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    // The selection marker, transparent until a row is selected.
    borderWidth: 1,
    borderColor: 'transparent',
    borderLeftWidth: 6,
    borderLeftColor: 'transparent',
  },
  rowSelected: {
    borderColor: '#000000',
    borderLeftColor: '#000000',
  },
  toggleArea: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  textArea: {
    // Claims every pixel the checkbox doesn't, so a press anywhere along the
    // line still toggles and a long press anywhere along it selects the row —
    // a far easier target than the checkbox alone on a device this size.
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    marginRight: 16,
    borderWidth: 2,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '700',
    color: '#000000',
  },
  rowText: {
    fontSize: 18,
  },
  rowTextDone: {
    textDecorationLine: 'line-through',
    fontStyle: 'italic',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
  },
});
