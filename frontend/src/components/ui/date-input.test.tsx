// @vitest-environment happy-dom
import { act, useState, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DateInput } from "./date-input";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
const changed = vi.fn();
type Options = Partial<Omit<ComponentProps<typeof DateInput>, "onValueChange">> & { reject?: boolean };
function Example({ value: initial = "2026-10-23", reject, ...props }: Options) {
  const [value, setValue] = useState(initial);
  return <form><DateInput id="test-date" {...props} value={value} onValueChange={(next) => {
    changed(next);
    if (reject) return false;
    setValue(next);
  }} /><output>{value}</output><button type="button" id="reset" onClick={() => setValue("2024-02-29")}>Reset</button></form>;
}
const field = () => document.querySelector<HTMLInputElement>("#test-date")!;
const output = () => document.querySelector("output")!.textContent;
const toggle = () => act(() => document.querySelector<HTMLButtonElement>("button[aria-controls='test-date']")!.click());
const enter = (value: string) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field(), value);
  field().dispatchEvent(new Event("input", { bubbles: true }));
  field().dispatchEvent(new Event("change", { bubbles: true }));
});
const valid = () => {
  let result = false;
  act(() => { result = document.querySelector("form")!.checkValidity(); });
  return result;
};

beforeEach(() => {
  changed.mockReset(); document.body.innerHTML = "<div id='root'></div>";
  root = createRoot(document.querySelector("#root")!);
});
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = ""; });

describe("calendar and manual entry", () => {
  it("allows a date in an older year through either mode and preserves it when switching", () => {
    act(() => root.render(<Example required />));
    expect(field().type).toBe("text");
    expect(field().value).toBe("23/10/2026");
    enter("09/01/2020");
    expect(output()).toBe("2020-01-09");
    toggle();
    expect(field().type).toBe("date");
    expect(field().value).toBe("2020-01-09");
    enter("2024-02-29");
    expect(output()).toBe("2024-02-29");
    expect(field().type).toBe("text");
    expect(field().value).toBe("29/02/2024");
    expect(valid()).toBe(true);
  });

  it("lets payroll and report filters select an older month manually", () => {
    act(() => root.render(<Example type="month" value="2026-10" />));
    enter("01/2020");
    expect(output()).toBe("2020-01");
    toggle();
    expect(field().value).toBe("2020-01");
    expect(valid()).toBe(true);
  });

  it("blocks invalid manual dates instead of submitting the previous saved value", () => {
    act(() => root.render(<Example required />));
    enter("29/02/2025");
    expect(changed).not.toHaveBeenCalled();
    expect(output()).toBe("2026-10-23");
    expect(valid()).toBe(false);
    expect(document.querySelector("[role='alert']")?.textContent).toContain("DD/MM/YYYY");
    enter("29/02/2024");
    expect(valid()).toBe(true);
    expect(output()).toBe("2024-02-29");
  });

  it("supports clearing an optional date and keeps required dates required", () => {
    act(() => root.render(<Example />));
    enter("");
    expect(output()).toBe(""); expect(valid()).toBe(true);
    act(() => root.render(<Example required />));
    expect(valid()).toBe(false);
  });

  it("resets a partial manual entry when another record is opened", () => {
    act(() => root.render(<Example />));
    enter("15/0");
    expect(valid()).toBe(false);
    act(() => document.querySelector<HTMLButtonElement>("#reset")!.click());
    expect(field().value).toBe("29/02/2024");
    expect(valid()).toBe(true);
  });

  it("restores the displayed month when an unsaved-changes prompt rejects a change", () => {
    act(() => root.render(<Example type="month" value="2026-10" reject />));
    enter("01/2020");
    expect(output()).toBe("2026-10");
    expect(field().value).toBe("10/2026");
    expect(valid()).toBe(true);
  });

  it("enforces the same payment date bounds in both modes", () => {
    act(() => root.render(<Example min="2026-10-01" />));
    enter("30/09/2026");
    expect(valid()).toBe(false);
    expect(changed).not.toHaveBeenCalled();
    enter("01/10/2026");
    expect(valid()).toBe(true);
    expect(output()).toBe("2026-10-01");
  });
});
