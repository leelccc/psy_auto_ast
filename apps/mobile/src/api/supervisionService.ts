import { ApiClient } from "./apiClient";


export type SupervisionCitation = {
  label: string;
  resource_type: string;
  resource_id: string;
};

export type SupervisionMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  generationStatus: string | null;
  citations: SupervisionCitation[];
  createdAt: string;
};

export type SupervisionContextRef = {
  id: string;
  resourceType: "profile" | "session" | "report";
  resourceId: string;
  label: string;
};

export type SupervisionConversation = {
  id: string;
  title: string;
  expiresAt: string;
  contextRefs: SupervisionContextRef[];
  messages: SupervisionMessage[];
  createdAt: string;
  updatedAt: string;
};

type BackendConversation = {
  id: string;
  title: string;
  expires_at: string;
  context_refs?: Array<{
    id: string;
    resource_type: SupervisionContextRef["resourceType"];
    resource_id: string;
    label: string;
  }>;
  messages?: Array<{
    id: string;
    role: SupervisionMessage["role"];
    content: string;
    generation_status: string | null;
    citations: SupervisionCitation[];
    created_at: string;
  }>;
  created_at: string;
  updated_at: string;
};

function mapConversation(value: BackendConversation): SupervisionConversation {
  return {
    id: value.id,
    title: value.title,
    expiresAt: value.expires_at,
    contextRefs: (value.context_refs ?? []).map((item) => ({
      id: item.id,
      resourceType: item.resource_type,
      resourceId: item.resource_id,
      label: item.label,
    })),
    messages: (value.messages ?? []).map((item) => ({
      id: item.id,
      role: item.role,
      content: item.content,
      generationStatus: item.generation_status,
      citations: item.citations,
      createdAt: item.created_at,
    })),
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

export function createSupervisionService(client: ApiClient) {
  const service = {
    async list(): Promise<SupervisionConversation[]> {
      const response = await client.get<{ items: BackendConversation[] }>(
        "/supervision/conversations",
      );
      return response.items.map(mapConversation);
    },
    async createConversation(title: string): Promise<SupervisionConversation> {
      return mapConversation(await client.post<BackendConversation>(
        "/supervision/conversations",
        { title },
      ));
    },
    async get(conversationId: string): Promise<SupervisionConversation> {
      return mapConversation(await client.get<BackendConversation>(
        `/supervision/conversations/${conversationId}`,
        { deduplicate: false },
      ));
    },
    async addContext(
      conversationId: string,
      items: Array<{ resourceType: "profile" | "session" | "report"; resourceId: string }>,
    ): Promise<SupervisionContextRef[]> {
      const response = await client.post<{
        items: Array<{
          id: string;
          resource_type: SupervisionContextRef["resourceType"];
          resource_id: string;
          label: string;
        }>;
      }>(`/supervision/conversations/${conversationId}/context`, {
        items: items.map((item) => ({
          resource_type: item.resourceType,
          resource_id: item.resourceId,
        })),
      });
      return response.items.map((item) => ({
        id: item.id,
        resourceType: item.resource_type,
        resourceId: item.resource_id,
        label: item.label,
      }));
    },
    removeContext(conversationId: string, contextId: string) {
      return client.delete<{ deleted: true }>(
        `/supervision/conversations/${conversationId}/context/${contextId}`,
      );
    },
    async sendMessage(conversationId: string, content: string) {
      const command = await client.post<{
        user_message_id: string;
        assistant_message_id: string;
        job_id: string;
        risk_prompt: string | null;
      }>(`/supervision/conversations/${conversationId}/messages`, { content });
      const conversation = await service.get(conversationId);
      const assistantMessage = conversation.messages.find(
        (message) => message.id === command.assistant_message_id,
      );
      if (!assistantMessage) {
        throw new Error("督导回复尚未写入会话。");
      }
      return {
        jobId: command.job_id,
        riskPrompt: command.risk_prompt,
        assistantMessage,
      };
    },
    events(conversationId: string, messageId: string) {
      return client.get<{
        items: Array<{ event: string; data: Record<string, unknown> }>;
      }>(
        `/supervision/conversations/${conversationId}/messages/${messageId}/events`,
        { deduplicate: false },
      );
    },
    stop(conversationId: string, messageId: string) {
      return client.post<{
        id: string;
        content: string;
        generation_status: string;
      }>(`/supervision/conversations/${conversationId}/messages/${messageId}/stop`);
    },
    deleteConversation(conversationId: string) {
      return client.delete<{ deleted: true }>(
        `/supervision/conversations/${conversationId}`,
      );
    },
  };
  return service;
}
