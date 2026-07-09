function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatInShanghai(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

export function dateFromDateTimeInput(value: string): Date | null {
  const normalized = value
    .trim()
    .replace("T", " ")
    .replace(/^(\d{4}-\d{2}-\d{2})(\d{2}:\d{2})/, "$1 $2");
  const match = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/.exec(normalized);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "0"] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTimeInput(value: Date | string): string {
  if (typeof value === "string" && /(?:z|[+-]\d{2}:\d{2})$/i.test(value.trim())) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : formatInShanghai(date);
  }
  const date = value instanceof Date ? value : dateFromDateTimeInput(value);
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

export function normalizeSessionDate(value: string): string {
  const formatted = formatDateTimeInput(value);
  if (!formatted) return "";
  return `${formatted.replace(" ", "T")}+08:00`;
}
