import {Pressable, StyleSheet, Text, View} from 'react-native';
import {VIEWS} from '../todos/horizon';
import type {View as ListView} from '../todos/horizon';

type Props = {
  view: ListView;
  onChange: (view: ListView) => void;
};

/**
 * The views, down the left side. Shown and hidden by the header's ☰ button.
 * The chosen view is filled black: no colour needed.
 */
export function Sidebar({view, onChange}: Props): React.JSX.Element {
  return (
    <View style={styles.sidebar}>
      {VIEWS.map(option => {
        const selected = option.view === view;
        return (
          <Pressable
            key={option.view}
            style={[styles.item, selected && styles.itemSelected]}
            onPress={() => onChange(option.view)}
            accessibilityRole="tab"
            accessibilityState={{selected}}>
            <Text
              style={[styles.itemText, selected && styles.itemTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 180,
    borderRightWidth: 2,
    borderRightColor: '#000000',
  },
  item: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  itemSelected: {
    backgroundColor: '#000000',
  },
  itemText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
  },
  itemTextSelected: {
    color: '#ffffff',
  },
});
