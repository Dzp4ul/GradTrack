import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Award,
  Building2,
  CalendarDays,
  Check,
  Download,
  ExternalLink,
  Eye,
  FileImage,
  FileText,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { API_ENDPOINTS } from '../../config/api';

export type CredentialStatus = 'uploaded' | 'pending' | 'verified';

export interface GraduateCredential {
  id: number;
  credential_name: string;
  issuing_organization: string;
  issue_date?: string | null;
  expiration_date?: string | null;
  credential_id?: string | null;
  verification_url?: string | null;
  original_file_name: string;
  mime_type: string;
  file_size_bytes: number;
  status: CredentialStatus;
  created_at?: string | null;
  updated_at?: string | null;
}

interface CredentialFormValues {
  credential_name: string;
  issuing_organization: string;
  issue_date: string;
  expiration_date: string;
  credential_id: string;
  verification_url: string;
}

type CredentialFieldErrors = Partial<Record<keyof CredentialFormValues | 'certificate', string>>;

class CredentialApiError extends Error {
  errors: CredentialFieldErrors;

  constructor(message: string, errors: CredentialFieldErrors = {}) {
    super(message);
    this.errors = errors;
  }
}

const maximumCredentialFileBytes = 10 * 1024 * 1024;
const credentialFileAccept = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
const allowedCredentialExtensions = new Set(['pdf', 'jpg', 'jpeg', 'png']);
const allowedCredentialMimeTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);

function credentialFileUrl(credentialId: number, download = false) {
  const params = new URLSearchParams({ id: String(credentialId) });
  params.set(download ? 'download' : 'file', '1');
  return `${API_ENDPOINTS.GRADUATE_CREDENTIALS}?${params.toString()}`;
}

function emptyCredentialForm(): CredentialFormValues {
  return {
    credential_name: '',
    issuing_organization: '',
    issue_date: '',
    expiration_date: '',
    credential_id: '',
    verification_url: '',
  };
}

function credentialToForm(credential?: GraduateCredential | null): CredentialFormValues {
  if (!credential) return emptyCredentialForm();
  return {
    credential_name: credential.credential_name || '',
    issuing_organization: credential.issuing_organization || '',
    issue_date: credential.issue_date || '',
    expiration_date: credential.expiration_date || '',
    credential_id: credential.credential_id || '',
    verification_url: credential.verification_url || '',
  };
}

function formatCredentialBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 'Unknown size';
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function formatCredentialDate(value?: string | null) {
  if (!value) return '';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function credentialExtension(name: string) {
  return name.split('.').pop()?.toLowerCase() || '';
}

function validateCredentialFile(file: File): string | null {
  const extension = credentialExtension(file.name);
  if (!allowedCredentialExtensions.has(extension)) {
    return 'Choose a PDF, JPG, JPEG, or PNG file.';
  }
  if (file.type && !allowedCredentialMimeTypes.has(file.type)) {
    return 'The selected file content type is not supported.';
  }
  if (file.size <= 0) return 'The selected file is empty.';
  if (file.size > maximumCredentialFileBytes) return 'Certificate file must be 10 MB or smaller.';
  return null;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function credentialApiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new CredentialApiError(payload.error || 'Unable to complete the credential request.', payload.errors || {});
  }
  return payload as T;
}

