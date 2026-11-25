export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
}

export interface AppVariables {
  requestId: string;
}

export interface AppBindings {
  Bindings: Env;
  Variables: AppVariables;
}
