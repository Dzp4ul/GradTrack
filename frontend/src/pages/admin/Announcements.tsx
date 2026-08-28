import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Edit2,
  ImagePlus,
  Loader2,
  Megaphone,
  Plus,
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { API_BASE_URL, API_ENDPOINTS } from '../../config/api';
import MessageBox from '../../components/MessageBox';

interface Announcement {
  id: number;
  title: string;
  summary: string;
  content: string;
  category: string;
  event_date?: string | null;
  cover_image_path?: string | null;
  status: 'draft' | 'published' | 'archived';
  published_at?: string | null;
  created_at: string;
  updated_at: string;
  author_name: string;
}

interface AnnouncementForm {
  id?: number;
  title: string;
  summary: string;
  content: string;
  category: string;
  event_date: string;
  status: 'draft' | 'published' | 'archived';
  existing_image_path?: string | null;
}

interface Pagination {
  current_page: number;
  last_page: number;
  total: number;
}

interface ApiResponse {
  success: boolean;
  data?: Announcement[];
  pagination?: Pagination;
  id?: number;
  error?: string;
}

const categoryOptions = [
  { value: 'general', label: 'General Announcement' },
  { value: 'alumni_event', label: 'Alumni Event' },
  { value: 'career', label: 'Career' },
  { value: 'employment', label: 'Employment' },
  { value: 'seminar', label: 'Seminar' },
  { value: 'training', label: 'Training' },
  { value: 'college_activity', label: 'College Activity' },
  { value: 'other', label: 'Other' },
];

const emptyForm: AnnouncementForm = {
  title: '',
  summary: '',
  content: '',
  category: 'general',
  event_date: '',
  status: 'published',
  existing_image_path: null,
};

const statusStyle: Record<string, string> = {
  published: 'bg-emerald-100 text-emerald-700',
  draft: 'bg-amber-100 text-amber-700',
  archived: 'bg-slate-100 text-slate-600',
};

function resolveAssetUrl(path?: string | null) {
  if (!path) return '';
  if (/^(https?:|blob:|data:)/i.test(path)) return path;
  return `${API_BASE_URL}/${path.replace(/^\/+/, '')}`;
}

