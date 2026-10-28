import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { calendarInputError, formatCalendarValue, parseCalendarValue, type CalendarValueType } from "@/lib/calendarDate";

type DateInputProps = Omit<ComponentProps<typeof Input>, "value" | "defaultValue" | "onChange" | "type" | "ref"> & {
  type?: CalendarValueType;
  value: string;
  onValueChange: (value: string) => void | boolean;
};

/** Keep the parent's value in ISO format while allowing a typed, local-format draft. */
export function DateInput({ type = "date", value, onValueChange, id, disabled, readOnly, min, max, onBlur, onInvalid, "aria-describedby": describedBy, ...props }: DateInputProps) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const input = useRef<HTMLInputElement>(null);
  // Always present the saved value in Indian order. Native date inputs use the
  // device locale and can otherwise show MM/DD/YYYY even on this India site.
  const [manual, setManual] = useState(true);
  const [text, setText] = useState(() => formatCalendarValue(value, type));
  const [error, setError] = useState("");
  const lower = String(min ?? (type === "month" ? "1000-01" : "1000-01-01"));
  const upper = String(max ?? (type === "month" ? "9999-12" : "9999-12-31"));
  const problem = manual ? calendarInputError(text, type, lower, upper) : "";
  const format = type === "month" ? "MM/YYYY" : "DD/MM/YYYY";

  useEffect(() => { setText(formatCalendarValue(value, type)); setError(""); }, [value, type]);
  useEffect(() => { input.current?.setCustomValidity(problem); }, [problem, manual]);

  const change = (next: string) => {
    setText(next); setError("");
    const invalid = calendarInputError(next, type, lower, upper);
    input.current?.setCustomValidity(invalid);
    if (invalid) return;
    const iso = next.trim() ? parseCalendarValue(next, type, true)! : "";
    if (iso !== value && onValueChange(iso) === false && iso) setText(formatCalendarValue(value, type));
  };

  return <div className="min-w-0 space-y-1">
    <Input {...props} ref={input} id={inputId} key={manual ? "manual" : "calendar"} lang="en-IN"
      type={manual ? "text" : type} value={manual ? text : value} disabled={disabled} readOnly={readOnly}
      {...(manual ? { placeholder: format, maxLength: type === "month" ? 7 : 10 } : { min: lower, max: upper })}
      aria-invalid={!!error || props["aria-invalid"]}
      aria-describedby={[describedBy, manual && `${inputId}-format`, error && `${inputId}-error`].filter(Boolean).join(" ") || undefined}
      onChange={(event) => {
        if (manual) change(event.target.value);
        else {
          setError("");
          const next = event.target.value;
          if (onValueChange(next) !== false) {
            setText(formatCalendarValue(next, type));
            setManual(true);
          }
        }
      }}
      onBlur={(event) => {
        if (manual) {
          setError(problem);
          if (!text.trim() && value) setText(formatCalendarValue(value, type));
        }
        onBlur?.(event);
      }}
      onInvalid={(event) => { if (manual) setError(problem); onInvalid?.(event); }} />
    <div className="flex flex-wrap items-center gap-x-3">
      <Button type="button" variant="link" disabled={disabled || readOnly} aria-controls={inputId} aria-pressed={manual}
        className="h-auto min-h-11 whitespace-normal px-0 text-left text-[#C2410C]"
        onClick={() => {
          if (manual && problem) { setError(problem); input.current?.reportValidity(); return; }
          setText(formatCalendarValue(value, type)); setError(""); setManual(!manual);
        }}>{manual ? "Use calendar" : type === "month" ? "Use MM/YYYY" : "Use DD/MM/YYYY"}</Button>
      {manual && <span id={`${inputId}-format`} className="text-xs text-slate-500">{format}</span>}
    </div>
    {error && <p id={`${inputId}-error`} role="alert" className="text-sm text-red-600">{error}</p>}
  </div>;
}
