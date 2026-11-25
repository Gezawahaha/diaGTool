/* global jest */
// SafeAreaProvider renders nothing until native window metrics arrive,
// which never happens under Jest. Use the library's official mock.
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