function categoryLabel(value: string) {
  return categoryOptions.find((item) => item.value === value)?.label
    || value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return 'Not published';
  const parsed = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return 'Date unavailable';
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

async function apiRequest(options?: RequestInit, suffix = ''): Promise<ApiResponse> {
  const headers = new Headers(options?.headers || {});
  if (!(options?.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_ENDPOINTS.ANNOUNCEMENTS}${suffix}`, {
    credentials: 'include',
    ...options,
    headers,
  });
  const data = await response.json() as ApiResponse;
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Unable to process the announcement request.');
  }
  return data;
}

export default function Announcements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ current_page: 1, last_page: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<AnnouncementForm>(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [removeImage, setRemoveImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'warning' | 'info' | 'confirm';
    title?: string;
    message: string;
    confirmText?: string;
    onConfirm?: () => void;
  }>({ isOpen: false, type: 'info', message: '' });

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), per_page: '12' });
      if (filterStatus) params.set('status', filterStatus);
      const response = await apiRequest(undefined, `?${params.toString()}`);
      setAnnouncements(Array.isArray(response.data) ? response.data : []);
      if (response.pagination) setPagination(response.pagination);
    } catch (fetchError) {
      setAnnouncements([]);
      setError(fetchError instanceof Error ? fetchError.message : 'Unable to load announcements.');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, page]);

  useEffect(() => {
    void fetchAnnouncements();
  }, [fetchAnnouncements]);

  useEffect(() => () => {
    if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  const closeMessage = () => setMessage((current) => ({ ...current, isOpen: false }));

  const closeForm = () => {
    setFormOpen(false);
    setForm(emptyForm);
    setImageFile(null);
    setImagePreview('');
    setRemoveImage(false);
  };

  const openCreate = () => {
    setForm(emptyForm);
    setImageFile(null);
    setImagePreview('');
    setRemoveImage(false);
    setFormOpen(true);
  };

  const openEdit = (announcement: Announcement) => {
    setForm({
      id: announcement.id,
      title: announcement.title,
      summary: announcement.summary,
      content: announcement.content,
      category: announcement.category,
      event_date: announcement.event_date || '',
      status: announcement.status,
      existing_image_path: announcement.cover_image_path,
    });
    setImageFile(null);
    setImagePreview(resolveAssetUrl(announcement.cover_image_path));
    setRemoveImage(false);
    setFormOpen(true);
  };

  const selectImage = (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setMessage({ isOpen: true, type: 'warning', title: 'Unsupported Image', message: 'Choose a JPG, PNG, WEBP, or GIF image.' });
      return;
    }
    if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
      setMessage({ isOpen: true, type: 'warning', title: 'Image Too Large', message: 'Announcement images can be up to 5 MB.' });
      return;
    }

    if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setRemoveImage(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.title.trim() || !form.summary.trim() || !form.content.trim()) {
      setMessage({ isOpen: true, type: 'warning', title: 'Complete Required Fields', message: 'Title, short description, and full content are required.' });
      return;
    }

    const payload = new FormData();
    payload.append('title', form.title.trim());
    payload.append('summary', form.summary.trim());
    payload.append('content', form.content.trim());
    payload.append('category', form.category);
    payload.append('event_date', form.event_date);
    payload.append('status', form.status);
    if (imageFile) payload.append('cover_image', imageFile);
    if (removeImage) payload.append('remove_image', '1');
    if (form.id) {
      payload.append('id', String(form.id));
      payload.append('_method', 'PUT');
    }

    setSaving(true);
    try {
      await apiRequest({ method: 'POST', body: payload });
      closeForm();
      await fetchAnnouncements();
      window.dispatchEvent(new CustomEvent('gradtrack:notifications-updated'));
      setMessage({
        isOpen: true,
        type: 'success',
        title: form.id ? 'Announcement Updated' : 'Announcement Created',
        message: form.status === 'published'
          ? 'The announcement is now visible in the Graduate Portal.'
          : `The announcement was saved as ${form.status}.`,
      });
    } catch (saveError) {
      setMessage({ isOpen: true, type: 'error', title: 'Announcement Not Saved', message: saveError instanceof Error ? saveError.message : 'Unable to save the announcement.' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (announcement: Announcement) => {
    setMessage({
      isOpen: true,
      type: 'confirm',
      title: 'Delete Announcement?',
      message: `Are you sure you want to delete “${announcement.title}”?\nThis action cannot be undone.`,
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await apiRequest({ method: 'DELETE', body: JSON.stringify({ id: announcement.id }) });
          await fetchAnnouncements();
          window.dispatchEvent(new CustomEvent('gradtrack:notifications-updated'));
        } catch (deleteError) {
          setMessage({ isOpen: true, type: 'error', title: 'Delete Failed', message: deleteError instanceof Error ? deleteError.message : 'Unable to delete the announcement.' });
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Alumni Administration</p>
          <h1 className="mt-1 text-2xl font-bold text-[#1b2a4a]">Announcement Manager</h1>
          <p className="mt-1 text-sm text-gray-500">Create and manage announcements shown in the Graduate Portal.</p>
        </div>
        <button type="button" onClick={openCreate} className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#1b2a4a] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#263c66] sm:w-auto">
          <Plus className="h-4 w-4" /> New Announcement
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {['', 'published', 'draft', 'archived'].map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => { setFilterStatus(status); setPage(1); }}
            className={`cursor-pointer whitespace-nowrap rounded-xl px-4 py-2 text-sm font-bold transition ${filterStatus === status ? 'bg-[#1b2a4a] text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            {status === '' ? `All (${pagination.total})` : status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex min-h-72 items-center justify-center rounded-2xl border border-gray-200 bg-white"><Loader2 className="h-7 w-7 animate-spin text-blue-700" /><span className="ml-3 text-sm text-gray-500">Loading announcements...</span></div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-white p-12 text-center"><AlertCircle className="mx-auto h-10 w-10 text-red-500" /><p className="mt-3 font-bold text-gray-900">Announcements could not be loaded</p><p className="mt-2 text-sm text-gray-500">{error}</p><button type="button" onClick={() => void fetchAnnouncements()} className="mt-5 cursor-pointer rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white">Try Again</button></div>
      ) : announcements.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm"><Megaphone className="mx-auto h-12 w-12 text-gray-300" /><h2 className="mt-4 text-lg font-bold text-gray-900">No announcements found</h2><p className="mt-2 text-sm text-gray-500">Create the first announcement or choose another status filter.</p></div>
      ) : (
        <div className="grid gap-4">
          {announcements.map((announcement) => (
            <article key={announcement.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md">
              <div className="flex flex-col sm:flex-row">
                <div className="h-44 w-full shrink-0 bg-gradient-to-br from-blue-700 to-indigo-500 sm:h-auto sm:w-52">
                  {announcement.cover_image_path
                    ? <img src={resolveAssetUrl(announcement.cover_image_path)} alt="" className="h-full w-full object-cover" />
                    : <div className="flex h-full items-center justify-center text-white"><Megaphone className="h-10 w-10 opacity-80" /></div>}
                </div>
                <div className="flex min-w-0 flex-1 flex-col p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusStyle[announcement.status]}`}>{announcement.status}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700"><Tag className="h-3 w-3" />{categoryLabel(announcement.category)}</span>
                  </div>
                  <h2 className="mt-3 line-clamp-2 text-lg font-bold text-[#1b2a4a]">{announcement.title}</h2>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-600">{announcement.summary}</p>
                  <div className="mt-auto flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap gap-4 text-xs text-gray-400"><span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />Created {formatDate(announcement.created_at)}</span>{announcement.published_at && <span>Published {formatDate(announcement.published_at)}</span>}</div>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => openEdit(announcement)} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-blue-600 transition hover:bg-blue-50"><Edit2 className="h-4 w-4" /> Edit</button>
                      <button type="button" onClick={() => confirmDelete(announcement)} className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete</button>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {pagination.last_page > 1 && (
        <div className="flex items-center justify-center gap-3"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="inline-flex cursor-pointer items-center gap-1 rounded-xl border bg-white px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Previous</button><span className="text-sm text-gray-500">Page {pagination.current_page} of {pagination.last_page}</span><button type="button" disabled={page >= pagination.last_page} onClick={() => setPage((current) => current + 1)} className="inline-flex cursor-pointer items-center gap-1 rounded-xl border bg-white px-3 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40">Next <ChevronRight className="h-4 w-4" /></button></div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 px-3 py-5" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) closeForm(); }}>
          <form onSubmit={handleSubmit} className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b px-6 py-5"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Alumni Admin</p><h2 className="mt-1 text-xl font-bold text-[#1b2a4a]">{form.id ? 'Edit Announcement' : 'Create Announcement'}</h2></div><button type="button" onClick={closeForm} disabled={saving} className="cursor-pointer rounded-full p-2 text-gray-500 transition hover:bg-gray-100"><X className="h-5 w-5" /></button></div>
            <div className="overflow-y-auto px-6 py-5">
              <div className="space-y-5">
                <label className="block text-sm font-bold text-gray-700">Title <span className="text-red-500">*</span><input required maxLength={255} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="mt-2 w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-blue-500" placeholder="Announcement title" /></label>
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="block text-sm font-bold text-gray-700">Category<select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} className="mt-2 w-full cursor-pointer rounded-xl border px-4 py-3 text-sm outline-none focus:border-blue-500">{categoryOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                  <label className="block text-sm font-bold text-gray-700">Event Date<input type="date" value={form.event_date} onChange={(event) => setForm((current) => ({ ...current, event_date: event.target.value }))} className="mt-2 w-full cursor-pointer rounded-xl border px-4 py-3 text-sm outline-none focus:border-blue-500" /></label>
                  <label className="block text-sm font-bold text-gray-700">Status<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as AnnouncementForm['status'] }))} className="mt-2 w-full cursor-pointer rounded-xl border px-4 py-3 text-sm outline-none focus:border-blue-500"><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></label>
                </div>
                <label className="block text-sm font-bold text-gray-700">Short Description <span className="text-red-500">*</span><textarea required maxLength={500} rows={3} value={form.summary} onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))} className="mt-2 w-full resize-y rounded-xl border px-4 py-3 text-sm leading-6 outline-none focus:border-blue-500" placeholder="Summary displayed on announcement cards" /><span className="mt-1 block text-right text-xs font-normal text-gray-400">{form.summary.length}/500</span></label>
                <label className="block text-sm font-bold text-gray-700">Full Content <span className="text-red-500">*</span><textarea required maxLength={60000} rows={9} value={form.content} onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))} className="mt-2 w-full resize-y rounded-xl border px-4 py-3 text-sm leading-7 outline-none focus:border-blue-500" placeholder={'Write the full announcement.\n\nUse blank lines for paragraphs.'} /></label>
                <div><p className="text-sm font-bold text-gray-700">Cover Image <span className="font-normal text-gray-400">(optional)</span></p><input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => selectImage(event.target.files?.[0])} className="hidden" />{imagePreview && !removeImage ? <div className="mt-2 overflow-hidden rounded-xl border"><img src={imagePreview} alt="Cover preview" className="aspect-[16/6] w-full object-cover" /><div className="flex justify-end gap-2 border-t p-3"><button type="button" onClick={() => imageInputRef.current?.click()} className="cursor-pointer px-3 py-1 text-xs font-bold text-blue-700">Replace</button><button type="button" onClick={() => { setImageFile(null); setImagePreview(''); setRemoveImage(Boolean(form.existing_image_path)); }} className="cursor-pointer px-3 py-1 text-xs font-bold text-red-600">Remove</button></div></div> : <button type="button" onClick={() => imageInputRef.current?.click()} className="mt-2 flex w-full cursor-pointer flex-col items-center rounded-xl border-2 border-dashed bg-gray-50 px-5 py-7 text-center transition hover:border-blue-400"><ImagePlus className="h-7 w-7 text-blue-700" /><span className="mt-2 text-sm font-bold text-gray-700">Choose cover image</span><span className="mt-1 text-xs text-gray-400">JPG, PNG, WEBP, or GIF · Maximum 5 MB</span></button>}</div>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-3 border-t bg-gray-50 px-6 py-4 sm:flex-row sm:justify-end"><button type="button" onClick={closeForm} disabled={saving} className="cursor-pointer rounded-xl border bg-white px-5 py-2.5 text-sm font-bold text-gray-700">Cancel</button><button type="submit" disabled={saving} className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#1b2a4a] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#263c66] disabled:cursor-not-allowed disabled:opacity-60">{saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : <><Upload className="h-4 w-4" /> {form.id ? 'Save Changes' : 'Create Announcement'}</>}</button></div>
          </form>
        </div>
      )}

      <MessageBox isOpen={message.isOpen} type={message.type} title={message.title} message={message.message} confirmText={message.confirmText} onClose={closeMessage} onConfirm={message.onConfirm} />
    </div>
  );
}
