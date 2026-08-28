import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Megaphone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AnnouncementCard } from './graduate/GraduateAnnouncements';
import { API_ENDPOINTS } from '../config/api';
import { fetchAnnouncements, type Announcement } from '../services/announcements';

function LatestAnnouncementSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-hidden="true">
      <div className="aspect-video animate-pulse bg-slate-200" />
      <div className="space-y-4 p-5">
        <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
        <div className="h-6 w-5/6 animate-pulse rounded bg-slate-200" />
        <div className="space-y-2">
          <div className="h-3 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="h-10 animate-pulse rounded bg-slate-100" />
      </div>
    </div>
  );
}

export default function LatestAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadAnnouncements = useCallback(async () => {
    setLoading(true);
    setError(false);

    try {
      const params = new URLSearchParams({ public: '1', recent: '1', limit: '3' });
      const response = await fetchAnnouncements(`${API_ENDPOINTS.ANNOUNCEMENTS}?${params.toString()}`);
      setAnnouncements(Array.isArray(response.data) ? response.data : []);
    } catch {
      setAnnouncements([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAnnouncements();
  }, [loadAnnouncements]);

  return (
    <section id="announcements" className="bg-white py-14 sm:py-20" aria-labelledby="latest-announcements-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-10 max-w-3xl text-center sm:mb-12">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
            <Megaphone className="h-6 w-6" />
          </span>
          <h2 id="latest-announcements-heading" className="text-3xl font-bold text-blue-900 sm:text-4xl">Latest Announcements</h2>
          <p className="mt-4 text-base leading-relaxed text-gray-600 sm:text-lg">
            Stay updated with the latest news, activities, opportunities, and important notices from Norzagaray College.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3" aria-label="Loading latest announcements">
            {Array.from({ length: 3 }, (_, index) => <LatestAnnouncementSkeleton key={index} />)}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-10 text-center text-sm text-slate-600">
            Unable to load announcements at the moment.
          </div>
        ) : announcements.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-600">
            No announcements are available at the moment.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {announcements.map((announcement) => (
              <AnnouncementCard
                key={announcement.id}
                announcement={announcement}
                to={`/announcements/${announcement.id}`}
                compact
              />
            ))}
          </div>
        )}

        {!loading && !error && announcements.length > 0 && (
          <div className="mt-10 text-center">
            <Link to="/announcements" className="inline-flex items-center gap-2 rounded-lg bg-blue-900 px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
              View All Announcements
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
