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
  // The sidebar button, top left. No `onMenu`, no button.
  onMenu?: () => void;
  // Shown beside ☰, e.g. the current view while the sidebar is hidden.
  menuLabel?: string;
};

const mountainIcon = require('../../assets/mountain.png');

export function Header({
  title = 'Överblick',
  icon = mountainIcon,
  onClose,
  onMenu,
}: //menuLabel = '',
Props): React.JSX.Element {
  return (
    <View style={styles.header}>
      {onMenu ? (
        <Pressable
          style={styles.menuButton}
          onPress={onMenu}
          accessibilityLabel="Show or hide views">
          <Text style={styles.menuIcon}>☰</Text>
          {/* {menuLabel !== '' && (
            <Text style={styles.menuLabel}>{menuLabel}</Text>
          )} */}
        </Pressable>
      ) : null}
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

  // Absolute, like Close, so the title stays centred whatever the label says.
  menuButton: {
    position: 'absolute',
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 8,
  },

  menuIcon: {
    fontSize: 28,
    color: '#000',
  },

  menuLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
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
