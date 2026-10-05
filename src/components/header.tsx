import {
  Pressable,
  StyleSheet,
  Text,
  View,
  Image,
  type ImageSourcePropType,
} from 'react-native';

type Props = {
  title?: string;
  icon?: ImageSourcePropType | null;
  onClose?: () => void;
  // Opens the screen for adding todos to the page open in the note.
  onAddToPage?: () => void;
};

const mountainIcon = require('../../assets/mountain.png');

export function Header({
  title = 'Överblick',
  icon = mountainIcon,
  onClose,
  onAddToPage,
}: Props): React.JSX.Element {
  return (
    <View style={styles.header}>
      {onAddToPage && (
        <Pressable style={styles.addButton} onPress={onAddToPage}>
          <Text style={styles.closeButtonText}>Add to page</Text>
        </Pressable>
      )}
      <View style={styles.titleContainer}>
        <Text style={styles.title}>{title}</Text>
        {icon ? (
          <Image
            source={icon}
            style={styles.icon}
            accessibilityLabel={`${title} icon`}
          />
        ) : null}
      </View>
      <Pressable style={styles.closeButton} onPress={onClose}>
        <Text style={styles.closeButtonText}>Close</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },

  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },

  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },

  icon: {
    width: 32,
    height: 32,
    resizeMode: 'contain',
  },

  addButton: {
    position: 'absolute',
    left: 16,
    padding: 8,
  },

  closeButton: {
    position: 'absolute',
    right: 16,
    padding: 8,
  },

  closeButtonText: {
    fontSize: 16,
  },
});
