export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  /** HMAC key for access tokens; a Worker secret, never in source control. */
  TOKEN_SIGNING_SECRET: string;
}

export interface AppVariables {
  requestId: string;
  /** Set by requireAuth for authenticated routes. */
  userId: string;
}

export interface AppBindings {
  Bindings: Env;
  Variables: AppVariables;
}
