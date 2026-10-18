import type { JobCreate } from "@/types";
import type { CandidateLanguage } from "./candidateLanguage";

const known: Record<string, string> = {
  "general worker": "ಸಾಮಾನ್ಯ ಕೆಲಸಗಾರ", "assembler": "ಅಸೆಂಬ್ಲರ್", "iti graduate": "ಐಟಿಐ ಪದವೀಧರ",
  "inbound customer service agent": "ಒಳಬರುವ ಕರೆಗಳ ಗ್ರಾಹಕ ಸೇವಾ ಪ್ರತಿನಿಧಿ", "telecaller": "ದೂರವಾಣಿ ಕರೆ ಪ್ರತಿನಿಧಿ",
  "mysore": "ಮೈಸೂರು", "mysuru": "ಮೈಸೂರು", "mangalore": "ಮಂಗಳೂರು", "mysore / mangalore": "ಮೈಸೂರು / ಮಂಗಳೂರು",
  "hebbal mysore": "ಹೆಬ್ಬಾಳ, ಮೈಸೂರು", "hebbal, mysore": "ಹೆಬ್ಬಾಳ, ಮೈಸೂರು", "fresher": "ಹೊಸ ಅಭ್ಯರ್ಥಿ",
  "customer service experience preferred": "ಗ್ರಾಹಕ ಸೇವೆಯ ಅನುಭವಕ್ಕೆ ಆದ್ಯತೆ", "rotational shifts including night shifts": "ರಾತ್ರಿ ಪಾಳಿಯೂ ಸೇರಿದಂತೆ ಬದಲಾಗುವ ಪಾಳಿಗಳು",
  "no experience required": "ಅನುಭವ ಅಗತ್ಯವಿಲ್ಲ", "general shift": "ಸಾಮಾನ್ಯ ಪಾಳಿ", "rotational shift": "ಬದಲಾಗುವ ಪಾಳಿ",
  "skilled": "ಕುಶಲ", "semi-skilled": "ಅರೆಕುಶಲ",
  "gross monthly": "ಮಾಸಿಕ ಒಟ್ಟು ಸಂಬಳ", "take-home monthly": "ಕೈಗೆ ಸಿಗುವ ಮಾಸಿಕ ಸಂಬಳ", "daily": "ದಿನಕ್ಕೆ", "hourly": "ಗಂಟೆಗೆ",
};
export function jobText(value: string | null | undefined, language: CandidateLanguage, translated?: string | null): string {
  return language === "kn" ? translated || known[(value || "").trim().toLowerCase()] || value || "" : value || "";
}
export function salaryText(job: JobCreate, language: CandidateLanguage): string {
  if (!job.salary?.trim()) return language === "kn" ? "ಸಂಬಳ ಇನ್ನೂ ದೃಢಪಟ್ಟಿಲ್ಲ — ತಂಡವನ್ನು ಸಂಪರ್ಕಿಸಿ" : "Salary not yet confirmed — contact our team";
  const salary = /^\d+$/.test(job.salary.trim()) ? `₹${Number(job.salary).toLocaleString("en-IN")}` : job.salary;
  return `${salary} · ${job.salary_basis ? jobText(job.salary_basis, language) : language === "kn" ? "ಒಟ್ಟು / ಕೈಗೆ ಸಿಗುವ ಮೊತ್ತ ದೃಢಪಡಿಸಿ" : "Confirm gross / take-home basis"}`;
}
export function missingJobDetails(job: JobCreate): string[] {
  return [["salary", job.salary], ["salary basis", job.salary_basis], ["description", job.description], ["qualification", job.qualification], ["working hours", job.working_hours], ["benefits", job.benefits], ["Kannada description", job.description_kn]].filter(([, v]) => !v?.trim()).map(([k]) => k!);
}
