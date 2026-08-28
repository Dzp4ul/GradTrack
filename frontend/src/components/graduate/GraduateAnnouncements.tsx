import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ImageIcon,
  Megaphone,
  RotateCcw,
  Tag,
  X,
} from 'lucide-react';
import { API_BASE_URL, API_ENDPOINTS } from '../../config/api';
import { fetchAnnouncements, type Announcement, type AnnouncementGalleryImage } from '../../services/announcements';

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

function AnnouncementCoverImage({ announcement }: { announcement: Announcement }) {
  const [failed, setFailed] = useState(false);
  const source = resolveAssetUrl(announcement.cover_image_path);

  useEffect(() => setFailed(false), [announcement.cover_image_path]);

  if (!source || failed) {
    return (
      <div className="flex min-h-52 w-full items-center justify-center rounded-lg bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-500 text-white sm:min-h-72">
        <div className="text-center"><Megaphone className="mx-auto h-12 w-12 opacity-90" /><p className="mt-3 text-xs font-bold uppercase tracking-[0.2em] text-blue-100">GradTrack Announcement</p></div>
      </div>
    );
  }

  return <img src={source} alt={announcement.title} onError={() => setFailed(true)} className="block h-auto w-full max-w-full rounded-lg object-contain" />;
}

function AnnouncementArticleImages({ images, title }: { images: AnnouncementGalleryImage[]; title: string }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [failedImageIds, setFailedImageIds] = useState<number[]>([]);

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
    <div className="mt-7 space-y-6">
      {images.map((image, index) => failedImageIds.includes(image.id) ? (
        <div key={image.id} className="flex min-h-44 w-full max-w-xl items-center justify-center rounded-lg bg-slate-100 text-slate-400"><div className="text-center"><ImageIcon className="mx-auto h-8 w-8" /><p className="mt-2 text-xs font-semibold">Image unavailable</p></div></div>
      ) : (
        <button key={image.id} type="button" onClick={() => setSelectedIndex(index)} aria-label={`Open ${title} image ${index + 1}`} className="block w-fit max-w-full cursor-zoom-in text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><img src={resolveAssetUrl(image.file_path)} alt={image.original_name || `${title} image ${index + 1}`} onError={() => setFailedImageIds((current) => [...current, image.id])} className="block h-auto max-h-[46rem] w-auto max-w-full object-contain" /></button>
      ))}
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

export function AnnouncementCard({ announcement, to, compact = false }: { announcement: Announcement; to: string; compact?: boolean }) {
  return (
    <article className="h-full min-w-0">
      <Link to={to} className={`group flex h-full min-w-0 flex-col overflow-hidden border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${compact ? 'rounded-2xl' : 'rounded-[28px]'}`}>
        <div className={`${compact ? 'aspect-video' : 'aspect-[16/10]'} w-full overflow-hidden bg-slate-100`}><div className="h-full w-full transition duration-300 group-hover:scale-[1.025]"><AnnouncementImage announcement={announcement} compact={compact} /></div></div>
        <div className="flex flex-1 flex-col p-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-semibold text-slate-500"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-blue-600" />{formatShortDate(announcement.published_at || announcement.created_at)}</span><span className="inline-flex min-w-0 items-center gap-1.5"><Tag className="h-3.5 w-3.5 text-amber-600" /><span className="truncate">{categoryLabel(announcement.category)}</span></span></div>
          <h2 className="mt-4 line-clamp-2 min-h-[3.5rem] text-lg font-bold leading-7 text-slate-900 transition group-hover:text-blue-700">{announcement.title}</h2>
          <p className="mt-2 line-clamp-3 min-h-[4.5rem] text-sm leading-6 text-slate-500">{announcement.summary}</p>
          <div className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-4"><AuthorAvatar announcement={announcement} size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-800">{announcement.author_name}</p><p className="truncate text-[11px] text-slate-400">Alumni Administration</p></div><span className="shrink-0 text-xs font-extrabold uppercase tracking-wide text-blue-700">Read More</span></div>
        </div>
      </Link>
    </article>
  );
}

export default function GraduateAnnouncements({ announcementId, publicMode = false, basePath = '/graduate/announcements' }: { announcementId?: number; publicMode?: boolean; basePath?: string }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [categoryCounts, setCategoryCounts] = useState<CategoryCount[]>([]);
  const [recent, setRecent] = useState<Announcement[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ current_page: 1, per_page: 9, total: 0, last_page: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const committedSearch = searchParams.get('search') || '';
  const [category, setCategory] = useState(() => searchParams.get('category') || 'all');
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get('page') || 1)));

  const loadList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), per_page: '9' });
      if (publicMode) params.set('public', '1');
      if (committedSearch.trim()) params.set('search', committedSearch.trim());
      if (category !== 'all') params.set('category', category);
      const response = await fetchAnnouncements(`${API_ENDPOINTS.ANNOUNCEMENTS}?${params.toString()}`);
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
  }, [category, committedSearch, page, publicMode]);

  const loadDetail = useCallback(async (id: number) => {
    setLoading(true);
    setError('');
    setAnnouncement(null);
    try {
      const params = new URLSearchParams({ id: String(id) });
      if (publicMode) params.set('public', '1');
      const response = await fetchAnnouncements(`${API_ENDPOINTS.ANNOUNCEMENTS}?${params.toString()}`);
      setAnnouncement(!Array.isArray(response.data) ? response.data || null : null);
      setCategoryCounts(response.category_counts || []);
      setRecent(response.recent || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load this announcement.');
    } finally {
      setLoading(false);
    }
  }, [publicMode]);

  useEffect(() => {
    if (announcementId) void loadDetail(announcementId);
    else void loadList();
  }, [announcementId, loadDetail, loadList]);

  useEffect(() => {
    if (announcementId) return;
    const next = new URLSearchParams();
    if (committedSearch) next.set('search', committedSearch);
    if (category !== 'all') next.set('category', category);
    if (page > 1) next.set('page', String(page));
    setSearchParams(next, { replace: true });
  }, [announcementId, category, committedSearch, page, setSearchParams]);

  const openAnnouncement = (id: number) => navigate(`${basePath}/${id}`);
  const chooseCategory = (nextCategory: string) => {
    setCategory(nextCategory);
    setPage(1);
    if (announcementId) navigate(nextCategory === 'all' ? basePath : `${basePath}?category=${nextCategory}`);
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
        onBack={() => navigate(basePath)}
        onRetry={retry}
        onOpen={openAnnouncement}
        onCategory={chooseCategory}
      />
    );
  }

  return (
    <section className="space-y-5" aria-label="Announcements list">
      {loading ? (
        <div className={`grid gap-5 md:grid-cols-2 ${publicMode ? 'lg:grid-cols-3' : 'xl:grid-cols-3'}`} aria-label="Loading announcements">{Array.from({ length: 6 }, (_, index) => <CardSkeleton key={index} />)}</div>
      ) : error ? (
        <div className="rounded-[28px] border border-red-200 bg-white px-6 py-14 text-center shadow-sm"><AlertCircle className="mx-auto h-11 w-11 text-red-500" /><h2 className="mt-4 text-lg font-bold text-slate-900">Announcements could not be loaded</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{error}</p><button type="button" onClick={retry} className="mt-5 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800"><RotateCcw className="h-4 w-4" /> Try Again</button></div>
      ) : announcements.length === 0 ? (
        <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-16 text-center shadow-sm"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Megaphone className="h-8 w-8" /></span><h2 className="mt-5 text-xl font-bold text-slate-900">No announcements yet.</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{committedSearch || category !== 'all' ? 'No announcements match your current search or category.' : 'Announcements posted by the Alumni Admin will appear here.'}</p></div>
      ) : (
        <>
          <div className={`grid gap-5 md:grid-cols-2 ${publicMode ? 'lg:grid-cols-3' : 'xl:grid-cols-3'}`}>
            {announcements.map((item) => (
              <AnnouncementCard key={item.id} announcement={item} to={`${basePath}/${item.id}`} />
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
    return (
      <div className="mx-auto grid max-w-6xl items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-8" aria-label="Loading announcement">
        <div className="min-w-0">
          <div className="aspect-[16/10] max-h-[28rem] animate-pulse rounded-lg bg-slate-200 sm:aspect-video" />
          <div className="mt-5 h-8 w-4/5 animate-pulse rounded bg-slate-200" />
          <div className="mt-4 h-9 w-3/5 animate-pulse rounded bg-slate-100" />
          <div className="mt-6 space-y-3 border-t border-slate-200 pt-6">{Array.from({ length: 6 }, (_, index) => <div key={index} className={`h-3 animate-pulse rounded bg-slate-100 ${index === 5 ? 'w-3/4' : 'w-full'}`} />)}</div>
        </div>
        <div className="hidden space-y-8 lg:block"><div className="h-48 animate-pulse bg-white" /><div className="h-72 animate-pulse bg-white" /></div>
      </div>
    );
  }
  if (error || !announcement) {
    return <div className="mx-auto max-w-3xl border-y border-red-200 bg-white px-6 py-14 text-center"><AlertCircle className="mx-auto h-11 w-11 text-red-500" /><h2 className="mt-4 text-xl font-bold text-slate-900">Announcement unavailable</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{error || 'This announcement could not be found.'}</p><div className="mt-6 flex flex-wrap justify-center gap-3"><button type="button" onClick={onBack} className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /> All Announcements</button><button type="button" onClick={onRetry} className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800"><RotateCcw className="h-4 w-4" /> Try Again</button></div></div>;
  }

  const paragraphs = announcement.content.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const totalAnnouncements = categoryCounts.reduce((total, item) => total + item.count, 0);
  return (
    <section className="mx-auto max-w-6xl space-y-3" aria-label="Announcement details">
      <button type="button" onClick={onBack} className="inline-flex cursor-pointer items-center gap-1.5 py-1 text-sm font-bold text-blue-700 transition hover:text-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><ArrowLeft className="h-4 w-4" /> Back to Announcements</button>
      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-8">
        <article className="min-w-0">
          <AnnouncementCoverImage announcement={announcement} />

          <header className="mt-5 max-w-3xl">
            <h2 className="break-words text-2xl font-extrabold leading-tight text-slate-950 sm:text-[1.65rem] sm:leading-[1.25]">{announcement.title}</h2>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 pb-4 text-xs font-medium text-slate-500">
              <span className="inline-flex min-w-0 items-center gap-2"><AuthorAvatar announcement={announcement} size="sm" /><span className="max-w-48 truncate font-bold text-slate-800">{announcement.author_name}</span></span>
              <span aria-hidden="true" className="hidden h-4 w-px bg-slate-300 sm:block" />
              <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5 text-blue-600" />{formatDate(announcement.published_at || announcement.created_at)}</span>
              <span aria-hidden="true" className="hidden h-4 w-px bg-slate-300 sm:block" />
              <span className="inline-flex items-center gap-1.5"><Tag className="h-3.5 w-3.5 text-blue-600" />{categoryLabel(announcement.category)}</span>
              {announcement.event_date && <><span aria-hidden="true" className="hidden h-4 w-px bg-slate-300 sm:block" /><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-amber-600" />Event {formatDate(announcement.event_date)}</span></>}
            </div>
          </header>

          <div className="mt-6 max-w-3xl space-y-5 text-[15px] leading-7 text-slate-700 sm:text-base sm:leading-8">{paragraphs.length > 0 ? paragraphs.map((paragraph, index) => <p key={index} className="whitespace-pre-line break-words">{paragraph}</p>) : <p>{announcement.content}</p>}</div>
          <div className="max-w-3xl"><AnnouncementArticleImages images={announcement.images || []} title={announcement.title} /></div>
        </article>

        <aside className="space-y-7 lg:sticky lg:top-[calc(var(--graduate-portal-header-height)_+_1rem)]" aria-label="Announcement sidebar">
          <section aria-labelledby="announcement-categories-heading">
            <div className="flex items-center gap-2 border-b-2 border-blue-700 pb-2.5"><Tag className="h-4 w-4 text-blue-700" /><h3 id="announcement-categories-heading" className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-900">Announcement Categories</h3></div>
            <div className="divide-y divide-slate-100 border-b border-slate-200 bg-white">
              <button type="button" onClick={() => onCategory('all')} className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"><span>All Announcements</span><span className="min-w-6 rounded-full bg-slate-100 px-2 py-0.5 text-center text-[11px] font-bold text-slate-600">{totalAnnouncements}</span></button>
              {categoryCounts.map((item) => <button key={item.category} type="button" onClick={() => onCategory(item.category)} className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"><span className="min-w-0 truncate">{categoryLabel(item.category)}</span><span className="min-w-6 rounded-full bg-blue-50 px-2 py-0.5 text-center text-[11px] font-bold text-blue-700">{item.count}</span></button>)}
            </div>
          </section>

          <section aria-labelledby="recent-announcements-heading">
            <div className="flex items-center gap-2 border-b-2 border-blue-700 pb-2.5"><Megaphone className="h-4 w-4 text-blue-700" /><h3 id="recent-announcements-heading" className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-900">Recent Announcements</h3></div>
            {recent.length === 0 ? <div className="border-b border-slate-200 bg-white py-7 text-center"><ImageIcon className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-2 text-xs text-slate-400">No other announcements yet.</p></div> : <div className="divide-y divide-slate-100 border-b border-slate-200 bg-white">{recent.map((item) => <button key={item.id} type="button" onClick={() => onOpen(item.id)} className="group flex w-full cursor-pointer items-center gap-3 px-2 py-2.5 text-left transition hover:bg-blue-50/70"><span className="h-14 w-16 shrink-0 overflow-hidden rounded-md bg-slate-100"><AnnouncementImage announcement={item} compact /></span><span className="min-w-0 flex-1"><span className="line-clamp-2 text-xs font-bold leading-4 text-slate-800 transition group-hover:text-blue-700">{item.title}</span><span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{formatShortDate(item.published_at || item.created_at)}</span></span></button>)}</div>}
          </section>
        </aside>
      </div>
    </section>
  );
}
