import React from 'react';
import {FlatList, StyleSheet, Text, View} from 'react-native';
import type {TodoItem} from '../types';

type Props = {
  todos: TodoItem[];
  textColor: {color: string};
};

export function TodoList({todos, textColor}: Props) {
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
        <View style={styles.row}>
          <Text style={[styles.rowText, textColor]}>{item.text}</Text>
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
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#cccccc',
  },
  rowText: {
    fontSize: 18,
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
