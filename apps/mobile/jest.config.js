module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['./jest.setup.js'],
  // Transform TypeScript from the linked @axs/shared package as well as the
  // React Native packages the preset already handles.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation|@axs/shared)/)',
  ],
};
