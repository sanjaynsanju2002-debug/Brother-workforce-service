import { BRAND, INDUSTRIES } from "@/lib/brand";
import type { Client, Job } from "@/types";

export type ChatAction = { label: string; href: string };
export type ChatAnswer = { text: string; actions?: ChatAction[] };

const apply: ChatAction = { label: "Register for jobs", href: "#worker-registration" };
const jobsLink: ChatAction = { label: "See current jobs", href: "#jobs" };
const request: ChatAction = { label: "Request manpower", href: "#manpower-request" };
const services: ChatAction = { label: "Explore services", href: "#services" };
const contact: ChatAction = { label: "Contact us", href: "#contact" };
const whatsapp: ChatAction = { label: "WhatsApp", href: BRAND.whatsapp };

function mentions(question: string, ...terms: string[]) {
  return terms.some((term) => question.includes(term));
}

/** Answers use only approved website facts. No visitor message is sent to a server. */
export function getBusinessAnswer(rawQuestion: string, jobs: Job[] | null, clients: Client[] | null = null): ChatAnswer {
  const q = rawQuestion.toLowerCase().replace(/[^a-z0-9₹]+/g, " ").trim();

  if (mentions(q, "pin", "password", "admin", "login", "log in")) {
    return {
      text: "This public chat cannot help with admin access or security PINs. Please contact the Brothers Workforce Solutions team directly.",
      actions: [contact],
    };
  }

  if (mentions(q, "hello", "hi ", "hey", "good morning", "good evening") || q === "hi") {
    return {
      text: `Hello! I can help with our manpower services, job registration, current openings, compliance and contact details. What would you like to know?`,
      actions: [services, jobsLink, contact],
    };
  }

  if (mentions(q, "fee", "charge", "cost", "price", "pricing", "rate", "quotation", "quote", "commission")) {
    if (mentions(q, "candidate", "applicant", "job seeker", "job", "apply", "application")) {
      return {
        text: "Brothers Workforce Solutions does not request service charges from candidates for job placement. You can register through the worker form, or contact our team if you have a question about an opportunity.",
        actions: [apply, whatsapp],
      };
    }
    return {
      text: "Pricing and other commercial terms for employers depend on the requirement. Please share the role, number of workers, shift and location with our team for a quote.",
      actions: [request, whatsapp],
    };
  }

  if (mentions(q, "salary", "wage", "pay scale", "ctc", "monthly pay")) {
    return {
      text: "Salary depends on the specific role and employer. Current listings show pay where it has been provided. You can also ask our recruitment team about a role.",
      actions: [jobsLink, whatsapp],
    };
  }

  if (mentions(q, "resume", "cv", "upload", "file size", "2 mb", "2mb")) {
    return {
      text: "Use the worker registration form to create your profile and upload a resume. PDF, DOC, DOCX, PNG and JPG files are accepted, up to 2 MB. The upload is optional, so you can still register if your resume is not ready.",
      actions: [apply],
    };
  }

  if (q === "job" || q === "jobs" || mentions(q, "vacancy", "vacancies", "opening", "open positions", "available jobs", "current jobs", "hiring now", "hiring for", "jobs available", "any job", "job in ", "jobs in ")) {
    if (jobs === null) {
      return {
        text: "You can check the live job listings on this page. You may also register your profile for future opportunities.",
        actions: [jobsLink, apply],
      };
    }
    if (jobs.length === 0) {
      return {
        text: "There are no current openings listed on the website. You can still register your profile so our recruitment team can consider you when a matching role opens.",
        actions: [apply],
      };
    }
    const listed = jobs.slice(0, 3).map((job) => `${job.title} (${job.location})`).join("; ");
    const extra = jobs.length > 3 ? `, and ${jobs.length - 3} more` : "";
    return {
      text: `There ${jobs.length === 1 ? "is" : "are"} ${jobs.length} active ${jobs.length === 1 ? "opening" : "openings"}: ${listed}${extra}. See the job details and register your profile to apply.`,
      actions: [jobsLink, apply],
    };
  }

  if (mentions(q, "apply", "application", "register", "find a job", "looking for job", "need a job", "job seeker", "candidate", "iti", "sslc", "puc", "degree", "qualification")) {
    return {
      text: "Job seekers can complete the worker registration form with their location, education, skills and experience. Add a resume if you have one. Our team matches profiles with current and upcoming factory, warehouse and technical roles across Karnataka; each opening may have its own requirements.",
      actions: [apply, jobsLink],
    };
  }

  if (mentions(q, "need workers", "hire workers", "find workers", "supply workers", "manpower requirement", "request manpower", "staffing request", "need staff", "hire staff", "workers for my", "recruit workers")) {
    return {
      text: "Tell us the job role, workforce type, number of workers, shift and work location through the manpower request form. Our team will review your requirement and respond with a deployment plan.",
      actions: [request, whatsapp],
    };
  }

  if (mentions(q, "how does it work", "what is the process", "staffing process", "deployment process", "screening process")) {
    return {
      text: "For employers, the process is: share your requirement, coordinate candidate screening, then plan workforce deployment. For job seekers, create a profile, upload a resume if available, and our team will look for suitable opportunities.",
      actions: [request, apply],
    };
  }

  if (mentions(q, "gst", "esic", "esi", "epf", "pf", "msme", "licensed", "license", "compliance", "provident fund")) {
    return {
      text: `Brothers Workforce Solutions is a licensed labour contractor, GST registered (GST ${BRAND.gst}), MSME registered, and supports ESIC employee coverage and EPF services for deployed workforce. Contact the team for any document or arrangement specific to your requirement.`,
      actions: [{ label: "Compliance details", href: "#compliance" }, contact],
    };
  }

  if (mentions(q, "client", "customers", "partner companies", "companies you work with", "who do you work with")) {
    const publicClients = clients?.filter((client) => client.visible && !/could be here/i.test(client.name)) ?? [];
    if (publicClients.length > 0) {
      const names = publicClients.slice(0, 5).map((client) => client.name).join(", ");
      return {
        text: `Businesses featured on our website include ${names}${publicClients.length > 5 ? " and others" : ""}. Please see the clients section for the currently published list.`,
        actions: [{ label: "Businesses we support", href: "#clients" }, request],
      };
    }
    return {
      text: "Please see the businesses we support on this page, or contact our team for an example relevant to your industry.",
      actions: [{ label: "Businesses we support", href: "#clients" }, contact],
    };
  }

  if (mentions(q, "industry", "industries", "sector", "factory type", "which businesses")) {
    return {
      text: `We support ${INDUSTRIES.join(", ").replace(/, ([^,]*)$/, " and $1").toLowerCase()} across Mysore and Karnataka industrial areas.`,
      actions: [{ label: "Industries served", href: "#industries" }, request],
    };
  }

  if (mentions(q, "skilled", "semi skilled", "general worker", "labour", "labor", "operator", "technician", "electrician", "welder", "fitter", "warehouse", "packaging", "services", "what do you do", "what can you provide")) {
    return {
      text: "We provide skilled, semi-skilled and general workforce supply, contract staffing, and factory and warehouse staffing. Roles include machine operators, technicians, electricians, welders, fitters, production and assembly workers, helpers, packers, loaders and warehouse associates.",
      actions: [services, request],
    };
  }

  if (mentions(q, "where", "location", "located", "address", "mysore", "mysuru", "karnataka", "bangalore", "bengaluru", "area", "city")) {
    return {
      text: `We are based in ${BRAND.location} and provide workforce solutions across Karnataka. The website does not list a street address; please contact the team for directions or availability in a particular location.`,
      actions: [contact, whatsapp],
    };
  }

  if (mentions(q, "contact", "phone", "call", "whatsapp", "email", "human", "person", "talk to", "reach you", "number")) {
    return {
      text: `Reach our workforce desk at ${BRAND.phone} or ${BRAND.email}. You can call, WhatsApp or email about jobs and manpower requirements.`,
      actions: [{ label: "Call", href: `tel:${BRAND.phoneRaw}` }, whatsapp, { label: "Email", href: `mailto:${BRAND.email}` }],
    };
  }

  if (mentions(q, "office hours", "working hours", "opening hours", "when are you open", "timing")) {
    return {
      text: "Office hours are not listed on the website. Please call or WhatsApp the workforce desk to confirm a suitable time.",
      actions: [whatsapp, contact],
    };
  }

  if (mentions(q, "who are you", "about", "company", "business", "brothers workforce")) {
    return {
      text: `${BRAND.name} is a manpower and contract staffing partner based in Mysore. We connect businesses with skilled, semi-skilled and general workers for factories, warehouses, manufacturing and industrial operations across Karnataka.`,
      actions: [{ label: "About us", href: "#about" }, services],
    };
  }

  return {
    text: "I don't have a verified answer for that yet. Our workforce desk can help with specific requirements or questions. You can also ask me about services, jobs, compliance, locations and contact details.",
    actions: [whatsapp, contact],
  };
}
