"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, SunMoon } from "lucide-react";
import { setPreferenceCookie, THEME_COOKIE, type ThemeChoice } from "@/lib/preferences";
import { cn } from "@/lib/utils";

function effectiveTheme(): ThemeChoice {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/**
 * Switches between light and dark. Until the user picks, the light theme applies;
 * after that the choice is stored in a cookie and applied server-side on every page.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<ThemeChoice | null>(null);

  useEffect(() => {
    setTheme(effectiveTheme());
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setTheme(effectiveTheme());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const next: ThemeChoice = theme === "light" ? "dark" : "light";
  const Icon = theme === null ? SunMoon : theme === "light" ? Moon : Sun;

  return (
    <button
      type="button"
      onClick={() => {
        document.documentElement.dataset.theme = next;
        setPreferenceCookie(THEME_COOKIE, next);
        setTheme(next);
      }}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-full text-ink-2 transition-colors hover:bg-card-3 hover:text-ink",
        className,
      )}
      aria-label={theme ? `Switch to ${next} mode` : "Toggle colour theme"}
      title={theme ? `Switch to ${next} mode` : undefined}
    >
      <Icon className="h-4.5 w-4.5" />
    </button>
  );
}
