"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input, cn } from "./ui";

/** Password box with a show/hide eye button. Same props as a normal input (name, autoComplete, required, ...). */
export function PasswordInput(props: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className={cn("pr-10", props["aria-invalid"] && "border-bad", props.className)} />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
        className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted transition hover:bg-surface2 hover:text-fg">
        {show ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
      </button>
    </div>
  );
}
