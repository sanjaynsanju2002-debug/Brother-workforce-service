import { describe, expect, it } from "vitest";
import { filterTalents, matchesQualification } from "./talentSearch";
import type { Worker } from "@/types";

const candidate = (id: string, education: string | null, changes: Partial<Worker> = {}): Worker => ({
  id, education, full_name: `Example ${id}`, mobile: "9876543210", current_location: "Mysuru",
  skill_category: "Skilled", source: "Talent Bank", status: "Available", created_at: "2026-10-18", ...changes,
});
const empty = { search: "", region: "", qualification: "" as const };

describe("candidate qualifications", () => {
  it("recognises common school qualifications and dotted ITI abbreviations", () => {
    expect(matchesQualification("10th Standard", "sslc")).toBe(true);
    expect(matchesQualification("S.S.L.C.", "sslc")).toBe(true);
    expect(matchesQualification("PUC - Commerce", "puc")).toBe(true);
    expect(matchesQualification("12th / HSC", "puc")).toBe(true);
    expect(matchesQualification("I.T.I. - Electrician", "iti")).toBe(true);
    expect(matchesQualification("Political Science", "iti")).toBe(false);
    expect(matchesQualification("Diploma in Mechanical Engineering", "diploma")).toBe(true);
  });
  it("finds degree abbreviations without confusing missing details with qualifications", () => {
    for (const value of ["B.Com.", "B Sc", "B.E. Mechanical", "B.Tech", "Bachelor of Arts", "MBA"])
      expect(matchesQualification(value, "degree")).toBe(true);
    expect(matchesQualification("M.B.A. - Finance", "postgraduate")).toBe(true);
    expect(matchesQualification("B.Com.", "postgraduate")).toBe(false);
    expect(matchesQualification("Yet to be provided", "degree")).toBe(false);
    expect(matchesQualification(null, "degree")).toBe(false);
  });
  it("lets the user find missing and custom qualifications", () => {
    for (const value of [null, undefined, "", " ", "Not provided", "N/A"])
      expect(matchesQualification(value, "missing")).toBe(true);
    expect(matchesQualification("Below SSLC", "missing")).toBe(false);
    expect(matchesQualification("Below SSLC", "sslc")).toBe(false);
    expect(matchesQualification("Below SSLC", "other")).toBe(true);
    expect(matchesQualification("ITI - Fitter (pursuing)", "iti")).toBe(false);
    expect(matchesQualification("ITI - Fitter (pursuing)", "other")).toBe(true);
    expect(matchesQualification("No formal qualification", "other")).toBe(true);
    expect(matchesQualification("Certificate in Welding", "other")).toBe(true);
  });
  it("combines qualification, trade search and region while preserving saved text", () => {
    const talents = [
      candidate("fitter", "I.T.I. - Fitter", { preferred_location: "Mysuru" }),
      candidate("electrician", "ITI - Electrician", { current_location: "Bengaluru", preferred_location: null }),
      candidate("commerce", "B.Com."),
    ];
    expect(filterTalents(talents, { search: "ITI fitter", region: "mysuru", qualification: "iti" }).map((t) => t.id)).toEqual(["fitter"]);
    expect(filterTalents(talents, { ...empty, region: "BENGALURU", qualification: "iti" }).map((t) => t.id)).toEqual(["electrician"]);
    expect(talents[0].education).toBe("I.T.I. - Fitter");
  });
  it("searches qualifications and formatted phone numbers", () => {
    const talents = [candidate("commerce", "B.Com.", { mobile: "+91 98765 43210" })];
    expect(filterTalents(talents, { ...empty, search: "B.Com" })).toHaveLength(1);
    expect(filterTalents(talents, { ...empty, search: "9876543210" })).toHaveLength(1);
    expect(filterTalents(talents, { ...empty, search: "Diploma" })).toHaveLength(0);
  });
});