function triggerCredentialDownload(credential: GraduateCredential) {
  const anchor = document.createElement('a');
  anchor.href = credentialFileUrl(credential.id, true);
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export default function CredentialsSection() {
  const [credentials, setCredentials] = useState<GraduateCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [formCredential, setFormCredential] = useState<GraduateCredential | null | undefined>(undefined);
  const [previewCredential, setPreviewCredential] = useState<GraduateCredential | null>(null);
  const [deleteCredential, setDeleteCredential] = useState<GraduateCredential | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const loadCredentials = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const payload = await credentialApiRequest<{ data?: GraduateCredential[] }>(API_ENDPOINTS.GRADUATE_CREDENTIALS);
      setCredentials(Array.isArray(payload.data) ? payload.data : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load credentials.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCredentials();
  }, []);

  const filteredCredentials = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return credentials;
    return credentials.filter((credential) => (
      credential.credential_name.toLocaleLowerCase().includes(query)
      || credential.issuing_organization.toLocaleLowerCase().includes(query)
      || (credential.credential_id || '').toLocaleLowerCase().includes(query)
    ));
  }, [credentials, search]);

  const handleSaved = (saved: GraduateCredential, message: string) => {
    setCredentials((current) => {
      const exists = current.some((credential) => credential.id === saved.id);
      const next = exists
        ? current.map((credential) => (credential.id === saved.id ? saved : credential))
        : [saved, ...current];
      return next.sort((left, right) => {
        const leftDate = left.issue_date || left.created_at || '';
        const rightDate = right.issue_date || right.created_at || '';
        return rightDate.localeCompare(leftDate) || right.id - left.id;
      });
    });
    setFormCredential(undefined);
    setFeedback({ type: 'success', message });
  };

  const handleDelete = async () => {
    if (!deleteCredential || deleting) return;
    setDeleting(true);
    try {
      const payload = await credentialApiRequest<{ message?: string }>(API_ENDPOINTS.GRADUATE_CREDENTIALS, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteCredential.id }),
      });
      setCredentials((current) => current.filter((credential) => credential.id !== deleteCredential.id));
      setDeleteCredential(null);
      setFeedback({ type: 'success', message: payload.message || 'Credential deleted successfully.' });
    } catch (error) {
      setFeedback({ type: 'error', message: error instanceof Error ? error.message : 'Unable to delete credential.' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="min-w-0 rounded-[28px] border border-border bg-surface p-4 shadow-sm sm:p-5 lg:p-6" aria-labelledby="credentials-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:text-blue-300">
              <Award className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 id="credentials-heading" className="text-xl font-bold text-text-primary">Credentials</h2>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
            Add and manage your professional certifications, licenses, and other credentials.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormCredential(null)}
          className="gt-bg-primary inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-sm transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 sm:w-auto dark:focus-visible:ring-blue-900/60"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Credential
        </button>
      </div>

      {feedback && (
        <div
          className={`mt-5 flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:text-emerald-200' : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-700 dark:text-rose-200'}`}
          role="status"
          aria-live="polite"
        >
          <span className="font-semibold">{feedback.message}</span>
          <button type="button" onClick={() => setFeedback(null)} className="shrink-0 rounded-full p-0.5 hover:bg-black/5" aria-label="Dismiss message"><X className="h-4 w-4" /></button>
        </div>
      )}

      {!loading && !loadError && credentials.length > 0 && (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-text-secondary">
            {credentials.length} credential{credentials.length === 1 ? '' : 's'}
          </p>
          <label className="relative block w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            <span className="sr-only">Search credentials</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search credentials..."
              className="field-input min-h-11 pl-10"
            />
          </label>
        </div>
      )}

      {loading ? (
        <CredentialsSkeleton />
      ) : loadError ? (
        <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-7 text-center dark:border-rose-800">
          <p className="text-sm font-semibold text-rose-700 dark:text-rose-200">{loadError}</p>
          <button type="button" onClick={() => void loadCredentials()} className="mt-4 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-bold text-text-primary hover:bg-surface-hover">Try Again</button>
        </div>
      ) : credentials.length === 0 ? (
        <CredentialEmptyState onAdd={() => setFormCredential(null)} />
      ) : filteredCredentials.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-border-strong bg-surface-alt px-5 py-9 text-center">
          <Search className="mx-auto h-7 w-7 text-text-muted" aria-hidden="true" />
          <p className="mt-3 text-sm font-bold text-text-primary">No credentials match “{search.trim()}”.</p>
          <button type="button" onClick={() => setSearch('')} className="mt-3 text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300">Clear search</button>
        </div>
      ) : (
        <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filteredCredentials.map((credential) => (
            <CredentialCard
              key={credential.id}
              credential={credential}
              onView={() => setPreviewCredential(credential)}
              onDownload={() => triggerCredentialDownload(credential)}
              onEdit={() => setFormCredential(credential)}
              onDelete={() => setDeleteCredential(credential)}
            />
          ))}
        </div>
      )}

      {formCredential !== undefined && (
        <CredentialFormModal
          credential={formCredential}
          onClose={() => setFormCredential(undefined)}
          onSaved={handleSaved}
        />
      )}
      {previewCredential && (
        <CredentialPreviewModal
          credential={previewCredential}
          onClose={() => setPreviewCredential(null)}
          onDownload={() => triggerCredentialDownload(previewCredential)}
        />
      )}
      {deleteCredential && (
        <CredentialDeleteModal
          credential={deleteCredential}
          deleting={deleting}
          onClose={() => !deleting && setDeleteCredential(null)}
          onDelete={() => void handleDelete()}
        />
      )}
    </section>
  );
}

