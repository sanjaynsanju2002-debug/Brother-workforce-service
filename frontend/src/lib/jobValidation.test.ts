import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { missingJobDetails } from "./jobContent";
import { jobSaveError, jobValidationError, missingJobSearchDetails } from "./jobValidation";
import type { JobCreate } from "@/types";

export const completedCandidateJob: JobCreate = {
  title: "Customer service agent", location: "Mysore", skill_category: "Skilled", openings: 2,
  salary: "16000", salary_basis: "Gross monthly", qualification: "Degree or equivalent experience",
  working_hours: "8 hours/day, 6 days/week", benefits: "Confirm with the hiring team",
  description: "Handle customer queries, record requests accurately, follow the service process and communicate clearly with the team. ".repeat(2),
  description_kn: "ಗ್ರಾಹಕರ ಪ್ರಶ್ನೆಗಳಿಗೆ ಸಹಾಯ ಮಾಡಿ, ವಿವರಗಳನ್ನು ದಾಖಲಿಸಿ ಮತ್ತು ತಂಡದೊಂದಿಗೆ ಸಂವಹನ ಮಾಡಿ.",
  employer_name: "", schema_ready: true,
};

describe("job search verification", () => {
  it("identifies the hiring company even when all candidate detail fields are filled", () => {
    expect(missingJobDetails(completedCandidateJob)).toEqual([]);
    expect(missingJobSearchDetails(completedCandidateJob)).toEqual(["hiring company"]);
    expect(jobValidationError(completedCandidateJob, true)).toContain("hiring company");
  });
  it("allows a website listing with a confidential employer when verification is off", () => {
    expect(jobValidationError({ ...completedCandidateJob, schema_ready: false }, true)).toBeNull();
    expect(jobValidationError({ ...completedCandidateJob, employer_name: "Example company" }, true)).toBeNull();
  });
  it("checks the full description and whitespace-only search requirements", () => {
    const missing = missingJobSearchDetails({ ...completedCandidateJob, employer_name: "Company", working_hours: " ", qualification: "\t", description: "Brief role" });
    expect(missing).toEqual(["qualification / eligibility", "working hours / days", "full job description (at least 100 characters)"]);
    expect(jobValidationError({ ...completedCandidateJob, openings: 0 }, true)).toBe("Enter at least 1 opening");
  });
  it("shows server validation messages instead of a generic save error", () => {
    expect(jobSaveError(new ApiError(422, { detail: [{ msg: "Value error, Hiring company is required", loc: ["body"] }] }))).toBe("Hiring company is required");
    expect(jobSaveError(new ApiError(409, { detail: "This job changed. Reload before editing." }))).toBe("This job changed. Reload before editing.");
    expect(jobSaveError(new ApiError(401, null))).toContain("Sign in again");
    expect(jobSaveError(new Error("network"))).toBe("Could not save the job. Please try again.");
  });
});
