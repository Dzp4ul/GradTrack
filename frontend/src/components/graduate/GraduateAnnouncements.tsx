import { KeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ImageIcon,
  Images,
  Megaphone,
  RotateCcw,
  Search,
  Tag,
  X,
} from 'lucide-react';
import { API_BASE_URL, API_ENDPOINTS } from '../../config/api';

interface Announcement {
  id: number;
  title: string;
  summary: string;
  content: string;
  category: string;
  event_date?: string | null;
  cover_image_path?: string | null;
  status: string;
  published_at?: string | null;
  created_at: string;
  updated_at: string;
  author_name: string;
  author_program_name?: string | null;
  author_program_code?: string | null;
  author_profile_image_path?: string | null;
  author_type?: 'graduate' | 'admin';
  images?: AnnouncementGalleryImage[];
}

interface AnnouncementGalleryImage {
  id: number;
  file_path: string;
  original_name: string;
  sort_order: number;
}

interface CategoryCount {
  category: string;
  count: number;
}

interface Pagination {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
}

interface AnnouncementResponse {
  success: boolean;
  data?: Announcement | Announcement[];
  category_counts?: CategoryCount[];
  recent?: Announcement[];
  pagination?: Pagination;
  error?: string;
}

const categories = [
  { value: 'general', label: 'General Announcement' },
  { value: 'alumni_event', label: 'Alumni Event' },
  { value: 'career', label: 'Career' },
  { value: 'employment', label: 'Employment' },
  { value: 'seminar', label: 'Seminar' },
  { value: 'training', label: 'Training' },
  { value: 'college_activity', label: 'College Activity' },
  { value: 'other', label: 'Other' },
];

function resolveAssetUrl(path?: string | null) {
  if (!path) return '';
  if (/^(https?:|blob:|data:)/i.test(path)) return path;
  return `${API_BASE_URL}/${path.replace(/^\/+/, '')}`;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value?: string | null, fallback = 'Date unavailable') {
  const parsed = parseDate(value);
  if (!parsed) return fallback;
  return parsed.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatShortDate(value?: string | null) {
  const parsed = parseDate(value);
  if (!parsed) return 'Date unavailable';
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function categoryLabel(value: string) {
  return categories.find((category) => category.value === value)?.label
    || value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function initials(name?: string | null) {
  const parts = (name || 'GradTrack').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

async function request(url: string): Promise<AnnouncementResponse> {
  const response = await fetch(url, { credentials: 'include' });
  const text = await response.text();
  let data: AnnouncementResponse;
  try {
    data = text ? JSON.parse(text) as AnnouncementResponse : { success: false };
  } catch {
    throw new Error('The announcement service returned an invalid response.');
  }
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Unable to load announcements.');
  }
  return data;
}

function AnnouncementImage({ announcement, compact = false }: { announcement: Announcement; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const source = resolveAssetUrl(announcement.cover_image_path);

  useEffect(() => setFailed(false), [announcement.cover_image_path]);

  if (!source || failed) {
    return (
      <div className={`flex w-full items-center justify-center bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-500 text-white ${compact ? 'h-full' : 'h-full min-h-52'}`}>
        <div className="text-center">
          <Megaphone className={`${compact ? 'h-6 w-6' : 'h-12 w-12'} mx-auto opacity-90`} />
          {!compact && <p className="mt-3 text-xs font-bold uppercase tracking-[0.2em] text-blue-100">GradTrack Announcement</p>}
        </div>
      </div>
    );
  }

  return <img src={source} alt={announcement.title} onError={() => setFailed(true)} className="h-full w-full object-cover" />;
}

function AnnouncementGallery({ images, title }: { images: AnnouncementGalleryImage[]; title: string }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (selectedIndex === null) return undefined;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedIndex(null);
      if (event.key === 'ArrowLeft') setSelectedIndex((current) => current === null ? null : (current - 1 + images.length) % images.length);
      if (event.key === 'ArrowRight') setSelectedIndex((current) => current === null ? null : (current + 1) % images.length);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images.length, selectedIndex]);

  if (images.length === 0) return null;
  const selected = selectedIndex === null ? null : images[selectedIndex];

  return (
    <div className="mt-10 border-t border-slate-100 pt-8">
      <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Images className="h-5 w-5 text-blue-700" /><h3 className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-900">Announcement Photos</h3></div><span className="text-xs font-semibold text-slate-400">{images.length} photo{images.length === 1 ? '' : 's'}</span></div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {images.map((image, index) => <button key={image.id} type="button" onClick={() => setSelectedIndex(index)} className={`group relative min-h-52 cursor-pointer overflow-hidden rounded-2xl bg-slate-100 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${images.length % 2 === 1 && index === 0 ? 'sm:col-span-2 sm:aspect-[16/8]' : 'aspect-[4/3]'}`}><img src={resolveAssetUrl(image.file_path)} alt={`${title} photo ${index + 1}`} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" /><span className="absolute inset-0 bg-slate-950/0 transition group-hover:bg-slate-950/10" /><span className="absolute bottom-3 right-3 rounded-full bg-slate-950/70 px-3 py-1.5 text-xs font-bold text-white">View photo</span></button>)}
      </div>
      {selected && <div role="dialog" aria-modal="true" aria-label="Announcement photo viewer" className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/90 p-3 sm:p-8" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedIndex(null); }}><button type="button" onClick={() => setSelectedIndex(null)} aria-label="Close photo viewer" className="absolute right-4 top-4 z-10 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"><X className="h-6 w-6" /></button>{images.length > 1 && <button type="button" onClick={() => setSelectedIndex((current) => current === null ? null : (current - 1 + images.length) % images.length)} aria-label="Previous photo" className="absolute left-3 z-10 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:left-6"><ChevronLeft className="h-7 w-7" /></button>}<img src={resolveAssetUrl(selected.file_path)} alt={selected.original_name || `${title} photo`} className="max-h-[88vh] max-w-full rounded-xl object-contain shadow-2xl" />{images.length > 1 && <button type="button" onClick={() => setSelectedIndex((current) => current === null ? null : (current + 1) % images.length)} aria-label="Next photo" className="absolute right-3 z-10 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 sm:right-6"><ChevronRight className="h-7 w-7" /></button>}<span className="absolute bottom-4 rounded-full bg-black/50 px-3 py-1 text-xs font-bold text-white">{(selectedIndex ?? 0) + 1} / {images.length}</span></div>}
    </div>
  );
}

function AuthorAvatar({ announcement, size = 'md' }: { announcement: Announcement; size?: 'sm' | 'md' }) {
  const [failed, setFailed] = useState(false);
  const source = resolveAssetUrl(announcement.author_profile_image_path);
  const sizeClass = size === 'sm' ? 'h-9 w-9 text-[10px]' : 'h-11 w-11 text-xs';

  useEffect(() => setFailed(false), [announcement.author_profile_image_path]);

  if (!source || failed) {
    return <span className={`flex shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700 ring-2 ring-white ${sizeClass}`}>{initials(announcement.author_name)}</span>;
  }
  return <img src={source} alt="" onError={() => setFailed(true)} className={`shrink-0 rounded-full object-cover ring-2 ring-white ${sizeClass}`} />;
}

function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="aspect-[16/10] animate-pulse bg-slate-200" />
      <div className="space-y-4 p-5"><div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" /><div className="h-6 w-5/6 animate-pulse rounded bg-slate-200" /><div className="space-y-2"><div className="h-3 animate-pulse rounded bg-slate-100" /><div className="h-3 w-4/5 animate-pulse rounded bg-slate-100" /></div><div className="h-9 w-32 animate-pulse rounded-xl bg-slate-100" /></div>
    </div>
  );
}

