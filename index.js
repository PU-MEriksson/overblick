/**
 * @format
 */

import {AppRegistry, Image} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

import {PluginManager} from 'sn-plugin-lib';
import {startBoxTaps} from './src/note/boxTap';
AppRegistry.registerComponent(appName, () => App);

PluginManager.init();

// A finger tap, pen tap or pen tick on a box in the note ticks its todo. Here
// rather than in a component so it works while the plugin view is closed. Must
// stay the only motion and pen-up listeners: see the comment in boxTap.ts.
// Skipped in the `yarn android` dev loop: with no plugin host to register
// with, the native side crashes. Plugin packages are built with `__DEV__` false.
if (!__DEV__) {
  startBoxTaps();
}

PluginManager.registerButton(1, ['NOTE', 'DOC'], {
  id: 100,
  name: 'Open Överblick',
  icon: Image.resolveAssetSource(require('./assets/mountain.png')).uri,
  showType: 1,
});

// Opens straight into the Add to page screen (App.tsx), for the page that's open.
PluginManager.registerButton(1, ['NOTE', 'DOC'], {
  id: 400,
  name: 'Import from Överblick',
  icon: Image.resolveAssetSource(require('./assets/mountain.png')).uri,
  showType: 1,
});

PluginManager.registerButton(2, ['NOTE', 'DOC'], {
  id: 200,
  name: 'Add to överblick',
  icon: Image.resolveAssetSource(require('./assets/mountain_edit.png')).uri,
  editDataTypes: [0, 1, 2, 3, 4],
  showType: 1,
});

PluginManager.registerButton(3, ['NOTE', 'DOC'], {
  id: 300,
  name: 'Add to överblick',
  icon: Image.resolveAssetSource(require('./assets/mountain.png')).uri,
  showType: 1,
});