function CredentialsSkeleton() {
  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading credentials" aria-busy="true">
      {[0, 1, 2].map((item) => (
        <div key={item} className="animate-pulse overflow-hidden rounded-2xl border border-border bg-surface-alt">
          <div className="h-36 bg-surface-muted" />
          <div className="space-y-3 p-4"><div className="h-5 w-4/5 rounded bg-surface-muted" /><div className="h-4 w-3/5 rounded bg-surface-muted" /><div className="h-12 rounded-xl bg-surface-muted" /></div>
        </div>
      ))}
    </div>
  );
}

function CredentialEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-border-strong bg-surface-alt px-5 py-10 text-center">
      <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:text-blue-300">
        <FileText className="h-7 w-7" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-base font-bold text-text-primary">No credentials added yet.</h3>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-text-secondary">Add certifications, licenses, or other professional credentials to your profile.</p>
      <button type="button" onClick={onAdd} className="gt-bg-primary mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white">
        <Plus className="h-4 w-4" /> Add Credential
      </button>
    </div>
  );
}

function CredentialCard({
  credential,
  onView,
  onDownload,
  onEdit,
  onDelete,
}: {
  credential: GraduateCredential;
  onView: () => void;
  onDownload: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isImage = credential.mime_type.startsWith('image/');
  const statusClasses: Record<CredentialStatus, string> = {
    uploaded: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-700 dark:text-blue-200',
    pending: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700 dark:text-amber-200',
    verified: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:text-emerald-200',
  };

  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeMenu);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  return (
    <article className="flex min-w-0 flex-col overflow-visible rounded-2xl border border-border bg-surface-alt shadow-sm transition hover:border-border-strong hover:shadow-md">
      <button type="button" onClick={onView} className="group relative block h-36 w-full overflow-hidden rounded-t-2xl border-b border-border bg-surface-muted text-left" aria-label={`View ${credential.credential_name}`}>
        {isImage ? (
          <img src={credentialFileUrl(credential.id)} alt="" loading="lazy" className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]" />
        ) : (
          <span className="flex h-full flex-col items-center justify-center bg-[linear-gradient(145deg,var(--surface-muted),var(--surface-alt))] text-rose-600 dark:text-rose-300">
            <FileText className="h-12 w-12" aria-hidden="true" />
            <span className="mt-2 text-xs font-bold uppercase tracking-widest">PDF Certificate</span>
          </span>
        )}
        <span className={`absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold capitalize shadow-sm ${statusClasses[credential.status]}`}>
          {credential.status === 'verified' && <Check className="h-3 w-3" aria-hidden="true" />}
          {credential.status}
        </span>
      </button>

      <div className="flex min-w-0 flex-1 flex-col p-4">
        <h3 className="break-words text-base font-bold leading-6 text-text-primary [overflow-wrap:anywhere]">{credential.credential_name}</h3>
        <p className="mt-1 flex min-w-0 items-start gap-2 text-sm leading-5 text-text-secondary">
          <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          <span className="break-words [overflow-wrap:anywhere]">{credential.issuing_organization}</span>
        </p>

        <div className="mt-3 space-y-1.5 text-xs text-text-secondary">
          <p className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5 shrink-0 text-text-muted" /> <span>Issued: {credential.issue_date ? formatCredentialDate(credential.issue_date) : 'Not specified'}</span></p>
          <p className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5 shrink-0 text-text-muted" /> <span>{credential.expiration_date ? `Expires: ${formatCredentialDate(credential.expiration_date)}` : 'No Expiration'}</span></p>
          {credential.credential_id && <p className="break-all"><span className="font-semibold">Credential ID:</span> {credential.credential_id}</p>}
          {credential.verification_url && (
            <a href={credential.verification_url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 font-semibold text-blue-700 hover:underline dark:text-blue-300">
              <span className="truncate">Verification link</span><ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          )}
        </div>

        <div className="mt-4 flex min-w-0 items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:text-blue-300">
            {isImage ? <FileImage className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-text-primary" title={credential.original_file_name}>{credential.original_file_name}</span>
            <span className="mt-0.5 block text-[11px] text-text-muted">{formatCredentialBytes(credential.file_size_bytes)}</span>
          </span>
        </div>

        <div className="mt-4 flex items-center border-t border-border pt-3">
          <button type="button" onClick={onView} className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-bold text-blue-700 transition hover:bg-blue-50 dark:text-blue-300">
            <Eye className="h-4 w-4" /> View
          </button>
          <button type="button" onClick={onDownload} className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-bold text-blue-700 transition hover:bg-blue-50 dark:text-blue-300">
            <Download className="h-4 w-4" /> Download
          </button>
          <div ref={menuRef} className="relative">
            <button type="button" onClick={() => setMenuOpen((current) => !current)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary transition hover:bg-surface-hover" aria-label={`More actions for ${credential.credential_name}`} aria-haspopup="menu" aria-expanded={menuOpen}>
              <MoreHorizontal className="h-5 w-5" />
            </button>
            {menuOpen && (
              <div role="menu" className="absolute bottom-full right-0 z-20 mb-2 w-48 rounded-xl border border-border bg-surface p-1.5 shadow-xl">
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onEdit(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-text-primary hover:bg-surface-hover"><Pencil className="h-4 w-4 text-blue-600" /> Edit Credential</button>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onDelete(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300"><Trash2 className="h-4 w-4" /> Delete Credential</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function CredentialFormModal({
  credential,
  onClose,
  onSaved,
}: {
  credential: GraduateCredential | null;
  onClose: () => void;
  onSaved: (credential: GraduateCredential, message: string) => void;
}) {
  const [values, setValues] = useState<CredentialFormValues>(() => credentialToForm(credential));
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<CredentialFieldErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    titleRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, saving]);

  const setField = (field: keyof CredentialFormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSubmitError('');
  };

  const selectFile = (selected?: File | null) => {
    if (!selected) return;
    const error = validateCredentialFile(selected);
    if (error) {
      setFile(null);
      setErrors((current) => ({ ...current, certificate: error }));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setFile(selected);
    setErrors((current) => ({ ...current, certificate: undefined }));
    setSubmitError('');
  };

  const validateForm = () => {
    const nextErrors: CredentialFieldErrors = {};
    if (!values.credential_name.trim()) nextErrors.credential_name = 'Credential name is required.';
    if (!values.issuing_organization.trim()) nextErrors.issuing_organization = 'Issuing organization is required.';
    if (values.issue_date && Number.isNaN(new Date(`${values.issue_date}T00:00:00`).getTime())) nextErrors.issue_date = 'Enter a valid issue date.';
    if (values.expiration_date && Number.isNaN(new Date(`${values.expiration_date}T00:00:00`).getTime())) nextErrors.expiration_date = 'Enter a valid expiration date.';
    if (values.issue_date && values.expiration_date && values.expiration_date < values.issue_date) nextErrors.expiration_date = 'Expiration date cannot be earlier than the issue date.';
    if (values.verification_url.trim() && !isHttpUrl(values.verification_url.trim())) nextErrors.verification_url = 'Enter a valid http:// or https:// URL.';
    if (!credential && !file) nextErrors.certificate = 'Certificate file is required.';
    if (file) {
      const fileError = validateCredentialFile(file);
      if (fileError) nextErrors.certificate = fileError;
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || !validateForm()) return;
    setSaving(true);
    setSubmitError('');
    const formData = new FormData();
    Object.entries(values).forEach(([key, value]) => formData.append(key, value.trim()));
    if (file) formData.append('certificate', file);
    if (credential) {
      formData.append('_method', 'PUT');
      formData.append('id', String(credential.id));
    }

    try {
      const payload = await credentialApiRequest<{ data: GraduateCredential; message?: string }>(API_ENDPOINTS.GRADUATE_CREDENTIALS, {
        method: 'POST',
        body: formData,
      });
      onSaved(payload.data, payload.message || (credential ? 'Credential updated successfully.' : 'Credential added successfully.'));
    } catch (error) {
      if (error instanceof CredentialApiError) {
        setErrors(error.errors);
        setSubmitError(error.message);
      } else {
        setSubmitError(error instanceof Error ? error.message : 'Unable to save credential.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    selectFile(event.dataTransfer.files?.[0]);
  };

  const handleUploadKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInputRef.current?.click();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/65 px-2 py-2 backdrop-blur-[2px] sm:px-4 sm:py-5" role="dialog" aria-modal="true" aria-labelledby="credential-form-title">
      <form onSubmit={handleSubmit} className="flex max-h-[calc(100dvh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl sm:max-h-[94dvh] sm:rounded-[28px]">
        <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="credential-form-title" ref={titleRef} tabIndex={-1} className="text-xl font-bold text-text-primary outline-none sm:text-2xl">{credential ? 'Edit Credential' : 'Add Credential'}</h2>
            <p className="mt-1 text-sm leading-5 text-text-secondary">Upload the certificate and provide its professional details.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-surface-hover disabled:opacity-50" aria-label="Close credential form"><X className="h-5 w-5" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:p-7">
          {submitError && <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-800 dark:text-rose-200" role="alert">{submitError}</div>}
          <div className="grid min-w-0 gap-7 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.25fr)]">
            <section className="min-w-0" aria-labelledby="credential-upload-heading">
              <h3 id="credential-upload-heading" className="flex items-center gap-2 text-base font-bold text-text-primary"><UploadCloud className="h-5 w-5 text-blue-600 dark:text-blue-300" /> Upload Certificate File</h3>
              <input ref={fileInputRef} type="file" accept={credentialFileAccept} className="sr-only" onChange={(event) => selectFile(event.target.files?.[0])} />
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={handleUploadKeyDown}
                onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
                onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
                onDragLeave={(event) => { event.preventDefault(); setDragActive(false); }}
                onDrop={handleDrop}
                className={`mt-4 flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-5 py-8 text-center outline-none transition focus-visible:ring-4 focus-visible:ring-blue-200 dark:focus-visible:ring-blue-900/60 ${dragActive ? 'border-blue-500 bg-blue-50' : errors.certificate ? 'border-rose-400 bg-rose-50' : 'border-border-strong bg-surface-alt hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30'}`}
                aria-label="Choose or drop a certificate file"
              >
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:text-blue-300"><UploadCloud className="h-7 w-7" /></span>
                <p className="mt-4 text-sm font-bold text-text-primary">Drag and drop your certificate here</p>
                <p className="mt-1 text-sm font-semibold text-blue-700 dark:text-blue-300">or click to browse files</p>
                <p className="mt-4 text-xs leading-5 text-text-muted">Supported formats: PDF, JPG, JPEG, PNG (Max 10 MB)</p>
              </div>
              {errors.certificate && <p className="mt-2 text-sm font-semibold text-rose-600 dark:text-rose-300" role="alert">{errors.certificate}</p>}

              {(file || credential) && (
                <div className="mt-4 flex min-w-0 items-center gap-3 rounded-xl border border-border bg-surface-alt p-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:text-blue-300">{(file?.type || credential?.mime_type || '').startsWith('image/') ? <FileImage className="h-5 w-5" /> : <FileText className="h-5 w-5" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-text-primary" title={file?.name || credential?.original_file_name}>{file?.name || credential?.original_file_name}</span>
                    <span className="mt-0.5 block text-xs text-text-muted">{formatCredentialBytes(file?.size || credential?.file_size_bytes || 0)}{file ? ' · New file' : ' · Current file'}</span>
                  </span>
                  {file ? (
                    <button type="button" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50" aria-label="Remove selected file"><X className="h-4 w-4" /></button>
                  ) : (
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="shrink-0 rounded-lg px-2 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 dark:text-blue-300">Change</button>
                  )}
                </div>
              )}
            </section>

            <section className="min-w-0" aria-labelledby="credential-details-heading">
              <h3 id="credential-details-heading" className="flex items-center gap-2 text-base font-bold text-text-primary"><FileText className="h-5 w-5 text-blue-600 dark:text-blue-300" /> Credential Details</h3>
              <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
                <CredentialField label="Credential Name" required error={errors.credential_name} className="sm:col-span-1">
                  <input value={values.credential_name} onChange={(event) => setField('credential_name', event.target.value)} maxLength={255} placeholder="Project Management Professional (PMP)" className="field-input" aria-invalid={!!errors.credential_name} />
                </CredentialField>
                <CredentialField label="Issuing Organization" required error={errors.issuing_organization}>
                  <input value={values.issuing_organization} onChange={(event) => setField('issuing_organization', event.target.value)} maxLength={255} placeholder="Project Management Institute" className="field-input" aria-invalid={!!errors.issuing_organization} />
                </CredentialField>
                <CredentialField label="Issue Date" error={errors.issue_date}>
                  <input type="date" value={values.issue_date} onChange={(event) => setField('issue_date', event.target.value)} className="field-input" aria-invalid={!!errors.issue_date} />
                </CredentialField>
                <CredentialField label="Expiration Date" hint="Leave blank if this credential does not expire." error={errors.expiration_date}>
                  <input type="date" value={values.expiration_date} min={values.issue_date || undefined} onChange={(event) => setField('expiration_date', event.target.value)} className="field-input" aria-invalid={!!errors.expiration_date} />
                </CredentialField>
                <CredentialField label="Credential ID" error={errors.credential_id}>
                  <input value={values.credential_id} onChange={(event) => setField('credential_id', event.target.value)} maxLength={191} placeholder="123456789" className="field-input" />
                </CredentialField>
                <CredentialField label="Verification Link" error={errors.verification_url}>
                  <input type="url" value={values.verification_url} onChange={(event) => setField('verification_url', event.target.value)} maxLength={2048} placeholder="https://www.credential.net/verify" className="field-input" aria-invalid={!!errors.verification_url} />
                </CredentialField>
              </div>
            </section>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-border bg-surface-alt px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button type="button" onClick={onClose} disabled={saving} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-strong bg-surface px-5 py-2.5 text-sm font-bold text-text-primary hover:bg-surface-hover disabled:opacity-50">Cancel</button>
          <button type="submit" disabled={saving} className="gt-bg-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} {saving ? 'Saving...' : 'Save Credential'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

function CredentialField({
  label,
  required,
  hint,
  error,
  className = '',
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`min-w-0 text-sm font-semibold text-text-primary ${className}`}>
      <span>{label}{required && <span className="ml-1 text-rose-500" aria-hidden="true">*</span>}</span>
      <span className="mt-1.5 block">{children}</span>
      {hint && !error && <span className="mt-1.5 block text-xs font-normal leading-5 text-text-muted">{hint}</span>}
      {error && <span className="mt-1.5 block text-xs font-semibold leading-5 text-rose-600 dark:text-rose-300">{error}</span>}
    </label>
  );
}

function CredentialPreviewModal({ credential, onClose, onDownload }: { credential: GraduateCredential; onClose: () => void; onDownload: () => void }) {
  const isImage = credential.mime_type.startsWith('image/');

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleEscape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', handleEscape); };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-950/75 px-2 py-2 sm:px-4 sm:py-5" role="dialog" aria-modal="true" aria-labelledby="credential-preview-title">
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl sm:max-h-[94dvh] sm:rounded-[28px]">
        <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="credential-preview-title" className="break-words text-lg font-bold text-text-primary sm:text-xl">{credential.credential_name}</h2>
            <p className="mt-1 break-words text-sm text-text-secondary">{credential.issuing_organization}</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-surface-hover" aria-label="Close credential preview"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-surface-alt p-3 sm:p-5">
          {isImage ? (
            <img src={credentialFileUrl(credential.id)} alt={`${credential.credential_name} certificate`} className="mx-auto max-h-[70dvh] w-auto rounded-xl border border-border bg-surface object-contain shadow-sm" />
          ) : (
            <iframe src={credentialFileUrl(credential.id)} title={`${credential.credential_name} PDF certificate`} className="h-[68dvh] min-h-[420px] w-full rounded-xl border border-border bg-white" />
          )}
        </div>
        <div className="flex flex-col gap-3 border-t border-border px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-strong px-5 py-2.5 text-sm font-bold text-text-primary hover:bg-surface-hover">Close</button>
          <button type="button" onClick={onDownload} className="gt-bg-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white"><Download className="h-4 w-4" /> Download</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CredentialDeleteModal({ credential, deleting, onClose, onDelete }: { credential: GraduateCredential; deleting: boolean; onClose: () => void; onDelete: () => void }) {
  useEffect(() => {
    const handleEscape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape' && !deleting) onClose(); };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [deleting, onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/65 px-3 py-5" role="alertdialog" aria-modal="true" aria-labelledby="delete-credential-title" aria-describedby="delete-credential-description">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-2xl sm:rounded-[28px] sm:p-6">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-700 dark:text-rose-300"><Trash2 className="h-6 w-6" /></span>
        <h2 id="delete-credential-title" className="mt-4 text-xl font-bold text-text-primary">Delete Credential?</h2>
        <p id="delete-credential-description" className="mt-2 text-sm leading-6 text-text-secondary">Are you sure you want to delete “{credential.credential_name}”? This action cannot be undone.</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={deleting} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-strong px-5 py-2.5 text-sm font-bold text-text-primary hover:bg-surface-hover disabled:opacity-50">Cancel</button>
          <button type="button" onClick={onDelete} disabled={deleting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:cursor-wait disabled:opacity-60">{deleting && <Loader2 className="h-4 w-4 animate-spin" />}{deleting ? 'Deleting...' : 'Delete'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
