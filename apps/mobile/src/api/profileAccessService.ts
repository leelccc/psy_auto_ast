import type { ArchiveKind } from "../archiveFlow";
import { ApiClient } from "./apiClient";

export type ProfileAccessStatus = {
  profile_type: ArchiveKind;
  is_set: boolean;
};

export type ProfileAccessStatusResponse = {
  items: ProfileAccessStatus[];
  grantMinutes: number;
  grantOptions: number[];
};

export function createProfileAccessService(client: ApiClient) {
  let currentGrantExpiresAt = 0;
  let currentGrantProfileType: ArchiveKind | null = null;

  return {
    hasActiveGrant(profileType?: ArchiveKind): boolean {
      if (Date.now() >= currentGrantExpiresAt) {
        currentGrantExpiresAt = 0;
        currentGrantProfileType = null;
        client.setProfileAccessGrant(null);
        return false;
      }
      return profileType ? currentGrantProfileType === profileType : true;
    },
    async statuses(): Promise<ProfileAccessStatusResponse> {
      const response = await client.get<{
        items: ProfileAccessStatus[];
        grant_minutes: number;
        grant_options: number[];
      }>("/profile-access-passwords");
      return {
        items: response.items,
        grantMinutes: response.grant_minutes,
        grantOptions: response.grant_options,
      };
    },
    async updateSettings(input: { grantMinutes: number }): Promise<{
      grantMinutes: number;
      grantOptions: number[];
    }> {
      const response = await client.patch<{
        grant_minutes: number;
        grant_options: number[];
      }>("/profile-access-passwords/settings", {
        grant_minutes: input.grantMinutes,
      });
      return {
        grantMinutes: response.grant_minutes,
        grantOptions: response.grant_options,
      };
    },
    setPassword(profileType: ArchiveKind, password: string) {
      return client.put<{ profile_type: ArchiveKind; is_set: true }>(
        `/profile-access-passwords/${profileType}`,
        { new_password: password },
      );
    },
    async verify(profileType: ArchiveKind, password: string): Promise<string> {
      const response = await client.post<{
        profile_access_grant: string;
        expires_in_seconds: number;
      }>(`/profile-access-passwords/${profileType}/verify`, { password });
      currentGrantExpiresAt = Date.now() + response.expires_in_seconds * 1000;
      currentGrantProfileType = profileType;
      client.setProfileAccessGrant(response.profile_access_grant);
      return response.profile_access_grant;
    },
    leaveProfile(): void {
      if (Date.now() < currentGrantExpiresAt) return;
      client.setProfileAccessGrant(null);
    },
    clearGrants(): void {
      currentGrantExpiresAt = 0;
      currentGrantProfileType = null;
      client.setProfileAccessGrant(null);
    },
  };
}
