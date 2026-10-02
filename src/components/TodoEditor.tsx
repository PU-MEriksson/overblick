import React, {useState} from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import type {Horizon, TodoItem} from '../types';

type Props = {
  todo: TodoItem;
  onCancel: () => void;
  // Called once, on save — not on every keystroke. The draft below is why.
  onSave: (text: string, horizon: Horizon | null) => void;
};

// The choices under "When", in order. null is the Inbox: not sorted yet.
const HORIZON_OPTIONS: {value: Horizon | null; label: string}[] = [
  {value: null, label: 'Inbox'},
  {value: 'day', label: 'Today'},
  {value: 'week', label: 'Week'},
  {value: 'month', label: 'Month'},
  {value: 'future', label: 'Future'},
];

/**
 * The edit dialog. Rendered only while a todo is being edited, which is what
 * seeds the draft: mounting runs `useState(todo.text)` with the right value, so
 * there's no effect syncing a prop into state. Closing unmounts it and the
 * half-typed draft goes with it — nothing was committed.
 */
export function TodoEditor({
  todo,
  onCancel,
  onSave,
}: Props): React.JSX.Element {
  const [draft, setDraft] = useState(todo.text);
  const [horizon, setHorizon] = useState(todo.horizon);
  const {width: windowWidth, height: windowHeight} = useWindowDimensions();

  const save = () => {
    // Refuse to save an empty todo: it would leave a blank row with nothing to
    // long-press, and no way back to fix it. Trim also clears the trailing
    // space the keyboard tends to leave behind.
    const trimmed = draft.trim();
    if (trimmed === '') {
      onCancel();
      return;
    }
    onSave(trimmed, horizon);
  };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onCancel}>
      <View
        style={[
          styles.modalBackdrop,
          {width: windowWidth, height: windowHeight},
        ]}>
        <View style={styles.modalCard}>
          <Text style={styles.modalHeading}>EDIT TODO</Text>
          <TextInput
            style={styles.modalTextInput}
            value={draft}
            onChangeText={setDraft}
            multiline
          />

          <Text style={styles.modalHeading}>WHEN</Text>
          <View style={styles.horizonRow}>
            {HORIZON_OPTIONS.map(option => {
              const selected = option.value === horizon;
              return (
                <Pressable
                  key={option.label}
                  style={[styles.horizonButton, selected && styles.selected]}
                  onPress={() => setHorizon(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{selected}}>
                  <Text
                    style={[
                      styles.modalButtonText,
                      selected && styles.modalButtonTextPrimary,
                    ]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.modalButtonRow}>
            <Pressable style={styles.modalButton} onPress={onCancel}>
              <Text style={styles.modalButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalButton, styles.modalButtonPrimary]}
              onPress={save}>
              <Text
                style={[styles.modalButtonText, styles.modalButtonTextPrimary]}>
                Save
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    color: '#000000',
  },
  modalTextInput: {
    fontSize: 20,
    color: '#000000',
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
  horizonRow: {
    flexDirection: 'row',
    // Wraps to a second line rather than squeezing, if the screen is narrow.
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  horizonButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: '#000000',
  },
  // The chosen horizon is filled black, like the Save button: no colour needed.
  selected: {
    backgroundColor: '#000000',
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalButton: {
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
    color: '#000000',
  },
  modalButtonTextPrimary: {
    // White, because it sits on the black primary button.
    color: '#ffffff',
  },
});
