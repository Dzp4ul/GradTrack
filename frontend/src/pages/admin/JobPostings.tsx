import { FormEvent, useCallback, useMemo, useState, useEffect, type ReactNode } from 'react';
import { Archive, Briefcase, Edit2, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import MessageBox from '../../components/MessageBox';
import { API_ENDPOINTS } from '../../config/api';

type JobType = 'full_time' | 'part_time' | 'contract' | 'internship' | 'remote';

interface AdminJobPost {
  id: number;
  title: string;
  company: string;
  location?: string | null;
  salary_range?: string | null;
  job_type: JobType;
  industry?: string | null;
  description: string;
  qualifications?: string | null;
  required_skills?: string | null;
  course_program_fit?: string | null;
  application_deadline?: string | null;
  contact_email?: string | null;
  application_link?: string | null;
  application_method?: string | null;
  requirements_file_path?: string | null;
  requirements_file_name?: string | null;
  is_active: number;
  approval_status: 'pending' | 'approved' | 'declined';
  created_at?: string | null;
  updated_at?: string | null;
}

interface JobForm {
  id?: number;
  title: string;
  company: string;
  location: string;
  salary_range: string;
  job_type: JobType;
  industry: string;
  description: string;
  qualifications: string;
  required_skills: string;
  course_program_fit: string;
  application_deadline: string;
  contact_email: string;
  application_link: string;
  application_method: string;
  is_active: boolean;
}

interface JobsResponse {
  success: boolean;
  data?: AdminJobPost | AdminJobPost[];
  error?: string;
  message?: string;
}

const emptyForm: JobForm = {
  title: '',
  company: '',
  location: '',
  salary_range: '',
  job_type: 'full_time',
  industry: '',
  description: '',
  qualifications: '',
  required_skills: '',
  course_program_fit: '',
  application_deadline: '',
  contact_email: '',
  application_link: '',
  application_method: '',
  is_active: true,
};

const inputClass = 'mt-1.5 w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

function normalizeDateInput(value?: string | null) {
  if (!value) return '';
  return value.slice(0, 10);
}

function formatDate(value?: string | null) {
  if (!value) return 'No deadline';
  const parsed = new Date(value.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function employmentTypeLabel(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formFromJob(job: AdminJobPost): JobForm {
  return {
    id: job.id,
    title: job.title || '',
    company: job.company || '',
    location: job.location || '',
    salary_range: job.salary_range || '',
    job_type: job.job_type || 'full_time',
    industry: job.industry || '',
    description: job.description || '',
    qualifications: job.qualifications || '',
    required_skills: job.required_skills || '',
    course_program_fit: job.course_program_fit || '',
    application_deadline: normalizeDateInput(job.application_deadline),
    contact_email: job.contact_email || '',
    application_link: job.application_link || '',
    application_method: job.application_method || '',
    is_active: Boolean(job.is_active),
  };
}

function jobPayload(form: JobForm, requirementsFile?: File | null) {
  const payload = new FormData();
  payload.append('title', form.title.trim());
  payload.append('company', form.company.trim());
  payload.append('location', form.location.trim());
  payload.append('salary_range', form.salary_range.trim());
  payload.append('job_type', form.job_type);
  payload.append('industry', form.industry.trim());
  payload.append('description', form.description.trim());
  payload.append('qualifications', form.qualifications.trim());
  payload.append('required_skills', form.required_skills.trim());
  payload.append('course_program_fit', form.course_program_fit.trim());
  payload.append('application_deadline', form.application_deadline);
  payload.append('contact_email', form.contact_email.trim());
  payload.append('application_link', form.application_link.trim());
  payload.append('application_method', form.application_method.trim());
  payload.append('is_active', form.is_active ? '1' : '0');
  if (requirementsFile) payload.append('requirements_file', requirementsFile);
  if (form.id) {
    payload.append('id', String(form.id));
    payload.append('_method', 'PUT');
  }
  return payload;
}

async function jobsRequest(options?: RequestInit, suffix = ''): Promise<JobsResponse> {
  const response = await fetch(`${API_ENDPOINTS.JOBS.POSTS}${suffix}`, {
    credentials: 'include',
    ...options,
  });
  const data = await response.json() as JobsResponse;
  if (!response.ok || !data.success) throw new Error(data.error || 'Unable to process the job posting request.');
  return data;
}

export default function JobPostings() {
  const [jobs, setJobs] = useState<AdminJobPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<JobForm>(emptyForm);
  const [requirementsFile, setRequirementsFile] = useState<File | null>(null);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'warning' | 'confirm';
    title?: string;
    message: string;
    confirmText?: string;
    onConfirm?: () => void;
  }>({ isOpen: false, type: 'success', message: '' });

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await jobsRequest(undefined, '?mine=1&include_inactive=1');
      setJobs(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      setMessage({
        isOpen: true,
        type: 'error',
        title: 'Jobs Unavailable',
        message: error instanceof Error ? error.message : 'Unable to load job postings.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const filteredJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return jobs;
    return jobs.filter((job) => [
      job.title, job.company, job.location, job.industry, job.description,
      job.qualifications, job.required_skills, job.course_program_fit,
    ].join(' ').toLowerCase().includes(query));
  }, [jobs, search]);

  const openCreate = () => {
    setForm(emptyForm);
    setRequirementsFile(null);
    setFormOpen(true);
  };

  const openEdit = (job: AdminJobPost) => {
    setForm(formFromJob(job));
    setRequirementsFile(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    if (saving) return;
    setFormOpen(false);
    setForm(emptyForm);
    setRequirementsFile(null);
  };

  const validateForm = (candidate: JobForm) => {
    if (!candidate.title.trim() || !candidate.company.trim() || !candidate.description.trim()) {
      return 'Job title, company, and description are required.';
    }
    if (!candidate.contact_email.trim() && !candidate.application_link.trim() && !candidate.application_method.trim()) {
      return 'Add a contact email, application link, or application instructions.';
    }
    return '';
  };

  const saveJob = async (candidate: JobForm, file: File | null = null) => {
    const validationError = validateForm(candidate);
    if (validationError) throw new Error(validationError);
    const response = await jobsRequest({ method: 'POST', body: jobPayload(candidate, file) });
    const saved = !Array.isArray(response.data) ? response.data : undefined;
    if (saved) {
      setJobs((current) => [saved, ...current.filter((job) => job.id !== saved.id)]);
    } else {
      await loadJobs();
    }
    return response;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await saveJob(form, requirementsFile);
      setFormOpen(false);
      setForm(emptyForm);
      setRequirementsFile(null);
      setMessage({
        isOpen: true,
        type: 'success',
        title: form.id ? 'Job Updated' : (form.is_active ? 'Job Published' : 'Draft Saved'),
        message: response.message || 'The job posting was saved successfully.',
      });
    } catch (error) {
      setMessage({
        isOpen: true,
        type: 'error',
        title: 'Job Not Saved',
        message: error instanceof Error ? error.message : 'Unable to save the job posting.',
      });
    } finally {
      setSaving(false);
    }
  };

  const archiveJob = (job: AdminJobPost) => {
    setMessage({
      isOpen: true,
      type: 'confirm',
      title: 'Archive Job Posting?',
      message: `Archive “${job.title}”? It will immediately disappear from Graduate Browse Jobs.`,
      confirmText: 'Archive',
      onConfirm: () => {
        void (async () => {
          try {
            await saveJob({ ...formFromJob(job), is_active: false });
            setMessage({ isOpen: true, type: 'success', title: 'Job Archived', message: 'The job is no longer visible to graduates.' });
          } catch (error) {
            setMessage({ isOpen: true, type: 'error', title: 'Archive Failed', message: error instanceof Error ? error.message : 'Unable to archive this job.' });
          }
        })();
      },
    });
  };

  const deleteJob = (job: AdminJobPost) => {
    setMessage({
      isOpen: true,
      type: 'confirm',
      title: 'Delete Job Posting?',
      message: `Permanently delete “${job.title}”? This cannot be undone.`,
      confirmText: 'Delete',
      onConfirm: () => {
        void (async () => {
          try {
            await jobsRequest({
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: job.id }),
            });
            setJobs((current) => current.filter((item) => item.id !== job.id));
          } catch (error) {
            setMessage({ isOpen: true, type: 'error', title: 'Delete Failed', message: error instanceof Error ? error.message : 'Unable to delete this job.' });
          }
        })();
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Alumni Administration</p>
          <h1 className="mt-1 text-2xl font-bold text-[#1b2a4a]">Job Postings</h1>
          <p className="mt-1 text-sm text-gray-500">Create and manage jobs published directly to Graduate Browse Jobs.</p>
        </div>
        <button type="button" onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800">
          <Plus className="h-4 w-4" /> Create Job
        </button>
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search managed job postings" className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-500" />
      </div>

      {loading ? (
        <div className="flex min-h-64 items-center justify-center rounded-2xl border bg-white text-gray-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading job postings...</div>
      ) : filteredJobs.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white px-6 py-14 text-center"><Briefcase className="mx-auto h-10 w-10 text-gray-300" /><h2 className="mt-4 font-bold text-gray-800">No job postings found</h2><p className="mt-1 text-sm text-gray-500">Create a job to publish it in the Graduate Portal.</p></div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredJobs.map((job) => (
            <article key={job.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div><h2 className="text-lg font-bold text-[#1b2a4a]">{job.title}</h2><p className="text-sm text-gray-500">{job.company}</p></div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${job.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{job.is_active ? 'Published' : 'Archived'}</span>
              </div>
              <div className="mt-4 grid gap-2 text-sm text-gray-600 sm:grid-cols-2"><p><strong>Type:</strong> {employmentTypeLabel(job.job_type)}</p><p><strong>Location:</strong> {job.location || 'Not specified'}</p><p><strong>Salary:</strong> {job.salary_range || 'Not specified'}</p><p><strong>Deadline:</strong> {formatDate(job.application_deadline)}</p></div>
              <p className="mt-4 line-clamp-3 whitespace-pre-line text-sm leading-6 text-gray-600">{job.description}</p>
              <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
                <button type="button" onClick={() => openEdit(job)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"><Edit2 className="h-4 w-4" /> Edit</button>
                {job.is_active === 1 && <button type="button" onClick={() => archiveJob(job)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50"><Archive className="h-4 w-4" /> Archive</button>}
                <button type="button" onClick={() => deleteJob(job)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 px-4 py-6">
          <form onSubmit={handleSubmit} className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold text-[#1b2a4a]">{form.id ? 'Edit Job Posting' : 'Create Job Posting'}</h2><p className="text-sm text-gray-500">Published jobs are immediately available to logged-in graduates.</p></div><button type="button" onClick={closeForm} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close"><X className="h-5 w-5" /></button></div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Field label="Job Title" required><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className={inputClass} /></Field>
              <Field label="Company" required><input value={form.company} onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))} className={inputClass} /></Field>
              <Field label="Location"><input value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} className={inputClass} /></Field>
              <Field label="Salary Range"><input value={form.salary_range} onChange={(event) => setForm((current) => ({ ...current, salary_range: event.target.value }))} className={inputClass} /></Field>
              <Field label="Employment Type"><select value={form.job_type} onChange={(event) => setForm((current) => ({ ...current, job_type: event.target.value as JobType }))} className={inputClass}><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="contract">Contract</option><option value="internship">Internship</option><option value="remote">Remote</option></select></Field>
              <Field label="Industry"><input value={form.industry} onChange={(event) => setForm((current) => ({ ...current, industry: event.target.value }))} className={inputClass} /></Field>
            </div>
            <div className="mt-4"><Field label="Description" required><textarea rows={5} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className={inputClass} /></Field></div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Qualifications / Requirements"><textarea rows={4} value={form.qualifications} onChange={(event) => setForm((current) => ({ ...current, qualifications: event.target.value }))} className={inputClass} /></Field>
              <Field label="Required Skills"><textarea rows={4} value={form.required_skills} onChange={(event) => setForm((current) => ({ ...current, required_skills: event.target.value }))} className={inputClass} /></Field>
              <Field label="Course / Program Fit"><textarea rows={3} value={form.course_program_fit} onChange={(event) => setForm((current) => ({ ...current, course_program_fit: event.target.value }))} className={inputClass} /></Field>
              <Field label="Application Instructions"><textarea rows={3} value={form.application_method} onChange={(event) => setForm((current) => ({ ...current, application_method: event.target.value }))} className={inputClass} /></Field>
              <Field label="Application Deadline"><input type="date" value={form.application_deadline} onChange={(event) => setForm((current) => ({ ...current, application_deadline: event.target.value }))} className={inputClass} /></Field>
              <Field label="Contact Email"><input type="email" value={form.contact_email} onChange={(event) => setForm((current) => ({ ...current, contact_email: event.target.value }))} className={inputClass} /></Field>
              <Field label="Application Link"><input type="url" value={form.application_link} onChange={(event) => setForm((current) => ({ ...current, application_link: event.target.value }))} className={inputClass} placeholder="https://" /></Field>
              <Field label="Requirements File"><input type="file" accept=".pdf,.docx,.png,.jpg,.jpeg" onChange={(event) => setRequirementsFile(event.target.files?.[0] || null)} className={inputClass} />{form.id && jobs.find((job) => job.id === form.id)?.requirements_file_name && <span className="mt-1 block text-xs text-gray-500">Current: {jobs.find((job) => job.id === form.id)?.requirements_file_name}</span>}</Field>
            </div>
            <label className="mt-5 flex items-center gap-3 rounded-xl border bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))} /> Publish this job in Graduate Browse Jobs</label>
            <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={closeForm} className="rounded-xl border px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50">Cancel</button><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{form.is_active ? 'Publish Job' : 'Save Inactive'}</button></div>
          </form>
        </div>
      )}

      <MessageBox isOpen={message.isOpen} onClose={() => setMessage((current) => ({ ...current, isOpen: false }))} onConfirm={message.onConfirm} type={message.type} title={message.title} message={message.message} confirmText={message.confirmText} />
    </div>
  );
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: ReactNode }) {
  return <label className="block text-sm font-bold text-gray-700">{label}{required && <span className="text-red-500"> *</span>}{children}</label>;
}
