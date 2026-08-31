import { ApiClient } from "./apiClient";


export type CalendarSettings = {
  systemCalendarEnabled: boolean;
  privacyTitleModeEnabled: boolean;
  updatedAt: string;
};

export type CalendarEvent = {
  id: string;
  title: string;
  privacyTitle: string | null;
  displayTitle: string;
  category: string;
  sourceType: "manual" | "profile_next_session";
  startAt: string;
  endAt: string | null;
  profileId: string | null;
  sessionId: string | null;
  status: string;
  syncToSystemCalendar: boolean;
  systemCalendarEventId: string | null;
  createdAt: string;
  updatedAt: string;
};

type BackendCalendarEvent = {
  id: string;
  title: string;
  privacy_title: string | null;
  display_title: string;
  category: string;
  source_type: CalendarEvent["sourceType"];
  start_at: string;
  end_at: string | null;
  profile_id: string | null;
  session_id: string | null;
  status: string;
  sync_to_system_calendar: boolean;
  system_calendar_event_id: string | null;
  created_at: string;
  updated_at: string;
};

function mapEvent(event: BackendCalendarEvent): CalendarEvent {
  return {
    id: event.id,
    title: event.title,
    privacyTitle: event.privacy_title,
    displayTitle: event.display_title,
    category: event.category,
    sourceType: event.source_type,
    startAt: event.start_at,
    endAt: event.end_at,
    profileId: event.profile_id,
    sessionId: event.session_id,
    status: event.status,
    syncToSystemCalendar: event.sync_to_system_calendar,
    systemCalendarEventId: event.system_calendar_event_id,
    createdAt: event.created_at,
    updatedAt: event.updated_at,
  };
}

function mapSettings(settings: {
  system_calendar_enabled: boolean;
  privacy_title_mode_enabled: boolean;
  updated_at: string;
}): CalendarSettings {
  return {
    systemCalendarEnabled: settings.system_calendar_enabled,
    privacyTitleModeEnabled: settings.privacy_title_mode_enabled,
    updatedAt: settings.updated_at,
  };
}

export function createCalendarService(client: ApiClient) {
  return {
    async settings(): Promise<CalendarSettings> {
      return mapSettings(await client.get("/calendar/settings"));
    },
    async updateSettings(input: {
      systemCalendarEnabled?: boolean;
      privacyTitleModeEnabled?: boolean;
    }): Promise<CalendarSettings> {
      return mapSettings(await client.patch("/calendar/settings", {
        system_calendar_enabled: input.systemCalendarEnabled,
        privacy_title_mode_enabled: input.privacyTitleModeEnabled,
      }));
    },
    async listEvents(range: { from?: string; to?: string } = {}) {
      const params = new URLSearchParams();
      if (range.from) params.set("from", range.from);
      if (range.to) params.set("to", range.to);
      // 注意：不能用 params.size 判断——Hermes 原生 URLSearchParams 没有 size getter，
      // Android 上恒为 undefined，query 会被整体丢弃（日程范围过滤失效）。
      const query = params.toString() ? `?${params}` : "";
      const response = await client.get<{ items: BackendCalendarEvent[] }>(
        `/calendar/events${query}`,
      );
      return { items: response.items.map(mapEvent) };
    },
    async createEvent(input: {
      title: string;
      privacyTitle?: string;
      category: string;
      startAt: string;
      endAt?: string;
      profileId?: string;
      sessionId?: string;
      syncToSystemCalendar?: boolean;
      systemCalendarEventId?: string;
    }): Promise<CalendarEvent> {
      return mapEvent(await client.post("/calendar/events", {
        title: input.title,
        privacy_title: input.privacyTitle,
        category: input.category,
        start_at: input.startAt,
        end_at: input.endAt,
        profile_id: input.profileId,
        session_id: input.sessionId,
        sync_to_system_calendar: input.syncToSystemCalendar ?? false,
        system_calendar_event_id: input.systemCalendarEventId,
      }));
    },
    async updateEvent(eventId: string, input: {
      title?: string;
      privacyTitle?: string | null;
      startAt?: string;
      endAt?: string | null;
      status?: string;
      syncToSystemCalendar?: boolean;
      systemCalendarEventId?: string | null;
    }): Promise<CalendarEvent> {
      return mapEvent(await client.patch(`/calendar/events/${eventId}`, {
        title: input.title,
        privacy_title: input.privacyTitle,
        start_at: input.startAt,
        end_at: input.endAt,
        status: input.status,
        sync_to_system_calendar: input.syncToSystemCalendar,
        system_calendar_event_id: input.systemCalendarEventId,
      }));
    },
    deleteEvent(eventId: string) {
      return client.delete<{
        deleted: true;
        system_calendar_event_id: string | null;
      }>(`/calendar/events/${eventId}`);
    },
  };
}
