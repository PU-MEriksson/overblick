import React from 'react';
import {FlatList, Pressable, StyleSheet, Text, View} from 'react-native';
import type {TodoItem} from '../types';

type Props = {
  todos: TodoItem[];
  textColor: {color: string};
  onToggle: (id: string) => void;
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

export function TodoList({todos, textColor, onToggle}: Props) {
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
    <FlatList
      style={styles.list}
      data={todos}
      keyExtractor={item => item.id}
      renderItem={({item}) => (
        <Pressable
          style={styles.row}
          onPress={() => onToggle(item.id)}
          hitSlop={8}
          accessibilityRole="checkbox"
          accessibilityState={{checked: item.done}}>
          <Checkbox checked={item.done} />
          <Text
            style={[
              styles.rowText,
              textColor,
              // No colour available to signal "done" on a black-and-white
              // screen, so the done state is carried by the tick plus a
              // strikethrough. Deliberately not grey — mid-greys dither badly
              // on e-ink and read as a rendering fault rather than a state.
              item.done && styles.rowTextDone,
            ]}>
            {item.text}
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    width: '100%',
  },
  row: {
    // The row is now the touch target, so the checkbox and text sit side by
    // side and tapping anywhere on the line toggles it — an easier target than
    // the box alone on a device this size.
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#cccccc',
  },
  checkbox: {
    width: 28,
    height: 28,
    marginRight: 16,
    // 2px rather than hairline: hairlines can disappear entirely on e-ink,
    // and an invisible checkbox is worse than an ugly one.
    borderWidth: 2,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
    color: '#000000',
  },
  rowText: {
    flex: 1,
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
