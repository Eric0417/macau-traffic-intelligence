"use client";

import { Moon, Sun } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { localeOptions } from "@/lib/i18n";
import { residentCopy } from "@/lib/resident-copy";

export function WorkspaceSettings({ theme, onToggleTheme }: { theme: "light" | "dark"; onToggleTheme: () => void }) {
  const { locale, setLocale } = useLanguage();
  const c = residentCopy[locale];
  return <>
    <button type="button" className="appearance-toggle" aria-label={c.appearance} onClick={onToggleTheme}>
      {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
      <span>{theme === "light" ? c.dark : c.light}</span>
    </button>
    <div className="language-switch" aria-label="Language">
      {localeOptions.map(option => <button type="button" key={option.value} onClick={() => setLocale(option.value)} aria-pressed={locale === option.value} className={locale === option.value ? "is-active" : ""}>{option.short}</button>)}
    </div>
  </>;
}
