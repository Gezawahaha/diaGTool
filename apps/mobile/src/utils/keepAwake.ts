import { NativeModules } from 'react-native';

interface KeepAwakeModule {
  activate(): void;
  deactivate(): void;
}

// Android-only module in MainApplication (KeepAwakeModule.kt); absent in tests.
const native = NativeModules.KeepAwake as KeepAwakeModule | undefined;

/** Keep the screen on (and the app in the foreground) while `on` is true. */
export function setKeepAwake(on: boolean): void {
  if (on) {
    native?.activate();
  } else {
    native?.deactivate();
  }
}
