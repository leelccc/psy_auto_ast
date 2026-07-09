export type FetchLike = typeof fetch;
export type RequestOptions = {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  deduplicate?: boolean;
};

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function configuredBaseUrl(): string {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return runtime.process?.env?.EXPO_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";
}

export class ApiClient {
  private accessToken: string;
  private refreshToken: string | null = null;
  private profileAccessGrant: string | null = null;
  private tokenChangeHandler: ((accessToken: string, refreshToken: string | null) => void) | null = null;
  private readonly pendingGets = new Map<string, Promise<unknown>>();

  constructor(
    private readonly baseUrl = configuredBaseUrl(),
    private readonly fetchImpl: FetchLike = fetch,
    accessToken = "demo-token",
  ) {
    this.accessToken = accessToken;
  }

  setTokens(accessToken: string, refreshToken: string | null): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.tokenChangeHandler?.(accessToken, refreshToken);
  }

  setTokenChangeHandler(
    handler: ((accessToken: string, refreshToken: string | null) => void) | null,
  ): void {
    this.tokenChangeHandler = handler;
  }

  setProfileAccessGrant(grant: string | null): void {
    this.profileAccessGrant = grant;
  }

  get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const deduplicate = options.deduplicate ?? true;
    const key = `${path}:${this.profileAccessGrant ?? ""}`;
    if (deduplicate) {
      const pending = this.pendingGets.get(key);
      if (pending) return pending as Promise<T>;
    }
    const request = this.request<T>(path, {
      headers: options.headers,
      signal: options.signal,
    }).finally(() => this.pendingGets.delete(key));
    if (deduplicate) this.pendingGets.set(key, request);
    return request;
  }

  post<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: options.headers,
      signal: options.signal,
    });
  }

  patch<T>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: options.headers,
      signal: options.signal,
    });
  }

  put<T>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(path, {
      method: "PUT",
      body: JSON.stringify(body),
      headers: options.headers,
      signal: options.signal,
    });
  }

  delete<T>(path: string, body?: unknown, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(path, {
      method: "DELETE",
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: options.headers,
      signal: options.signal,
    });
  }

  private async request<T>(path: string, init: RequestInit = {}, canRefresh = true): Promise<T> {
    let response: Response;
    try {
      const fetchRequest = this.fetchImpl;
      response = await fetchRequest(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          ...(this.profileAccessGrant ? { "X-Profile-Access-Grant": this.profileAccessGrant } : {}),
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
      });
    } catch (error) {
      if (typeof console !== "undefined") {
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`API request could not reach ${this.baseUrl}${path}: ${reason}`);
      }
      throw new ApiError(0, "network_error", "无法连接服务器，请检查网络后重试。");
    }
    if (
      response.status === 401
      && canRefresh
      && this.refreshToken
      && path !== "/auth/refresh"
    ) {
      const refreshed = await this.refreshTokens();
      if (refreshed) return this.request<T>(path, init, false);
    }
    const text = await response.text();
    let payload: T | ApiErrorBody = {} as T;
    if (text) {
      try {
        payload = JSON.parse(text) as T | ApiErrorBody;
      } catch {
        if (!response.ok) {
          throw new ApiError(response.status, "request_failed", "服务暂不可用，请稍后重试。");
        }
        throw new ApiError(response.status, "invalid_response", "服务器返回了无法识别的数据。");
      }
    }
    if (!response.ok) {
      const error = payload as ApiErrorBody;
      throw new ApiError(
        response.status,
        error.error?.code ?? "request_failed",
        error.error?.message ?? "请求失败，请稍后重试。",
      );
    }
    return payload as T;
  }

  private async refreshTokens(): Promise<boolean> {
    try {
      const fetchRequest = this.fetchImpl;
      const response = await fetchRequest(`${this.baseUrl}/auth/refresh`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: this.refreshToken }),
      });
      if (!response.ok) return false;
      const tokens = await response.json() as TokenPair;
      this.setTokens(tokens.access_token, tokens.refresh_token);
      return true;
    } catch {
      return false;
    }
  }
}
