import { useParams } from 'react-router-dom';
import Footer from '../components/Footer';
import PublicNav from '../components/PublicNav';
import GraduateAnnouncements from '../components/graduate/GraduateAnnouncements';

function parseAnnouncementId(rawValue?: string) {
  const value = Number(rawValue);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

export default function PublicAnnouncementsPage() {
  const { announcementId } = useParams<{ announcementId?: string }>();
  const selectedAnnouncementId = parseAnnouncementId(announcementId);

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50">
      <PublicNav />
      <main>
        {!selectedAnnouncementId && (
          <section className="bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 py-12 sm:py-16">
            <div className="mx-auto max-w-4xl px-4 text-center sm:px-6">
              <h1 className="text-3xl font-extrabold text-white sm:text-5xl">Announcements</h1>
              <p className="mx-auto mt-4 max-w-3xl text-base leading-relaxed text-blue-100 sm:text-lg">
                News, activities, opportunities, and important notices from Norzagaray College.
              </p>
            </div>
          </section>
        )}

        <section className="min-h-[480px] py-10 sm:py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <GraduateAnnouncements
              announcementId={selectedAnnouncementId}
              publicMode
              basePath="/announcements"
            />
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
