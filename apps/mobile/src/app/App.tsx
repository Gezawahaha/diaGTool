import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useBleBootstrap } from '../hooks/useBleBootstrap';
import { RootNavigator } from '../navigation/RootNavigator';

export default function App() {
  useBleBootstrap();
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <RootNavigator />
    </SafeAreaProvider>
  );
}