export default function GraduateAnnouncements({ announcementId }: { announcementId?: number }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [categoryCounts, setCategoryCounts] = useState<CategoryCount[]>([]);
  const [recent, setRecent] = useState<Announcement[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ current_page: 1, per_page: 9, total: 0, last_page: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [committedSearch, setCommittedSearch] = useState(() => searchParams.get('search') || '');
  const [category, setCategory] = useState(() => searchParams.get('category') || 'all');
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get('page') || 1)));

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), per_page: '9' });
      if (committedSearch.trim()) params.set('search', committedSearch.trim());
      if (category !== 'all') params.set('category', category);
      const response = await request(`${API_ENDPOINTS.ANNOUNCEMENTS}?${params.toString()}`);
      setAnnouncements(Array.isArray(response.data) ? response.data : []);
      setCategoryCounts(response.category_counts || []);
      setRecent(response.recent || []);
      if (response.pagination) setPagination(response.pagination);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load announcements.');
      setAnnouncements([]);
    } finally {
      setLoading(false);
    }
  }, [category, committedSearch, page]);

  const loadDetail = useCallback(async (id: number) => {
    setLoading(true);
    setError('');
    setAnnouncement(null);
    try {
      const response = await request(`${API_ENDPOINTS.ANNOUNCEMENTS}?id=${id}`);
      setAnnouncement(!Array.isArray(response.data) ? response.data || null : null);
      setCategoryCounts(response.category_counts || []);
      setRecent(response.recent || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load this announcement.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (announcementId) void loadDetail(announcementId);
    else void loadList();
  }, [announcementId, loadDetail, loadList]);

  useEffect(() => {
    const timer = window.setTimeout(() => { setPage(1); setCommittedSearch(search.trim()); }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (announcementId) return;
    const next = new URLSearchParams();
    if (committedSearch) next.set('search', committedSearch);
    if (category !== 'all') next.set('category', category);
    if (page > 1) next.set('page', String(page));
    setSearchParams(next, { replace: true });
  }, [announcementId, category, committedSearch, page, setSearchParams]);

  const totalPublished = useMemo(() => categoryCounts.reduce((total, item) => total + item.count, 0), [categoryCounts]);
  const openAnnouncement = (id: number) => navigate(`/graduate/announcements/${id}`);
  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>, id: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openAnnouncement(id);
    }
  };
  const chooseCategory = (nextCategory: string) => {
    setCategory(nextCategory);
    setPage(1);
    if (announcementId) navigate(nextCategory === 'all' ? '/graduate/announcements' : `/graduate/announcements?category=${nextCategory}`);
  };
  const retry = () => announcementId ? void loadDetail(announcementId) : void loadList();

  if (announcementId) {
    return (
      <AnnouncementDetail
        announcement={announcement}
        categoryCounts={categoryCounts}
        recent={recent}
        loading={loading}
        error={error}
        onBack={() => navigate('/graduate/announcements')}
        onRetry={retry}
        onOpen={openAnnouncement}
        onCategory={chooseCategory}
      />
    );
  }

  return (
    <section className="space-y-5" aria-label="Announcements list">
      <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_15rem]">
          <label className="relative block"><span className="sr-only">Search announcements</span><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search announcements..." className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white" /></label>
          <label><span className="sr-only">Filter by category</span><select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }} className="h-11 w-full cursor-pointer rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white"><option value="all">All Categories ({totalPublished})</option>{categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" aria-label="Loading announcements">{Array.from({ length: 6 }, (_, index) => <CardSkeleton key={index} />)}</div>
      ) : error ? (
        <div className="rounded-[28px] border border-red-200 bg-white px-6 py-14 text-center shadow-sm"><AlertCircle className="mx-auto h-11 w-11 text-red-500" /><h2 className="mt-4 text-lg font-bold text-slate-900">Announcements could not be loaded</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{error}</p><button type="button" onClick={retry} className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800"><RotateCcw className="h-4 w-4" /> Try Again</button></div>
      ) : announcements.length === 0 ? (
        <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-16 text-center shadow-sm"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Megaphone className="h-8 w-8" /></span><h2 className="mt-5 text-xl font-bold text-slate-900">No announcements yet.</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{committedSearch || category !== 'all' ? 'No announcements match your current search or category.' : 'Announcements posted by the Alumni Admin will appear here.'}</p></div>
      ) : (
        <>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {announcements.map((item) => (
              <article key={item.id} role="link" tabIndex={0} onClick={() => openAnnouncement(item.id)} onKeyDown={(event) => handleCardKeyDown(event, item.id)} className="group flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-blue-500">
                <div className="aspect-[16/10] w-full overflow-hidden bg-slate-100"><div className="h-full w-full transition duration-300 group-hover:scale-[1.025]"><AnnouncementImage announcement={item} /></div></div>
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-semibold text-slate-500"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-blue-600" />{formatShortDate(item.published_at || item.created_at)}</span><span className="inline-flex min-w-0 items-center gap-1.5"><Tag className="h-3.5 w-3.5 text-blue-600" /><span className="truncate">{categoryLabel(item.category)}</span></span></div>
                  <h2 className="mt-4 line-clamp-2 min-h-[3.5rem] text-lg font-bold leading-7 text-slate-900 transition group-hover:text-blue-700">{item.title}</h2>
                  <p className="mt-2 line-clamp-3 min-h-[4.5rem] text-sm leading-6 text-slate-500">{item.summary}</p>
                  <div className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-4"><AuthorAvatar announcement={item} size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-800">{item.author_name}</p><p className="truncate text-[11px] text-slate-400">Alumni Administration</p></div><span className="shrink-0 text-xs font-extrabold uppercase tracking-wide text-blue-700">Read More</span></div>
                </div>
              </article>
            ))}
          </div>
          {pagination.last_page > 1 && <nav className="flex items-center justify-center gap-3 pt-2" aria-label="Announcement pages"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="inline-flex h-10 cursor-pointer items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Previous</button><span className="text-sm font-semibold text-slate-500">Page {pagination.current_page} of {pagination.last_page}</span><button type="button" disabled={page >= pagination.last_page} onClick={() => setPage((current) => Math.min(pagination.last_page, current + 1))} className="inline-flex h-10 cursor-pointer items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40">Next <ChevronRight className="h-4 w-4" /></button></nav>}
        </>
      )}
    </section>
  );
}

