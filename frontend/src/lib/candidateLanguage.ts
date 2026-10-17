import { useSiteLanguage } from "@/lib/language";

export type CandidateLanguage = "en" | "kn";

export const candidateCopy = {
  en: {
    jobs: "Current Job Openings", recruitment: "Recruitment", jobsIntro: "Direct recruitment opportunities for industrial and factory placements.",
    activeOpenings: "active openings", registerFuture: "Register for future jobs", quickApply: "Quick Apply",
    loading: "Loading current openings…", loadError: "Current openings could not be loaded.", retry: "Try Again",
    noJobs: "No current openings. New opportunities will be updated soon.", noJobsHelp: "Register your profile and our team will contact you when a matching role opens.",
    experience: "Experience", salary: "Salary", shift: "Shift", openings: "Openings", posted: "Posted", closingDate: "Apply by",
    employer: "Hiring company", confidentialEmployer: "Shared during screening", missingDescription: "Please contact our team for the full role details before applying.",
    discuss: "Discuss during screening", viewApply: "View & Apply", allOpenings: "All openings", currentOpening: "Current opening",
    applyForJob: "Apply for this job", jobDetails: "Job details", applyFor: "Apply for", linkedApplication: "Your application will be linked to this opening.",
    noFee: "No service or application fee is charged to candidates.", reviewed: "Applications are reviewed by our recruitment team.",
    descriptionEnglish: "This description is currently available in English. Contact our team if you need help in Kannada.",
    workerTitle: "Looking For Job Opportunities?", workerIntro: "Register once and our recruitment team will match you to factory, warehouse and technical roles as they open across Karnataka.",
    fullName: "Full Name *", mobile: "Mobile Number *", whatsapp: "WhatsApp Number", age: "Age", gender: "Gender", currentLocation: "Current Location *", education: "Education", skillCategory: "Skill Category *", availability: "Availability", preferredLocation: "Preferred Job Location", expectedSalary: "Expected Salary", skills: "Skills", previousExperience: "Previous Work Experience", optionalDetails: "Add optional details", optionalHelp: "Education, experience and preferences can help us find a closer match.",
    select: "Select", selectCategory: "Select category", selectAvailability: "Select availability", resume: "Resume Upload", resumeHelp: "Upload PDF / DOC / image — max 2 MB (optional)",
    consentBefore: "I agree that Brothers Workforce Solutions may use my profile and resume to contact me about jobs and share a relevant profile with an employer for recruitment. Read the ", privacy: "Privacy Notice", consentAfter: ".",
    applyNow: "Apply Now", registering: "Register for jobs", appliedFor: "Applying for", another: "Register another worker", successJob: "Thank you for applying. Our recruitment team will review your profile.", successGeneral: "Thank you for registering. Our recruitment team will contact you when suitable opportunities are available.",
    requiredError: "Please fill all required fields", consentError: "Please agree to the recruitment use of your profile", submitError: "Could not submit your application. Please try again.", resumeTooLarge: "Resume must be 2 MB or smaller", savedWithoutResume: "Application saved, but the resume could not be uploaded. Please contact us to send the resume.", submitted: "Application submitted successfully",
    removalBefore: "For questions about your details or to request their removal, email ",
  },
  kn: {
    jobs: "ಪ್ರಸ್ತುತ ಉದ್ಯೋಗಾವಕಾಶಗಳು", recruitment: "ನೇಮಕಾತಿ", jobsIntro: "ಕೈಗಾರಿಕೆ ಮತ್ತು ಕಾರ್ಖಾನೆ ಉದ್ಯೋಗಾವಕಾಶಗಳು.",
    activeOpenings: "ಸಕ್ರಿಯ ಉದ್ಯೋಗಾವಕಾಶಗಳು", registerFuture: "ಮುಂದಿನ ಉದ್ಯೋಗಗಳಿಗಾಗಿ ನೋಂದಾಯಿಸಿ", quickApply: "ತ್ವರಿತ ನೋಂದಣಿ",
    loading: "ಉದ್ಯೋಗಾವಕಾಶಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗುತ್ತಿದೆ…", loadError: "ಉದ್ಯೋಗಾವಕಾಶಗಳನ್ನು ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.", retry: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ",
    noJobs: "ಈಗ ಯಾವುದೇ ಉದ್ಯೋಗಾವಕಾಶಗಳಿಲ್ಲ. ಹೊಸ ಅವಕಾಶಗಳನ್ನು ಶೀಘ್ರದಲ್ಲೇ ಪ್ರಕಟಿಸಲಾಗುತ್ತದೆ.", noJobsHelp: "ನಿಮ್ಮ ವಿವರಗಳನ್ನು ನೋಂದಾಯಿಸಿ. ಸೂಕ್ತ ಉದ್ಯೋಗ ಲಭ್ಯವಾದಾಗ ನಮ್ಮ ತಂಡ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತದೆ.",
    experience: "ಅನುಭವ", salary: "ಸಂಬಳ", shift: "ಪಾಳಿ", openings: "ಖಾಲಿ ಹುದ್ದೆಗಳು", posted: "ಪ್ರಕಟಿಸಿದ ದಿನಾಂಕ", closingDate: "ಅರ್ಜಿ ಸಲ್ಲಿಸುವ ಕೊನೆಯ ದಿನ",
    employer: "ನೇಮಕಾತಿ ಕಂಪನಿ", confidentialEmployer: "ಪರಿಶೀಲನೆಯ ಸಮಯದಲ್ಲಿ ತಿಳಿಸಲಾಗುತ್ತದೆ", missingDescription: "ಅರ್ಜಿ ಸಲ್ಲಿಸುವ ಮೊದಲು ಉದ್ಯೋಗದ ಸಂಪೂರ್ಣ ವಿವರಗಳಿಗಾಗಿ ನಮ್ಮ ತಂಡವನ್ನು ಸಂಪರ್ಕಿಸಿ.",
    discuss: "ಪರಿಶೀಲನೆಯ ಸಮಯದಲ್ಲಿ ಚರ್ಚಿಸಲಾಗುತ್ತದೆ", viewApply: "ವಿವರ ನೋಡಿ ಅರ್ಜಿ ಸಲ್ಲಿಸಿ", allOpenings: "ಎಲ್ಲಾ ಉದ್ಯೋಗಾವಕಾಶಗಳು", currentOpening: "ಪ್ರಸ್ತುತ ಉದ್ಯೋಗಾವಕಾಶ",
    applyForJob: "ಈ ಉದ್ಯೋಗಕ್ಕೆ ಅರ್ಜಿ ಸಲ್ಲಿಸಿ", jobDetails: "ಉದ್ಯೋಗದ ವಿವರಗಳು", applyFor: "ಅರ್ಜಿ ಸಲ್ಲಿಸಿ:", linkedApplication: "ನಿಮ್ಮ ಅರ್ಜಿಯನ್ನು ಈ ಉದ್ಯೋಗಾವಕಾಶಕ್ಕೆ ಜೋಡಿಸಲಾಗುತ್ತದೆ.",
    noFee: "ಅಭ್ಯರ್ಥಿಗಳಿಂದ ಯಾವುದೇ ಸೇವಾ ಅಥವಾ ಅರ್ಜಿ ಶುಲ್ಕವನ್ನು ಪಡೆಯುವುದಿಲ್ಲ.", reviewed: "ನಮ್ಮ ನೇಮಕಾತಿ ತಂಡ ಅರ್ಜಿಗಳನ್ನು ಪರಿಶೀಲಿಸುತ್ತದೆ.",
    descriptionEnglish: "ಈ ಉದ್ಯೋಗದ ವಿವರಣೆ ಈಗ ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ಲಭ್ಯವಿದೆ. ಕನ್ನಡದಲ್ಲಿ ಸಹಾಯಕ್ಕಾಗಿ ನಮ್ಮ ತಂಡವನ್ನು ಸಂಪರ್ಕಿಸಿ.",
    workerTitle: "ಉದ್ಯೋಗಾವಕಾಶಗಳನ್ನು ಹುಡುಕುತ್ತಿದ್ದೀರಾ?", workerIntro: "ಒಮ್ಮೆ ನೋಂದಾಯಿಸಿ. ಕರ್ನಾಟಕದಲ್ಲಿ ಸೂಕ್ತ ಕಾರ್ಖಾನೆ, ಗೋದಾಮು ಮತ್ತು ತಾಂತ್ರಿಕ ಉದ್ಯೋಗಾವಕಾಶಗಳು ಬಂದಾಗ ನಮ್ಮ ತಂಡ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತದೆ.",
    fullName: "ಪೂರ್ಣ ಹೆಸರು *", mobile: "ಮೊಬೈಲ್ ಸಂಖ್ಯೆ *", whatsapp: "ವಾಟ್ಸಾಪ್ ಸಂಖ್ಯೆ", age: "ವಯಸ್ಸು", gender: "ಲಿಂಗ", currentLocation: "ಪ್ರಸ್ತುತ ಸ್ಥಳ *", education: "ವಿದ್ಯಾರ್ಹತೆ", skillCategory: "ಕೌಶಲ್ಯ ವರ್ಗ *", availability: "ಕೆಲಸಕ್ಕೆ ಲಭ್ಯತೆ", preferredLocation: "ಆದ್ಯತೆಯ ಉದ್ಯೋಗ ಸ್ಥಳ", expectedSalary: "ನಿರೀಕ್ಷಿತ ಸಂಬಳ", skills: "ಕೌಶಲ್ಯಗಳು", previousExperience: "ಹಿಂದಿನ ಕೆಲಸದ ಅನುಭವ", optionalDetails: "ಐಚ್ಛಿಕ ವಿವರಗಳನ್ನು ಸೇರಿಸಿ", optionalHelp: "ವಿದ್ಯಾರ್ಹತೆ, ಅನುಭವ ಮತ್ತು ಆದ್ಯತೆಗಳು ಸೂಕ್ತ ಉದ್ಯೋಗ ಹುಡುಕಲು ಸಹಾಯ ಮಾಡುತ್ತವೆ.",
    select: "ಆಯ್ಕೆಮಾಡಿ", selectCategory: "ವರ್ಗವನ್ನು ಆಯ್ಕೆಮಾಡಿ", selectAvailability: "ಲಭ್ಯತೆಯನ್ನು ಆಯ್ಕೆಮಾಡಿ", resume: "ಸ್ವವಿವರ ಪತ್ರ ಅಪ್‌ಲೋಡ್", resumeHelp: "PDF / DOC / ಚಿತ್ರ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ — ಗರಿಷ್ಠ 2 MB (ಐಚ್ಛಿಕ)",
    consentBefore: "ಉದ್ಯೋಗಾವಕಾಶಗಳ ಬಗ್ಗೆ ನನ್ನನ್ನು ಸಂಪರ್ಕಿಸಲು ಮತ್ತು ನೇಮಕಾತಿಗಾಗಿ ಸಂಬಂಧಿತ ಉದ್ಯೋಗದಾತರೊಂದಿಗೆ ನನ್ನ ವಿವರಗಳು ಹಾಗೂ ಸ್ವವಿವರ ಪತ್ರವನ್ನು ಹಂಚಿಕೊಳ್ಳಲು ಬ್ರದರ್ಸ್ ವರ್ಕ್‌ಫೋರ್ಸ್ ಸೊಲ್ಯೂಷನ್ಸ್‌ಗೆ ನಾನು ಒಪ್ಪಿಗೆ ನೀಡುತ್ತೇನೆ. ", privacy: "ಗೌಪ್ಯತಾ ಸೂಚನೆ", consentAfter: " ಓದಿ.",
    applyNow: "ಅರ್ಜಿ ಸಲ್ಲಿಸಿ", registering: "ಉದ್ಯೋಗಕ್ಕಾಗಿ ನೋಂದಾಯಿಸಿ", appliedFor: "ಅರ್ಜಿ ಸಲ್ಲಿಸುತ್ತಿರುವ ಉದ್ಯೋಗ", another: "ಮತ್ತೊಬ್ಬ ಅಭ್ಯರ್ಥಿಯನ್ನು ನೋಂದಾಯಿಸಿ", successJob: "ಅರ್ಜಿ ಸಲ್ಲಿಸಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು. ನಮ್ಮ ನೇಮಕಾತಿ ತಂಡ ನಿಮ್ಮ ವಿವರಗಳನ್ನು ಪರಿಶೀಲಿಸುತ್ತದೆ.", successGeneral: "ನೋಂದಾಯಿಸಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು. ಸೂಕ್ತ ಉದ್ಯೋಗಾವಕಾಶ ಲಭ್ಯವಾದಾಗ ನಮ್ಮ ತಂಡ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತದೆ.",
    requiredError: "ಕಡ್ಡಾಯ ವಿವರಗಳನ್ನು ಭರ್ತಿ ಮಾಡಿ", consentError: "ನಿಮ್ಮ ವಿವರಗಳ ನೇಮಕಾತಿ ಬಳಕೆಗೆ ಒಪ್ಪಿಗೆ ನೀಡಿ", submitError: "ಅರ್ಜಿ ಸಲ್ಲಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", resumeTooLarge: "ಸ್ವವಿವರ ಪತ್ರವು 2 MB ಅಥವಾ ಅದಕ್ಕಿಂತ ಕಡಿಮೆ ಇರಬೇಕು", savedWithoutResume: "ಅರ್ಜಿಯನ್ನು ಉಳಿಸಲಾಗಿದೆ, ಆದರೆ ಸ್ವವಿವರ ಪತ್ರವನ್ನು ಅಪ್‌ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ಅದನ್ನು ಕಳುಹಿಸಲು ನಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸಿ.", submitted: "ಅರ್ಜಿಯನ್ನು ಯಶಸ್ವಿಯಾಗಿ ಸಲ್ಲಿಸಲಾಗಿದೆ",
    removalBefore: "ನಿಮ್ಮ ವಿವರಗಳ ಬಗ್ಗೆ ಪ್ರಶ್ನೆಗಳಿದ್ದರೆ ಅಥವಾ ಅವುಗಳನ್ನು ತೆಗೆದುಹಾಕಲು ಬಯಸಿದರೆ, ಇಮೇಲ್ ಮಾಡಿ: ",
  },
} as const;

export function useCandidateLanguage(): [CandidateLanguage, (language: CandidateLanguage) => void] {
  return useSiteLanguage();
}
