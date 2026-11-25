/** Persistent storage for the refresh token. */
export interface TokenStore {
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string): Promise<void>;
  clear(): Promise<void>;
}

const SERVICE = 'axs-diagnostic-lab.refresh-token';

/**
 * Android Keystore-backed storage (AES-GCM) via react-native-keychain
 * (PROJECT.md §10). The refresh token never touches SQLite or logs.
 */
export function createKeychainTokenStore(): TokenStore {
  // Required lazily so Jest never loads the native module.
  const Keychain = require('react-native-keychain') as typeof import('react-native-keychain');
  return {
    async getRefreshToken() {
      const creds = await Keychain.getGenericPassword({ service: SERVICE });
      return creds ? creds.password : null;
    },
    async setRefreshToken(token) {
      const ok = await Keychain.setGenericPassword('refresh', token, {
        service: SERVICE,
        storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      if (!ok) {
        throw new Error('Could not save the sign-in to secure storage.');
      }
    },
    async clear() {
      await Keychain.resetGenericPassword({ service: SERVICE });
    },
  };
}
