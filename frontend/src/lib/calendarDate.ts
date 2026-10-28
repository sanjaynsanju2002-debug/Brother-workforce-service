export type CalendarValueType = "date" | "month";

/** Parse date-only values without timezone conversion or silent date rollover. */
export function parseCalendarValue(value: string, type: CalendarValueType, manual = false): string | null {
  const text = value.trim();
  if (type === "month") {
    const parts = (manual ? /^(\d{1,2})\/([1-9]\d{3})$/ : /^([1-9]\d{3})-(\d{2})$/).exec(text);
    if (!parts) return null;
    const year = manual ? parts[2] : parts[1];
    const month = manual ? parts[1] : parts[2];
    return Number(month) >= 1 && Number(month) <= 12 ? `${year}-${month.padStart(2, "0")}` : null;
  }
  const parts = (manual ? /^(\d{1,2})\/(\d{1,2})\/([1-9]\d{3})$/ : /^([1-9]\d{3})-(\d{2})-(\d{2})$/).exec(text);
  if (!parts) return null;
  const [, first, month, last] = parts;
  const year = manual ? last : first;
  const day = manual ? first.padStart(2, "0") : last;
  const iso = `${year}-${month.padStart(2, "0")}-${day}`;
  const date = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

export function formatCalendarValue(value: string, type: CalendarValueType): string {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return type === "month" ? `${month}/${year}` : `${day}/${month}/${year}`;
}

/** Format an ISO calendar date for people in India without timezone rollover. */
export function formatIndianDate(value: string | null | undefined): string {
  if (!value) return "";
  const dateOnly = value.match(/^(\d{4}-\d{2}-\d{2})$/)?.[1];
  return dateOnly && parseCalendarValue(dateOnly, "date")
    ? formatCalendarValue(dateOnly, "date")
    : formatIndianDateTime(value, false);
}

/** Format a timestamp in India Standard Time with the date always shown as DD/MM/YYYY. */
export function formatIndianDateTime(value: string | Date | null | undefined, includeTime = true): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit", hour12: true } : {}),
  }).format(date);
}

export function calendarInputError(text: string, type: CalendarValueType, min?: string, max?: string): string {
  if (!text.trim()) return "";
  const value = parseCalendarValue(text, type, true);
  if (!value) return `Enter a valid ${type} in ${type === "month" ? "MM/YYYY" : "DD/MM/YYYY"} format.`;
  if (min && value < min) return `Choose a ${type} on or after ${formatCalendarValue(min, type)}.`;
  if (max && value > max) return `Choose a ${type} on or before ${formatCalendarValue(max, type)}.`;
  return "";
}
