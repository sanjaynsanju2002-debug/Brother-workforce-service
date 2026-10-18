import { describe, expect, it } from "vitest";
import { searchJobs } from "./jobSearch";
import type { Job } from "@/types";

const jobs: Job[] = [
  { id: "assembler", title: "Assembler", title_kn: "ಅಸೆಂಬ್ಲರ್", location: "Mysore ", qualification: "ITI ", shift: "Rotational Shift ", skill_category: "Skilled", openings: 20, active: true, created_at: "2026-10-10" },
  { id: "helper", title: "General worker", location: "Hebbal Mysore", shift: "General shift", skill_category: "General Worker", openings: 5, active: true, created_at: "2026-10-10" },
];
const empty = { search: "", location: "", qualification: "", shift: "" };

describe("job search with existing listings", () => {
  it("finds the rotational role when saved metadata has extra spaces", () => {
    expect(searchJobs(jobs, { ...empty, shift: "Rotational Shift" }).map((j) => j.id)).toEqual(["assembler"]);
    expect(searchJobs(jobs, { ...empty, location: "Mysore", qualification: "ITI" }).map((j) => j.id)).toEqual(["assembler"]);
  });
  it("supports Kannada and case-insensitive searches with combined filters", () => {
    expect(searchJobs(jobs, { ...empty, search: "ಅಸೆಂಬ್ಲರ್" }).map((j) => j.id)).toEqual(["assembler"]);
    expect(searchJobs(jobs, { ...empty, search: "ASSEMBLER", shift: "General shift" })).toEqual([]);
    expect(searchJobs(jobs, empty)).toHaveLength(2);
  });
});
