import { Languages } from "lucide-react";
import { translateText, useSiteLanguage, type SiteLanguage } from "@/lib/language";

export default function LanguageSelector() {
  const [language, setLanguage] = useSiteLanguage();
  return (
    <label className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-[#0F2444]" data-testid="website-language-control">
      <Languages aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className="sr-only">{translateText("Website language")}</span>
      <select
        className="max-w-28 cursor-pointer bg-transparent text-sm font-semibold outline-offset-2"
        aria-label={translateText("Website language")}
        value={language}
        onChange={(event) => setLanguage(event.target.value as SiteLanguage)}
        data-testid="website-language-selector"
      >
        <option value="en" lang="en">English</option>
        <option value="kn" lang="kn">ಕನ್ನಡ</option>
      </select>
    </label>
  );
}
