import type { CandidateLanguage } from "@/lib/candidateLanguage";

export default function CandidateLanguageToggle({ language, onChange }: { language: CandidateLanguage; onChange: (value: CandidateLanguage) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-sm" role="group" aria-label="Candidate language / ಅಭ್ಯರ್ಥಿಗಳ ಭಾಷೆ">
      {(["en", "kn"] as const).map((value) => (
        <button
          key={value}
          type="button"
          lang={value}
          aria-pressed={language === value}
          onClick={() => onChange(value)}
          className={`rounded-md px-3 py-1.5 font-semibold ${language === value ? "bg-[#0F2444] text-white" : "text-slate-700 hover:bg-slate-100"}`}
        >
          {value === "en" ? "English" : "ಕನ್ನಡ"}
        </button>
      ))}
    </div>
  );
}
