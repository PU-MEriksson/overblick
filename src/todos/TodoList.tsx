import React, {useState} from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import type {TodoItem} from '../types';

type Props = {
  todos: TodoItem[];
  textColor: {color: string};
  onToggle: (id: string) => void;
  // Takes the whole todo, not just its id: deleting has to clean up the todo's
  // `.sticker` file, and the path to it lives on the item.
  onDelete: (todo: TodoItem) => void;
  // Called once, on save — not on every keystroke. See `draft` below for why.
  onUpdateText: (id: string, text: string) => void;
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
  onDelete,
  onUpdateText,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingTodo = todos.find(todo => todo.id === editingId) ?? null;
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();
  const [draft, setDraft] = useState('');
  // Selection mode: which todo the action bar is acting on, or null for no bar.
  // Kept separate from `editingId` — selecting a row and editing one are two
  // different states, and the bar has to stay up while the editor is closed.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedTodo = todos.find(todo => todo.id === selectedId) ?? null;

  const clearSelection = () => {
    setSelectedId(null);
  };

  const editSelected = () => {
    if (selectedTodo) {
      openEditor(selectedTodo);
    }
    setSelectedId(null);
  };

  const deleteSelected = () => {
    if (selectedTodo) {
      onDelete(selectedTodo);
    }
    setSelectedId(null);
  };

  const openEditor = (todo: TodoItem) => {
    setEditingId(todo.id);
    // Seed the draft from the todo. Forget this and the field opens empty.
    setDraft(todo.text);
  };

  const closeEditor = () => {
    // The draft is simply abandoned; nothing was committed.
    setEditingId(null);
  };

  const saveEditor = () => {
    // Refuse to save an empty todo: it would leave a blank row with nothing to
    // long-press, and no way back to fix it. Trim also clears the trailing
    // space the keyboard tends to leave behind.
    const trimmed = draft.trim();
    if (editingId !== null && trimmed !== '') {
      onUpdateText(editingId, trimmed);
    }
    setEditingId(null);
  };

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
      {/*
        Contextual action bar — Android's selection-mode pattern, and what
        Supernote's own apps use, so the gesture is already familiar. Rendered
        inline above the list rather than as an overlay: it's a plain View, so
        showing it changes one strip of the screen instead of opening a second
        native window the way the Modal below does.

        It pushes the list down rather than covering it. On a screen that
        repaints this slowly, a layout shift is cheaper to read than a floating
        layer, and nothing is hidden behind it.
      */}
      {selectedTodo !== null && (
        <View style={styles.actionBar}>
          <Pressable
            onPress={clearSelection}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Clear selection">
            <Text style={[styles.actionBarClose, textColor]}>✕</Text>
          </Pressable>
          {/*
            Names the selected todo, because it can be scrolled out of sight
            while the bar stays up. One line, ellipsised — the bar must not grow.
          */}
          <Text
            style={[styles.actionBarLabel, textColor]}
            numberOfLines={1}
            ellipsizeMode="tail">
            {selectedTodo.text}
          </Text>
          <Pressable
            style={styles.actionBarButton}
            onPress={editSelected}
            accessibilityRole="button">
            <Text style={[styles.actionBarButtonText, textColor]}>Edit</Text>
          </Pressable>
          <Pressable
            style={styles.actionBarButton}
            onPress={deleteSelected}
            accessibilityRole="button">
            <Text style={[styles.actionBarButtonText, textColor]}>Delete</Text>
          </Pressable>
        </View>
      )}
      <FlatList
        style={styles.list}
        data={todos}
        keyExtractor={item => item.id}
        renderItem={({item}) => (
          <View
            style={[
              styles.row,
              item.id === selectedId && styles.rowSelected,
            ]}>
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
              // the same gesture that opens the bar also dismisses it.
              onLongPress={() =>
                setSelectedId(prev => (prev === item.id ? null : item.id))
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

      <Modal
        visible={editingTodo !== null}
        transparent
        animationType="none"
        onRequestClose={closeEditor}>
        <View
          style={[
            styles.modalBackdrop,
            {width: windowWidth, height: windowHeight},
          ]}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalHeading, textColor]}>EDIT TODO</Text>
            <TextInput
              style={[styles.modalTextInput, textColor]}
              value={draft}
              onChangeText={setDraft}
              multiline
            />

            <View style={styles.modalButtonRow}>
              <Pressable style={styles.modalButton} onPress={closeEditor}>
                <Text style={[styles.modalButtonText, textColor]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={saveEditor}>
                <Text
                  style={[
                    styles.modalButtonText,
                    styles.modalButtonTextPrimary,
                  ]}>
                  Save
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
  list: {
    flex: 1,
    width: '100%',
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    // A solid rule under the bar separates it from the list without a fill.
    // Inverting the whole bar to black would read strongly but lays down a lot
    // of ink — slow to refresh, and prone to ghosting once it's dismissed.
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
  },
  actionBarClose: {
    fontSize: 20,
    fontWeight: '600',
  },
  actionBarLabel: {
    // Takes the space the buttons don't, so the buttons keep their full size
    // and it's the label that gets ellipsised on a long todo.
    flex: 1,
    fontSize: 15,
    fontStyle: 'italic',
  },
  actionBarButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: '#000000',
  },
  actionBarButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#cccccc',
    // The selection marker, transparent until a row is selected. Declared on
    // every row so selecting one doesn't change its width and shuffle the text.
    borderLeftWidth: 6,
    borderLeftColor: 'transparent',
  },
  rowSelected: {
    // A bar down the edge rather than an inverted row: it's unmistakable at
    // 1-bit, and it inks a few pixels instead of the whole line.
    borderLeftColor: '#000000',
  },
  toggleArea: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  textArea: {
    // Claims every pixel the checkbox and the trash button don't, so a press
    // anywhere along the line still toggles and a long press anywhere along it
    // opens the editor — a far easier target than the checkbox alone on a
    // device this size.
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 12,
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
  modalBackdrop: {
    // No `flex: 1` — the width and height come in from `useWindowDimensions`
    // at the call site. See the comment on that hook for why.
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  modalCard: {
    width: '100%',
    padding: 24,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#000000',
  },
  modalHeading: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 12,
  },
  modalTextInput: {
    fontSize: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#000000',
    paddingHorizontal: 8,
    paddingVertical: 4,
    // Room for a couple of lines up front, so a long OCR'd todo doesn't open
    // as a one-line field that grows under the user as they edit.
    minHeight: 96,
    // Android centres multiline text vertically by default; this puts the
    // cursor at the top where it belongs.
    textAlignVertical: 'top',
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalButton: {
    // `alignSelf` dropped — the row now handles placement, and leaving it here
    // would fight the row's own alignment.
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: '#000000',
  },
  modalButtonPrimary: {
    backgroundColor: '#000000',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonTextPrimary: {
    // Set here rather than taking `textColor` from props: this text sits on
    // black, so it has to be white regardless of the app's text colour.
    color: '#ffffff',
  },
});
