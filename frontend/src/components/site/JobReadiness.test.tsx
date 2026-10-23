import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CandidateDetailsStatus, JobSearchVerification } from "./JobReadiness";
import type { JobCreate } from "@/types";

const job: JobCreate = {
  title: "Assembler", location: "Mysore", skill_category: "General Worker", openings: 20,
  salary: "16000", salary_basis: "Gross monthly", qualification: "Discuss during screening",
  description: "Assemble components, follow work instructions and inspect completed items. ".repeat(3),
  description_kn: "ಬಿಡಿಭಾಗಗಳನ್ನು ಜೋಡಿಸಿ ಮತ್ತು ಗುಣಮಟ್ಟವನ್ನು ಪರಿಶೀಲಿಸಿ.",
  working_hours: "8 hours/day", benefits: "Discuss during screening", employer_name: "", schema_ready: true,
};

describe("job form readiness messages", () => {
  it("shows a completed status without a contradictory missing-details warning", () => {
    const html = renderToStaticMarkup(<CandidateDetailsStatus job={job} />);
    expect(html).toContain("All candidate detail fields are filled");
    expect(html).toContain("bg-green-50");
    expect(html).not.toContain("details to complete");
    expect(html).not.toContain("bg-amber-50");
  });
  it("names missing candidate details and the separate job search requirement", () => {
    const candidate = renderToStaticMarkup(<CandidateDetailsStatus job={{ ...job, working_hours: "" }} />);
    expect(candidate).toContain("Candidate details to complete: working hours");
    const search = renderToStaticMarkup(<JobSearchVerification job={job} onChange={() => {}} />);
    expect(search).toContain("Job search details to complete: hiring company");
    expect(search).toContain("you can still save the job on your website");
    const optional = renderToStaticMarkup(<JobSearchVerification job={{ ...job, schema_ready: false }} onChange={() => {}} />);
    expect(optional).not.toContain('role="alert"');
  });
});
