// Hand-written mirrors of backend/models/bws.py — keep both sides in sync in one edit.

export interface WorkerCreate {
  full_name: string;
  mobile: string;
  whatsapp?: string | null;
  age?: string | null;
  gender?: string | null;
  current_location: string;
  education?: string | null;
  experience?: string | null;
  skill_category: string;
  skills?: string | null;
  previous_experience?: string | null;
  preferred_location?: string | null;
  expected_salary?: string | null;
  availability?: string | null;
}

export interface Worker extends WorkerCreate {
  id: string;
  resume_filename?: string | null;
  status: string;
  created_at: string;
}

export interface CompanyRequestCreate {
  company_name: string;
  contact_person: string;
  designation?: string | null;
  mobile: string;
  email: string;
  company_location: string;
  industry: string;
  workforce_type: string;
  job_role: string;
  worker_count: string;
  shift_details?: string | null;
  joining_date?: string | null;
  work_location?: string | null;
  description?: string | null;
}

export interface CompanyRequest extends CompanyRequestCreate {
  id: string;
  status: string;
  created_at: string;
}

export interface JobCreate {
  title: string;
  location: string;
  skill_category: string;
  experience?: string | null;
  salary?: string | null;
  shift?: string | null;
  openings: number;
  description?: string | null;
}

export interface Job extends JobCreate {
  id: string;
  active: boolean;
  created_at: string;
}

export interface AdminStats {
  workers: number;
  requests: number;
  open_requests: number;
  active_jobs: number;
  email_configured: boolean;
}

export interface Ok {
  ok: boolean;
}

export interface DnsRecord {
  record?: string | null;
  name?: string | null;
  type?: string | null;
  ttl?: string | null;
  status?: string | null;
  value?: string | null;
  priority?: number | null;
}

export interface EmailDomain {
  id: string;
  name: string;
  status: string;
  region?: string | null;
  created_at?: string | null;
  records: DnsRecord[];
}

export interface EmailStatus {
  key_configured: boolean;
  sender: string;
  recipients: string[];
  using_shared_sender: boolean;
  key_restricted: boolean;
  domains: EmailDomain[];
  error?: string | null;
}

export interface TestEmailResult {
  ok: boolean;
  email_id?: string | null;
  sent_to: string[];
  detail?: string | null;
}
