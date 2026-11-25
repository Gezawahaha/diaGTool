import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Dashboard: undefined;
  Scanner: undefined;
  DeviceDetail: { deviceId: string };
  Sessions: undefined;
  SessionDetail: { sessionId: string };
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;
