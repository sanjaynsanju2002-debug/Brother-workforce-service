import { describe, expect, it } from "vitest";
import { calendarInputError, formatCalendarValue, parseCalendarValue } from "./calendarDate";

describe("shared calendar dates", () => {
  it("accepts older dates across months and years without swapping day and month", () => {
    expect(parseCalendarValue("2020-01-09", "date")).toBe("2020-01-09");
    expect(parseCalendarValue("09/01/2020", "date", true)).toBe("2020-01-09");
    expect(parseCalendarValue(" 9/1/2020 ", "date", true)).toBe("2020-01-09");
    expect(formatCalendarValue("2020-01-09", "date")).toBe("09/01/2020");
  });

  it("preserves dates when switching between calendar and manual entry", () => {
    for (const date of ["2024-02-29", "2025-12-31", "2026-01-01"]) {
      expect(parseCalendarValue(formatCalendarValue(date, "date"), "date", true)).toBe(date);
    }
    expect(formatCalendarValue("", "date")).toBe("");
  });

  it("rejects invalid dates instead of silently rolling them into another month", () => {
    for (const date of ["31/04/2025", "29/02/2025", "29/02/1900", "00/10/2026", "10/13/2026", "10/10/0000", "2025-12-01", "", "10/10/26"]) {
      expect(parseCalendarValue(date, "date", true)).toBeNull();
    }
    for (const date of ["2025-02-29", "2026-13-01", "0000-01-01", "2026-10-00", "2026-10-01T00:00:00Z"]) {
      expect(parseCalendarValue(date, "date")).toBeNull();
    }
    expect(parseCalendarValue("29/02/2000", "date", true)).toBe("2000-02-29");
  });
  it("accepts historical payroll and reporting months in both entry modes", () => {
    expect(parseCalendarValue("2020-01", "month")).toBe("2020-01");
    expect(parseCalendarValue("1/2020", "month", true)).toBe("2020-01");
    expect(formatCalendarValue("2020-01", "month")).toBe("01/2020");
    for (const value of ["00/2020", "13/2020", "10/20", "10/0000", "2020-10"]) {
      expect(parseCalendarValue(value, "month", true)).toBeNull();
    }
  });
  it("keeps date relationships valid in manual mode", () => {
    expect(calendarInputError("09/01/2020", "date")).toBe("");
    expect(calendarInputError("09/01/2020", "date", "2020-01-10")).toContain("on or after 10/01/2020");
    expect(calendarInputError("12/2020", "month", undefined, "2020-11")).toContain("on or before 11/2020");
    expect(calendarInputError("31/02/2020", "date")).toContain("valid date");
  });
});