function AnnouncementDetail({ announcement, categoryCounts, recent, loading, error, onBack, onRetry, onOpen, onCategory }: {
  announcement: Announcement | null;
  categoryCounts: CategoryCount[];
  recent: Announcement[];
  loading: boolean;
  error: string;
  onBack: () => void;
  onRetry: () => void;
  onOpen: (id: number) => void;
  onCategory: (category: string) => void;
}) {
  if (loading) {
    return <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"><div className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-sm"><div className="aspect-[16/8] animate-pulse bg-slate-200" /><div className="space-y-5 p-6 sm:p-8"><div className="h-8 w-4/5 animate-pulse rounded bg-slate-200" /><div className="h-12 animate-pulse rounded bg-slate-100" /><div className="space-y-3">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-3 animate-pulse rounded bg-slate-100" />)}</div></div></div><div className="hidden space-y-5 lg:block"><div className="h-72 animate-pulse rounded-[28px] bg-white" /><div className="h-80 animate-pulse rounded-[28px] bg-white" /></div></div>;
  }
  if (error || !announcement) {
    return <div className="rounded-[28px] border border-red-200 bg-white px-6 py-16 text-center shadow-sm"><AlertCircle className="mx-auto h-11 w-11 text-red-500" /><h2 className="mt-4 text-xl font-bold text-slate-900">Announcement unavailable</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{error || 'This announcement could not be found.'}</p><div className="mt-6 flex flex-wrap justify-center gap-3"><button type="button" onClick={onBack} className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /> All Announcements</button><button type="button" onClick={onRetry} className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800"><RotateCcw className="h-4 w-4" /> Try Again</button></div></div>;
  }

  const paragraphs = announcement.content.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
  return (
    <section className="space-y-4" aria-label="Announcement details">
      <button type="button" onClick={onBack} className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-1 py-1 text-sm font-bold text-blue-700 transition hover:text-blue-900"><ArrowLeft className="h-4 w-4" /> Back to Announcements</button>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <article className="min-w-0 overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-sm">
          <div className="aspect-[16/8] max-h-[34rem] min-h-60 w-full overflow-hidden bg-slate-100 sm:min-h-80"><AnnouncementImage announcement={announcement} /></div>
          <div className="p-5 sm:p-8 lg:p-10">
            <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700"><Tag className="h-3.5 w-3.5" />{categoryLabel(announcement.category)}</span>{announcement.event_date && <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700"><CalendarDays className="h-3.5 w-3.5" />Event: {formatDate(announcement.event_date)}</span>}</div>
            <h2 className="mt-5 break-words text-2xl font-extrabold leading-tight text-slate-950 sm:text-3xl lg:text-4xl">{announcement.title}</h2>
            <div className="mt-6 flex flex-col gap-4 border-y border-slate-100 py-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><AuthorAvatar announcement={announcement} /><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{announcement.author_name}</p><p className="truncate text-xs text-slate-500">GradTrack Alumni Administration</p></div></div><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500"><Clock3 className="h-4 w-4 text-blue-600" />Posted {formatDate(announcement.published_at || announcement.created_at)}</span></div>
            <div className="mt-8 space-y-6 text-[15px] leading-8 text-slate-700 sm:text-base">{paragraphs.length > 0 ? paragraphs.map((paragraph, index) => <p key={index} className="whitespace-pre-line break-words">{paragraph}</p>) : <p>{announcement.content}</p>}</div>
            <AnnouncementGallery images={announcement.images || []} title={announcement.title} />
          </div>
        </article>

        <aside className="space-y-5 lg:sticky lg:top-[calc(var(--graduate-portal-header-height)_+_1rem)]" aria-label="Announcement sidebar">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Tag className="h-5 w-5 text-blue-700" /><h3 className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-900">Announcement Categories</h3></div><div className="mt-4 space-y-1.5"><button type="button" onClick={() => onCategory('all')} className="flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"><span>All Announcements</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold">{categoryCounts.reduce((total, item) => total + item.count, 0)}</span></button>{categoryCounts.map((item) => <button key={item.category} type="button" onClick={() => onCategory(item.category)} className="flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"><span className="min-w-0 truncate">{categoryLabel(item.category)}</span><span className="ml-3 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">{item.count}</span></button>)}</div></div>
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Megaphone className="h-5 w-5 text-blue-700" /><h3 className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-900">Recent Announcements</h3></div>{recent.length === 0 ? <div className="py-8 text-center"><ImageIcon className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 text-sm text-slate-400">No other announcements yet.</p></div> : <div className="mt-4 space-y-3">{recent.map((item) => <button key={item.id} type="button" onClick={() => onOpen(item.id)} className="group flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-slate-100 p-2.5 text-left transition hover:border-blue-200 hover:bg-blue-50/50"><span className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100"><AnnouncementImage announcement={item} compact /></span><span className="min-w-0 flex-1"><span className="line-clamp-2 text-xs font-bold leading-5 text-slate-800 transition group-hover:text-blue-700">{item.title}</span><span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{formatShortDate(item.published_at || item.created_at)}</span></span></button>)}</div>}</div>
        </aside>
      </div>
    </section>
  );
}
