import {Pressable, StyleSheet, Text, View} from 'react-native';
import {VIEWS} from '../todos/horizon';
import type {View as ListView} from '../todos/horizon';

type Props = {
  view: ListView;
  onChange: (view: ListView) => void;
};

/**
 * One tab per view, under the header. The chosen one is filled black, like
 * the editor's chosen buttons: no colour needed. A stand-in for the sidebar
 * the vision describes.
 */
export function ViewTabs({view, onChange}: Props): React.JSX.Element {
  return (
    <View style={styles.tabs}>
      {VIEWS.map(option => {
        const selected = option.view === view;
        return (
          <Pressable
            key={option.view}
            style={[styles.tab, selected && styles.tabSelected]}
            onPress={() => onChange(option.view)}
            accessibilityRole="tab"
            accessibilityState={{selected}}>
            <Text style={[styles.tabText, selected && styles.tabTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#000000',
  },
  tab: {
    // Every tab gets an equal share of the width.
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  tabSelected: {
    backgroundColor: '#000000',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  tabTextSelected: {
    color: '#ffffff',
  },
});
