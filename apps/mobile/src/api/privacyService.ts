import { ApiClient } from "./apiClient";


export type SensitiveResource = {
  id: string;
  resourceType: string;
  resourceId: string;
  displayName: string;
  ownerType: string | null;
  ownerId: string | null;
  originAt: string;
  expiresAt: string;
  canLongTermPreserve: boolean;
  longTermAuthorizedAt: string | null;
  longTermRevokedAt: string | null;
  destroyedAt: string | null;
};

type BackendSensitiveResource = {
  id: string;
  resource_type: string;
  resource_id: string;
  display_name: string;
  owner_type: string | null;
  owner_id: string | null;
  origin_at: string;
  expires_at: string;
  can_long_term_preserve: boolean;
  long_term_authorized_at: string | null;
  long_term_revoked_at: string | null;
  destroyed_at: string | null;
};

function mapResource(item: BackendSensitiveResource): SensitiveResource {
  return {
    id: item.id,
    resourceType: item.resource_type,
    resourceId: item.resource_id,
    displayName: item.display_name,
    ownerType: item.owner_type,
    ownerId: item.owner_id,
    originAt: item.origin_at,
    expiresAt: item.expires_at,
    canLongTermPreserve: item.can_long_term_preserve,
    longTermAuthorizedAt: item.long_term_authorized_at,
    longTermRevokedAt: item.long_term_revoked_at,
    destroyedAt: item.destroyed_at,
  };
}

export function createPrivacyService(client: ApiClient) {
  const mapPage = async (request: Promise<{ items: BackendSensitiveResource[]; total: number }>) => {
    const response = await request;
    return { items: response.items.map(mapResource), total: response.total };
  };
  return {
    expiring(days = 14, page = 1, pageSize = 20) {
      return mapPage(client.get(
        `/privacy/expiring-resources?days=${days}&page=${page}&page_size=${pageSize}`,
      ));
    },
    longTerm(page = 1, pageSize = 20) {
      return mapPage(client.get(
        `/privacy/long-term-resources?page=${page}&page_size=${pageSize}`,
      ));
    },
    async authorize(resourceId: string): Promise<SensitiveResource> {
      return mapResource(await client.post<BackendSensitiveResource>(
        `/privacy/resources/${resourceId}/authorize-long-term`,
        { confirm_understanding: true },
      ));
    },
    async revoke(resourceId: string): Promise<SensitiveResource> {
      return mapResource(await client.post<BackendSensitiveResource>(
        `/privacy/resources/${resourceId}/revoke-long-term`,
      ));
    },
    delete(resourceId: string) {
      return client.delete<{ deleted: true }>(
        `/privacy/resources/${resourceId}`,
        { confirmation_text: "删除资料" },
      );
    },
    cleanup() {
      return client.post<{ destroyed_count: number }>("/privacy/cleanup");
    },
  };
}
