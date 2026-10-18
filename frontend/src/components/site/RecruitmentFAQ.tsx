import type { CandidateLanguage } from "@/lib/candidateLanguage";

const questions = {
  en: [
    ["Do candidates pay to apply?", "No service or application fee is charged to candidates. Contact our workforce desk if anyone asks for a payment in our name."],
    ["Do I need a resume?", "A resume is optional. You can register with your name, mobile number, location and skill category. If you upload a resume, the maximum size is 2 MB."],
    ["What happens after I apply?", "Keep the application reference shown after submission. Our recruitment team reviews your profile and contacts suitable candidates for the next steps. Registration does not guarantee an interview or job."],
    ["How will I know the salary and interview details?", "Review the job page, then confirm gross or take-home pay, deductions, working hours, location and interview arrangements with our team before attending or accepting an offer. Details that are not yet confirmed are shown on the job page."],
    ["Can I get help in Kannada?", "Use the English / ಕನ್ನಡ switch beside the job listings or on a job page. You can also call or WhatsApp our team for help with the application."],
    ["How can a company request workers?", "Complete the manpower request with your contact details, job role, worker count, location, shift and joining date. Keep the enquiry reference for follow-up. Our team will contact you to confirm availability, timing and terms."],
    ["How can I change or remove my details?", "Use the contact details below and share your application or enquiry reference. Our Privacy Notice explains how recruitment details are used."],
  ],
  kn: [
    ["ಅರ್ಜಿ ಸಲ್ಲಿಸಲು ಶುಲ್ಕ ಇದೆಯೇ?", "ಅಭ್ಯರ್ಥಿಗಳಿಂದ ಯಾವುದೇ ಸೇವಾ ಅಥವಾ ಅರ್ಜಿ ಶುಲ್ಕವನ್ನು ಪಡೆಯುವುದಿಲ್ಲ. ನಮ್ಮ ಹೆಸರಿನಲ್ಲಿ ಯಾರಾದರೂ ಹಣ ಕೇಳಿದರೆ ನಮ್ಮ ತಂಡವನ್ನು ಸಂಪರ್ಕಿಸಿ."],
    ["ಸ್ವವಿವರ ಪತ್ರ ಅಗತ್ಯವೇ?", "ಸ್ವವಿವರ ಪತ್ರ ಐಚ್ಛಿಕ. ಹೆಸರು, ಮೊಬೈಲ್ ಸಂಖ್ಯೆ, ಸ್ಥಳ ಮತ್ತು ಕೌಶಲ್ಯ ವರ್ಗದೊಂದಿಗೆ ನೋಂದಾಯಿಸಬಹುದು. ಸ್ವವಿವರ ಪತ್ರ ಅಪ್‌ಲೋಡ್ ಮಾಡಿದರೆ ಗರಿಷ್ಠ ಗಾತ್ರ 2 MB."],
    ["ಅರ್ಜಿ ಸಲ್ಲಿಸಿದ ನಂತರ ಏನಾಗುತ್ತದೆ?", "ಸಲ್ಲಿಕೆಯ ನಂತರ ತೋರಿಸುವ ಅರ್ಜಿ ಉಲ್ಲೇಖ ಸಂಖ್ಯೆಯನ್ನು ಉಳಿಸಿಕೊಳ್ಳಿ. ನಮ್ಮ ತಂಡ ವಿವರಗಳನ್ನು ಪರಿಶೀಲಿಸಿ ಸೂಕ್ತ ಅಭ್ಯರ್ಥಿಗಳನ್ನು ಸಂಪರ್ಕಿಸುತ್ತದೆ. ನೋಂದಣಿಯಿಂದ ಸಂದರ್ಶನ ಅಥವಾ ಉದ್ಯೋಗ ಖಚಿತವಾಗುವುದಿಲ್ಲ."],
    ["ಸಂಬಳ ಮತ್ತು ಸಂದರ್ಶನದ ವಿವರಗಳನ್ನು ಹೇಗೆ ತಿಳಿಯುವುದು?", "ಉದ್ಯೋಗದ ಪುಟವನ್ನು ನೋಡಿ. ಸಂದರ್ಶನಕ್ಕೆ ಹೋಗುವ ಮೊದಲು ಅಥವಾ ಕೆಲಸ ಒಪ್ಪಿಕೊಳ್ಳುವ ಮೊದಲು ಒಟ್ಟು / ಕೈಗೆ ಸಿಗುವ ಸಂಬಳ, ಕಡಿತಗಳು, ಕೆಲಸದ ಸಮಯ, ಸ್ಥಳ ಮತ್ತು ಸಂದರ್ಶನದ ವಿವರಗಳನ್ನು ನಮ್ಮ ತಂಡದೊಂದಿಗೆ ದೃಢಪಡಿಸಿ."],
    ["ಕನ್ನಡದಲ್ಲಿ ಸಹಾಯ ಸಿಗುತ್ತದೆಯೇ?", "ಉದ್ಯೋಗಗಳ ಪಟ್ಟಿಯ ಬಳಿ ಅಥವಾ ಉದ್ಯೋಗದ ಪುಟದಲ್ಲಿ English / ಕನ್ನಡ ಆಯ್ಕೆಯನ್ನು ಬಳಸಿ. ಅರ್ಜಿ ಸಲ್ಲಿಸಲು ಸಹಾಯ ಬೇಕಾದರೆ ನಮ್ಮ ತಂಡಕ್ಕೆ ಕರೆ ಅಥವಾ ವಾಟ್ಸಾಪ್ ಮಾಡಿ."],
    ["ಕಂಪನಿಯು ಕೆಲಸಗಾರರನ್ನು ಹೇಗೆ ಕೇಳಬಹುದು?", "ಸಂಪರ್ಕ ವಿವರಗಳು, ಹುದ್ದೆ, ಕೆಲಸಗಾರರ ಸಂಖ್ಯೆ, ಸ್ಥಳ, ಪಾಳಿ ಮತ್ತು ಸೇರುವ ದಿನಾಂಕದೊಂದಿಗೆ ಬೇಡಿಕೆ ಸಲ್ಲಿಸಿ. ವಿಚಾರಣೆಯ ಉಲ್ಲೇಖ ಸಂಖ್ಯೆಯನ್ನು ಉಳಿಸಿಕೊಳ್ಳಿ. ಲಭ್ಯತೆ, ಸಮಯ ಮತ್ತು ಷರತ್ತುಗಳನ್ನು ದೃಢಪಡಿಸಲು ನಮ್ಮ ತಂಡ ಸಂಪರ್ಕಿಸುತ್ತದೆ."],
    ["ನನ್ನ ವಿವರಗಳನ್ನು ಬದಲಾಯಿಸುವುದು ಅಥವಾ ತೆಗೆದುಹಾಕುವುದು ಹೇಗೆ?", "ಕೆಳಗಿನ ಸಂಪರ್ಕ ವಿವರಗಳನ್ನು ಬಳಸಿ ನಿಮ್ಮ ಅರ್ಜಿ ಅಥವಾ ವಿಚಾರಣೆಯ ಉಲ್ಲೇಖ ಸಂಖ್ಯೆಯನ್ನು ತಿಳಿಸಿ. ನೇಮಕಾತಿ ವಿವರಗಳ ಬಳಕೆಯ ಬಗ್ಗೆ ಗೌಪ್ಯತಾ ಸೂಚನೆಯಲ್ಲಿ ತಿಳಿಸಲಾಗಿದೆ."],
  ],
};
export default function RecruitmentFAQ({ language }: { language: CandidateLanguage }) {
  return <section id="faqs" lang={language} className="bg-white px-6 py-16"><div className="mx-auto max-w-4xl"><h2 className="text-3xl font-bold text-[#0F2444]">{language === "kn" ? "ಅರ್ಜಿ ಮತ್ತು ಸಂದರ್ಶನದ ಪ್ರಶ್ನೆಗಳು" : "Application & interview FAQs"}</h2><div className="mt-6 divide-y rounded-xl border border-slate-200">{questions[language].map(([q, a]) => <details key={q} className="p-5"><summary className="flex cursor-pointer items-center font-semibold text-[#0F2444]">{q}</summary><p className="mt-3 text-sm leading-relaxed text-slate-600">{a}</p></details>)}</div></div></section>;
}
