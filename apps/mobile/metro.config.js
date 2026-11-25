const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const sharedPackage = path.resolve(__dirname, '../../packages/shared');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @axs/shared is symlinked from the monorepo as TypeScript source, so Metro
 * must watch it and resolve its imports from this app's node_modules.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [sharedPackage],
  resolver: {
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
