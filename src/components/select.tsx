"use client";
import { Children, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { Tag } from "lucide-react";
import { Dropdown, type Opt } from "./dropdown";
import { categoryVisual, methodVisualByLabel } from "@/lib/ui-visuals";
import { cn } from "./ui";

type OptionEl = ReactElement<{ value?: string | number; children?: ReactNode }>;
/** Reads <option> children (also inside fragments and .map arrays) the way a native <select> would. */
function collect(children: ReactNode, out: { value: string; label: string; group?: string }[], group?: string) {
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return;
    if (c.type === "option") {
      const p = (c as OptionEl).props; const label = Children.toArray(p.children).filter((x) => typeof x === "string" || typeof x === "number").join("");
      const v = p.value != null ? String(p.value) : label; out.push({ value: v, label: label === v && /^[a-z][a-z _-]*$/.test(label) ? label.charAt(0).toUpperCase() + label.slice(1) : label, group }); // "monthly" -> "Monthly"
    } else if (c.type === "optgroup") collect((c.props as { children?: ReactNode }).children, out, String((c.props as { label?: string }).label ?? ""));
    else collect((c.props as { children?: ReactNode }).children, out, group);
  });
}

/**
 * Drop-in replacement for the native <select> used across the app: same props (name, value/defaultValue, onChange, required, children <option>s),
 * but rendered as the custom dropdown. `kind` adds colour-coded icons for category and payment-method lists.
 * It still submits through a normal <form> (hidden input), and `required` is enforced by the browser.
 */
export function Select({ name, value, defaultValue, onChange, children, className, required, disabled, kind, id, ...aria }: {
  name?: string; value?: string; defaultValue?: string; onChange?: (e: { target: { value: string } }) => void; children?: ReactNode; className?: string; required?: boolean; disabled?: boolean;
  kind?: "category" | "method"; id?: string; "aria-label"?: string; "aria-invalid"?: boolean;
}) {
  const items: { value: string; label: string; group?: string }[] = []; collect(children, items);
  const [inner, setInner] = useState(defaultValue ?? items[0]?.value ?? ""); const controlled = value !== undefined; const cur = controlled ? value : inner;
  const options: Opt[] = items.map((o) => {
    const v = kind === "category" && o.value ? categoryVisual(o.label) : kind === "method" && o.value ? methodVisualByLabel(o.label) : kind && !o.value ? { icon: Tag, hue: 230 } : undefined;
    return { value: o.value, label: o.label, group: o.group, solid: kind === "category" && !!o.value, ...(v ?? {}) };
  });
  return (
    <div className={cn("relative min-w-0", className, disabled && "pointer-events-none opacity-50")} id={id}>
      {required && <input required tabIndex={-1} aria-hidden name={name} value={cur} onChange={() => {}} className="pointer-events-none absolute inset-x-0 bottom-0 h-0 w-full opacity-0" />}
      <Dropdown name={required ? undefined : name} value={cur} options={options} ariaLabel={aria["aria-label"]} invalid={aria["aria-invalid"]}
        onChange={(v) => { if (!controlled) setInner(v); onChange?.({ target: { value: v } }); }} />
    </div>
  );
}
