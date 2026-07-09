export type SystemCalendarEventInput = {
  title: string;
  privacyTitle: string | null;
  startAt: string;
  endAt: string | null;
};

export type CalendarDriver = {
  ensureWritableCalendar(): Promise<string>;
  createEvent(
    calendarId: string,
    title: string,
    event: SystemCalendarEventInput,
  ): Promise<string>;
  updateEvent(
    eventId: string,
    title: string,
    event: SystemCalendarEventInput,
  ): Promise<string>;
  deleteEvent(eventId: string): Promise<void>;
};

export function systemCalendarTitle(
  event: SystemCalendarEventInput,
  privacyTitleMode: boolean,
): string {
  return privacyTitleMode
    ? event.privacyTitle || "专业安排"
    : event.title;
}

export async function syncCalendarEvent(
  driver: CalendarDriver,
  event: SystemCalendarEventInput,
  options: {
    privacyTitleMode: boolean;
    existingSystemEventId?: string | null;
  },
): Promise<string> {
  const title = systemCalendarTitle(event, options.privacyTitleMode);
  if (options.existingSystemEventId) {
    return driver.updateEvent(options.existingSystemEventId, title, event);
  }
  return driver.createEvent(
    await driver.ensureWritableCalendar(),
    title,
    event,
  );
}

export async function removeSystemCalendarEvent(
  driver: CalendarDriver,
  systemEventId: string | null,
): Promise<void> {
  if (systemEventId) await driver.deleteEvent(systemEventId);
}

export function createExpoCalendarDriver(): CalendarDriver {
  return {
    async ensureWritableCalendar() {
      const calendar = await import("expo-calendar");
      const permission = await calendar.requestCalendarPermissionsAsync();
      if (!permission.granted) {
        throw new Error("未获得系统日历权限。");
      }
      const calendars = await calendar.getCalendarsAsync(
        calendar.EntityTypes.EVENT,
      );
      const writable = calendars.find(
        (item) => item.allowsModifications && item.isPrimary,
      ) ?? calendars.find((item) => item.allowsModifications);
      if (!writable) {
        throw new Error("设备上没有可写入的系统日历。");
      }
      return writable.id;
    },
    async createEvent(calendarId, title, event) {
      const calendar = await import("expo-calendar");
      return calendar.createEventAsync(calendarId, {
        title,
        startDate: new Date(event.startAt),
        endDate: new Date(event.endAt ?? event.startAt),
        notes: "由咨询师助手同步",
        alarms: [{ relativeOffset: -15 }],
      });
    },
    async updateEvent(eventId, title, event) {
      const calendar = await import("expo-calendar");
      return calendar.updateEventAsync(eventId, {
        title,
        startDate: new Date(event.startAt),
        endDate: new Date(event.endAt ?? event.startAt),
        notes: "由咨询师助手同步",
        alarms: [{ relativeOffset: -15 }],
      });
    },
    async deleteEvent(eventId) {
      const calendar = await import("expo-calendar");
      await calendar.deleteEventAsync(eventId);
    },
  };
}
