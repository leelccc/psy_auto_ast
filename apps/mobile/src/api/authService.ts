import { ApiClient, type TokenPair } from "./apiClient";

export type CurrentUser = {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
  updated_at: string;
};

export type VerificationCodeResult = {
  sent: boolean;
  dev_code?: string;
  expire_seconds: number;
  retry_seconds: number;
};

export function createAuthService(client: ApiClient) {
  const applyTokens = (tokens: TokenPair) => {
    client.setTokens(tokens.access_token, tokens.refresh_token);
    return tokens;
  };
  return {
    async register(input: { email: string; password: string; displayName: string; code: string }) {
      return applyTokens(await client.post<TokenPair>("/auth/register", {
        email: input.email,
        password: input.password,
        display_name: input.displayName,
        code: input.code,
      }));
    },
    async login(email: string, password: string) {
      return applyTokens(await client.post<TokenPair>("/auth/login", { email, password }));
    },
    sendCode: (email: string, purpose: "register" | "reset_password") =>
      client.post<VerificationCodeResult>("/auth/verification-code", { email, purpose }),
    async resetPassword(email: string, code: string, newPassword: string) {
      return applyTokens(await client.post<TokenPair>("/auth/reset-password", {
        email,
        code,
        new_password: newPassword,
      }));
    },
    async loginWithWechatMobile(code: string) {
      const result = await client.post<TokenPair & { user: CurrentUser }>("/auth/wechat/mobile", { code });
      client.setTokens(result.access_token, result.refresh_token);
      return result;
    },
    me: () => client.get<CurrentUser>("/me"),
    updateMe: (displayName: string) => client.patch<CurrentUser>("/me", { display_name: displayName }),
    async logout(refreshToken: string) {
      const result = await client.post<{ logged_out: true }>("/auth/logout", { refresh_token: refreshToken });
      client.setTokens("demo-token", null);
      client.setProfileAccessGrant(null);
      return result;
    },
    deleteAccount: (password: string) => client.post<{ deleted: true }>("/account/deletion", {
      password,
      confirmation_text: "注销账号",
    }),
  };
}
