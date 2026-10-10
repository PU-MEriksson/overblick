import {Pressable, StyleSheet, Text, View} from 'react-native';
import {VIEWS} from '../todos/horizon';
import type {View as ListView} from '../todos/horizon';

type Props = {
  view: ListView;
  onChange: (view: ListView) => void;
};

type Option = (typeof VIEWS)[number];

// Four groups: Inbox (to sort), Upcoming (the overview), the time horizons
// (the journal's logs), and the Logbook (done).
const inbox = VIEWS.filter(option => option.view === 'inbox');
const upcoming = VIEWS.filter(option => option.view === 'upcoming');
const logbook = VIEWS.filter(option => option.view === 'logbook');
const timeViews = VIEWS.filter(
  option =>
    option.view !== 'inbox' &&
    option.view !== 'upcoming' &&
    option.view !== 'logbook',
);

/**
 * The views, down the left side. Shown and hidden by the header's ☰ button.
 * The chosen view is filled black: no colour needed.
 */
export function Sidebar({view, onChange}: Props): React.JSX.Element {
  const renderItem = (option: Option) => {
    const selected = option.view === view;
    return (
      <Pressable
        key={option.view}
        style={[styles.item, selected && styles.itemSelected]}
        onPress={() => onChange(option.view)}
        accessibilityRole="tab"
        accessibilityState={{selected}}>
        <Text style={[styles.itemText, selected && styles.itemTextSelected]}>
          {option.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.sidebar}>
      {inbox.map(renderItem)}
      <View style={styles.divider} />
      {upcoming.map(renderItem)}
      <View style={styles.divider} />
      {timeViews.map(renderItem)}
      {/* Takes the leftover height, pushing the Logbook to the bottom. */}
      <View style={styles.spacer} />
      {logbook.map(renderItem)}
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
  divider: {
    height: 1,
    backgroundColor: '#000000',
    marginHorizontal: 16,
    marginVertical: 8,
  },
  spacer: {
    flex: 1,
  },
});
