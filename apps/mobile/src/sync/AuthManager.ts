import type { TokenResponse } from '@axs/shared';
import { ApiRequestError, type APIClient } from './APIClient';
import type { TokenStore } from './TokenStore';

/** Refresh this long before expiry so requests never carry a dying token. */
const EXPIRY_MARGIN_MS = 60_000;

type Listener = (signedIn: boolean) => void;

/**
 * Owns the sign-in. The access token is kept in memory only; the refresh
 * token is kept in the Keystore. Refreshes are single-flight: the server
 * treats reuse of a rotated refresh token as theft and revokes the sign-in,
 * so two concurrent refreshes must never happen.
 */
export class AuthManager {
  private accessToken: string | null = null;
  private accessExpiresAt = 0;
  private refreshing: Promise<string> | null = null;
  private signedIn = false;
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly api: APIClient,
    private readonly store: TokenStore,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Restore sign-in state from secure storage at startup. */
  async init(): Promise<boolean> {
    this.setSignedIn((await this.store.getRefreshToken()) !== null);
    return this.signedIn;
  }

  isSignedIn(): boolean {
    return this.signedIn;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async login(email: string, password: string, deviceLabel: string): Promise<void> {
    const tokens = await this.api.request<TokenResponse>('POST', '/auth/login', {
      body: { email, password, device_label: deviceLabel },
    });
    await this.accept(tokens);
  }

  /** A valid access token, refreshing it first if needed. */
  async getAccessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.accessToken && this.now() < this.accessExpiresAt - EXPIRY_MARGIN_MS) {
      return this.accessToken;
    }
    this.refreshing ??= this.refresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  async logout(): Promise<void> {
    const refreshToken = await this.store.getRefreshToken();
    this.clearMemory();
    await this.store.clear();
    this.setSignedIn(false);
    if (refreshToken) {
      // Best effort: the local sign-in is already gone either way.
      await this.api
        .request('POST', '/auth/logout', { body: { refresh_token: refreshToken } })
        .catch(() => undefined);
    }
  }

  private async refresh(): Promise<string> {
    const refreshToken = await this.store.getRefreshToken();
    if (!refreshToken) {
      this.setSignedIn(false);
      throw new ApiRequestError('Not signed in.', null, 'SIGNED_OUT', false);
    }
    try {
      const tokens = await this.api.request<TokenResponse>('POST', '/auth/refresh', {
        body: { refresh_token: refreshToken },
      });
      await this.accept(tokens);
      return tokens.access_token;
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        // Expired or revoked: the user must sign in again.
        this.clearMemory();
        await this.store.clear();
        this.setSignedIn(false);
        throw new ApiRequestError('Signed out. Please sign in again.', 401, 'SIGNED_OUT', false);
      }
      throw err;
    }
  }

  private async accept(tokens: TokenResponse): Promise<void> {
    await this.store.setRefreshToken(tokens.refresh_token);
    this.accessToken = tokens.access_token;
    this.accessExpiresAt = this.now() + tokens.expires_in * 1000;
    this.setSignedIn(true);
  }

  private clearMemory(): void {
    this.accessToken = null;
    this.accessExpiresAt = 0;
  }

  private setSignedIn(value: boolean): void {
    if (this.signedIn !== value) {
      this.signedIn = value;
      for (const listener of this.listeners) {
        listener(value);
      }
    }
  }
}
