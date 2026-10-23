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

export function calendarInputError(text: string, type: CalendarValueType, min?: string, max?: string): string {
  if (!text.trim()) return "";
  const value = parseCalendarValue(text, type, true);
  if (!value) return `Enter a valid ${type} in ${type === "month" ? "MM/YYYY" : "DD/MM/YYYY"} format.`;
  if (min && value < min) return `Choose a ${type} on or after ${formatCalendarValue(min, type)}.`;
  if (max && value > max) return `Choose a ${type} on or before ${formatCalendarValue(max, type)}.`;
  return "";
}
