import type { TokenPair } from "./api/apiClient";

const AUTH_SESSION_KEY = "psy-auto-ast.auth-session";

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
};

type AuthStorageDriver = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

function parseSession(value: string | null): AuthSession | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<AuthSession>;
    if (typeof parsed.accessToken !== "string" || typeof parsed.refreshToken !== "string") {
      return null;
    }
    if (!parsed.accessToken || !parsed.refreshToken) return null;
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
    };
  } catch {
    return null;
  }
}

export function createAuthSessionStore(driver: AuthStorageDriver) {
  return {
    async load(): Promise<AuthSession | null> {
      const raw = await driver.get(AUTH_SESSION_KEY);
      const session = parseSession(raw);
      if (!session && raw) await driver.remove(AUTH_SESSION_KEY);
      return session;
    },
    async save(tokens: TokenPair | AuthSession): Promise<void> {
      const session: AuthSession = "access_token" in tokens
        ? {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
          }
        : tokens;
      await driver.set(AUTH_SESSION_KEY, JSON.stringify(session));
    },
    clear: () => driver.remove(AUTH_SESSION_KEY),
  };
}
