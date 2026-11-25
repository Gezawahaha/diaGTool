import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useBleBootstrap } from '../hooks/useBleBootstrap';
import { useStorageBootstrap } from '../hooks/useStorageBootstrap';
import { RootNavigator } from '../navigation/RootNavigator';

export default function App() {
  useBleBootstrap();
  useStorageBootstrap();
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <RootNavigator />
    </SafeAreaProvider>
  );
}
