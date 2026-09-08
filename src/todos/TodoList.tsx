import React from 'react';
import {FlatList, Image, Pressable, StyleSheet, Text, View} from 'react-native';
import type {TodoItem} from '../types';

type Props = {
  todos: TodoItem[];
  textColor: {color: string};
  onToggle: (id: string) => void;
  // Takes the whole todo, not just its id: deleting has to clean up the todo's
  // `.sticker` file, and the path to it lives on the item.
  onDelete: (todo: TodoItem) => void;
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

export function TodoList({todos, textColor, onToggle, onDelete}: Props) {
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
        // The row is a plain View holding two separate touch targets. A
        // Pressable inside a Pressable would work on Android, but the press
        // bubbles — tapping delete would toggle the todo on the way out.
        <View style={styles.row}>
          <Pressable
            style={styles.toggleArea}
            onPress={() => onToggle(item.id)}
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
          <Pressable
            style={styles.deleteButton}
            onPress={() => onDelete(item)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${item.text}`}>
            <Image
              source={require('../../assets/trash.png')}
              style={styles.trashIcon}
              resizeMode="contain"
            />
          </Pressable>
        </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#cccccc',
  },
  toggleArea: {
    // `flex: 1` makes the toggle claim every pixel the delete button doesn't,
    // so tapping anywhere along the line toggles it — a far easier target than
    // the checkbox alone on a device this size. The vertical padding lives here
    // rather than on the row so it's part of the touch target, not dead space
    // around it.
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  deleteButton: {
    // Sized to a comfortable fingertip target and pushed clear of the text.
    // `hitSlop` on top of this extends the touch area without moving anything.
    paddingVertical: 12,
    paddingLeft: 16,
  },
  checkbox: {
    width: 24,
    height: 24,
    marginRight: 16,
    // 2px rather than hairline: hairlines can disappear entirely on e-ink,
    // and an invisible checkbox is worse than an ugly one.
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
  trashIcon: {
    // The PNG is 512px square; RN scales it down to whatever box we give it, so
    // the drawn size is set here rather than taken from the file.
    width: 24,
    height: 24,
    tintColor: '#a7a5a5',
  },
});
