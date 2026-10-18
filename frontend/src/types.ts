// Hand-written mirrors of backend/models/bws.py — keep both sides in sync in one edit.

export interface WorkerCreate {
  full_name: string;
  mobile: string;
  email?: string | null;
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
  job_id?: string | null;
  consent_to_share?: boolean;
}

export interface Worker extends WorkerCreate {
  id: string;
  job_title?: string | null;
  resume_filename?: string | null;
  source: string;
  status: string;
  created_at: string;
}

export interface CompanyRequestCreate {
  company_name: string;
  contact_person: string;
  designation?: string | null;
  mobile: string;
  email?: string | null;
  company_location: string;
  industry?: string | null;
  workforce_type?: string | null;
  job_role: string;
  worker_count: string;
  shift_details?: string | null;
  joining_date?: string | null;
  work_location?: string | null;
  description?: string | null;
}

export interface CompanyRequest extends CompanyRequestCreate {
  reference?: string | null;
  id: string;
  status: string;
  created_at: string;
}

export interface JobCreate {
  title_kn?: string | null;
  location_kn?: string | null;
  experience_kn?: string | null;
  shift_kn?: string | null;
  qualification?: string | null;
  qualification_kn?: string | null;
  working_hours?: string | null;
  working_hours_kn?: string | null;
  benefits?: string | null;
  benefits_kn?: string | null;
  salary_basis?: string | null;
  schema_ready?: boolean;
  title: string;
  location: string;
  skill_category: string;
  experience?: string | null;
  salary?: string | null;
  shift?: string | null;
  openings: number;
  description?: string | null;
  description_kn?: string | null;
  closing_date?: string | null;
  employer_name?: string | null;
}

export interface Job extends JobCreate {
  id: string;
  active: boolean;
  created_at: string;
  updated_at?: string | null;
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

export interface ClientCreate {
  name: string;
  billing_address?: string | null;
  gstin?: string | null;
  industry?: string | null;
  location?: string | null;
  headcount?: string | null;
  service_summary?: string | null;
  outcome?: string | null;
  visible: boolean;
}

export interface Client extends ClientCreate {
  archived: boolean;
  id: string;
  logo_filename?: string | null;
  sort_order: number;
  created_at: string;
}

export interface TrafficStats {
  visits_total: number;
  visits_today: number;
  visits_week: number;
  workers_total: number;
  workers_today: number;
  requests_total: number;
  requests_today: number;
}

export interface WorkerFilters {
  skill_categories: string[];
  locations: string[];
  availabilities: string[];
}

export interface ShortlistCreate {
  name: string;
  request_id?: string | null;
  notes?: string | null;
}

export interface Shortlist extends ShortlistCreate {
  id: string;
  worker_ids: string[];
  created_at: string;
}

export interface DayPoint {
  date: string;
  visits: number;
  applications: number;
  requests: number;
}

export interface SecurityInfo {
  is_default: boolean;
}

export interface JobApplicationCount {
  job_id: string;
  title: string;
  applications: number;
}

export interface EnquiryAging {
  pending_total: number;
  older_than_2_days: number;
  oldest_days: number;
}
