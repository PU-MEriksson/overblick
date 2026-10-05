import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import type {TodoItem} from '../types';
//import {HEADER_SLOT_HEIGHT} from './headerSlot';

type Props = {
  todo: TodoItem;
  onClear: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToPage: () => void;
};

/**
 * Contextual action bar — Android's selection-mode pattern, and what
 * Supernote's own apps use, so the gesture is already familiar.
 *
 * It takes the header's place rather than pushing it down: both are the same
 * fixed height and only one is mounted, so entering selection mode repaints one
 * strip of the screen and leaves every row exactly where it was. On a display
 * this slow, a layout shift is the expensive part.
 */
export function ActionBar({
  //todo,
  onClear,
  onEdit,
  onDelete,
  onToPage,
}: Props): React.JSX.Element {
  return (
    <View style={styles.actionBar}>
      <Pressable
        onPress={onClear}
        accessibilityRole="button"
        accessibilityLabel="Clear selection"
        style={styles.actionBarButton}>
        <Image source={require('../../assets/cross.png')} style={styles.icon} />
        <Text style={styles.actionBarButtonText}>Cancel</Text>
      </Pressable>
      {/*
        Names the selected todo, because it can be scrolled out of sight while
        the bar stays up. One line, ellipsised — the bar must not grow.
      */}
      {/* <Text
        style={styles.actionBarLabel}
        numberOfLines={1}
        ellipsizeMode="tail">
        {todo.text}
      </Text> */}
      <Pressable
        style={styles.actionBarButton}
        onPress={onEdit}
        accessibilityRole="button">
        <Image source={require('../../assets/edit.png')} style={styles.icon} />
        <Text style={styles.actionBarButtonText}>Edit</Text>
      </Pressable>
      {/* Temporary, to try importing one todo before the import screen exists. */}
      <Pressable
        style={styles.actionBarButton}
        onPress={onToPage}
        accessibilityRole="button">
        <Image
          source={require('../../assets/mountain.png')}
          style={styles.icon}
        />
        <Text style={styles.actionBarButtonText}>To page</Text>
      </Pressable>
      <Pressable
        style={styles.actionBarButton}
        onPress={onDelete}
        accessibilityRole="button">
        <Image source={require('../../assets/trash.png')} style={styles.icon} />
        <Text style={styles.actionBarButtonText}>Delete</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  actionBar: {
    height: 64, // Same as the header, so it can replace it without moving anything below.
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 24,
    backgroundColor: '#000000',
  },

  actionBarClose: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
  },
  // actionBarLabel: {
  //   flex: 1,
  //   fontSize: 15,
  //   fontStyle: 'italic',
  //   color: '#ffffff',
  // },
  actionBarButton: {
    paddingTop: 4,
    gap: 2,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBarButtonText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#ffffff',
  },
  icon: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
    tintColor: '#ffffff',
  },
});
