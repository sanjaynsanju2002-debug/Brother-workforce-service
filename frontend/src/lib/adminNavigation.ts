export const adminGroups = [
  { label: "Your day", tabs: [["overview", "Overview"]] },
  { label: "Recruitment", tabs: [["workers", "Worker Applications"], ["talents", "Talent Bank"], ["requests", "Company Enquiries"], ["requirements", "Staffing Requirements"], ["jobs", "Job Postings"], ["shortlists", "Shortlists"], ["recruitment", "Recruitment Progress"]] },
  { label: "Workforce", tabs: [["workforce", "Company Workforce"], ["attendance", "Attendance Tracker"], ["documents", "Documents & Reminders"], ["clients", "Clients"]] },
  { label: "Finance", tabs: [["payroll", "Payroll"], ["salary-payments", "Salary Payments"], ["invoices", "Invoices"], ["expenses", "Expenses"], ["profit-loss", "Profit & Loss"], ["company-profitability", "Company Profitability"]] },
  { label: "Administration", tabs: [["email", "Email Settings"], ["activity", "Staff Activity"], ["security", "Security"]] },
];
export function allowedTab(role: string | undefined, tab: string) {
  if (role === "owner") return true;
  if (!role) return false;
  if (tab === "security") return true;
  if (role === "attendance") return tab === "attendance";
  if (role === "finance") return adminGroups[3].tabs.some(([key]) => key === tab) || tab === "attendance";
  if (["operator", "viewer"].includes(role)) return ["workers", "talents", "requests", "requirements", "jobs", "shortlists", "recruitment", "workforce", "attendance", "documents", "clients"].includes(tab);
  return role === "recruiter" && ["workers", "talents", "requests", "requirements", "jobs", "shortlists", "recruitment", "documents"].includes(tab);
}
