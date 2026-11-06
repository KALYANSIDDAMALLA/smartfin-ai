"use client";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

/** Light / dark switch for the public pages (the signed-in app has the same button in its top bar). The icon is chosen by CSS, so there is no flash or mismatch before the page loads. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button type="button" aria-label="Switch between light and dark mode" title="Switch theme" className="icon-btn" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
      <Sun size={18} className="hidden dark:block" aria-hidden /><Moon size={18} className="dark:hidden" aria-hidden />
    </button>
  );
}
