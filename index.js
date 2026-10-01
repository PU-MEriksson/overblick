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

// A finger tap on a box in the note ticks its todo. Here rather than in a
// component so it works while the plugin view is closed. Must stay the only
// motion listener: see the comment in boxTap.ts.
startBoxTaps();

PluginManager.registerButton(1, ['NOTE', 'DOC'], {
  id: 100,
  name: 'Överblick',
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
