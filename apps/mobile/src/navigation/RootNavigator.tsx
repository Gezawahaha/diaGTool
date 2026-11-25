import { DarkTheme, NavigationContainer, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../app/theme';
import { DashboardScreen } from '../screens/DashboardScreen';
import { DeviceDetailScreen } from '../screens/DeviceDetailScreen';
import { ScannerScreen } from '../screens/ScannerScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const theme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.background,
    border: colors.cardBorder,
    text: colors.textPrimary,
  },
};

export function RootNavigator() {
  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator>
        <Stack.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen name="Scanner" component={ScannerScreen} options={{ title: 'Scanner' }} />
        <Stack.Screen
          name="DeviceDetail"
          component={DeviceDetailScreen}
          options={{ title: 'Device' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
