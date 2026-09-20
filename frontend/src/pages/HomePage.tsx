import { Link } from 'react-router-dom';
import { BarChart2, Bell, ShieldCheck } from 'lucide-react';
import Footer from '../components/Footer';
import LatestAnnouncements from '../components/LatestAnnouncements';
import PublicNav from '../components/PublicNav';
import { useSystemSettings } from '../contexts/SystemSettingsContext';

function HomePage() {
  const { getSetting, isEnabled, resolveAssetUrl } = useSystemSettings();
  const background = resolveAssetUrl(getSetting('login_background_image_path'), '/520382375_1065446909052636_3412465913398569974_n.jpg');
  const heroLogo = resolveAssetUrl(getSetting('login_logo_path'), '/Gradtrack_Logo2.png');
  const surveyAvailable = isEnabled('survey_available', true);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-cover bg-center bg-fixed" style={{ backgroundImage: `url(${background})` }}>
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/80 via-blue-800/80 to-blue-900/80 pointer-events-none"></div>
      <PublicNav />

      <main className="relative">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-blue-900/50"></div>
          <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
            <div className="max-w-3xl">
              <div className="space-y-5 text-white sm:space-y-8">
                <div className="w-full">
                  <img
                    src={heroLogo}
                    alt="GradTrack Logo"
                    className="mb-3 h-auto w-full max-w-[19rem] object-contain object-left sm:mb-6 sm:max-w-[24rem]"
                  />
                </div>
                <h2 className="break-words text-[clamp(1.875rem,8vw,3rem)] font-bold leading-[1.16] sm:text-4xl lg:text-5xl">
                  Connecting Graduates to Their Future
                </h2>
                <p className="max-w-2xl break-words text-base leading-7 text-blue-100 sm:text-lg sm:leading-8 lg:text-xl">
                  {getSetting('system_short_name', 'GradTrack')} empowers {getSetting('institution_name', 'Norzagaray College')} to stay connected with alumni, track career progression, and ensure educational outcomes align with professional success.
                </p>
                {surveyAvailable && (
                  <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                    <Link to="/survey" className="inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-yellow-500 px-8 py-3.5 text-center text-base font-bold text-blue-950 shadow-xl transition hover:bg-yellow-400 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-blue-900 sm:w-auto sm:text-lg">
                      Take Survey
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <LatestAnnouncements />

        <section id="why-gradtrack" className="bg-gray-50 py-12 sm:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-9 text-center sm:mb-16">
              <h2 className="mb-4 text-2xl font-bold text-blue-900 sm:text-4xl">Why GradTrack?</h2>
              <p className="text-base sm:text-xl text-gray-600 max-w-2xl mx-auto">
                Built specifically for Norzagaray College to turn graduate data into meaningful action.
              </p>
            </div>

            <div className="mb-12 grid gap-5 md:mb-16 md:grid-cols-3 md:gap-8">
              <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100 flex flex-col items-center text-center hover:shadow-md transition">
                <div className="bg-blue-100 p-4 rounded-full mb-5">
                  <BarChart2 className="w-8 h-8 text-blue-700" />
                </div>
                <h3 className="text-xl font-bold text-blue-900 mb-2">Graduate Career Insights</h3>
                <p className="text-gray-500 text-sm leading-relaxed">
                  Turn graduate responses into clear insights about employment status, job roles, companies, and industry trends.
                </p>
              </div>

              <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100 flex flex-col items-center text-center hover:shadow-md transition">
                <div className="bg-yellow-100 p-4 rounded-full mb-5">
                  <Bell className="w-8 h-8 text-yellow-600" />
                </div>
                <h3 className="text-xl font-bold text-blue-900 mb-2">Structured Tracer Surveys</h3>
                <p className="text-gray-500 text-sm leading-relaxed">
                  Admins build custom tracer surveys with multiple question types. Graduates answer directly online no paper forms, no manual encoding.
                </p>
              </div>

              <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-gray-100 flex flex-col items-center text-center hover:shadow-md transition">
                <div className="bg-blue-100 p-4 rounded-full mb-5">
                  <ShieldCheck className="w-8 h-8 text-blue-700" />
                </div>
                <h3 className="text-xl font-bold text-blue-900 mb-2">Protected Graduate Records</h3>
                <p className="text-gray-500 text-sm leading-relaxed">
                  Keep alumni information organized, protected, and ready for reports that support better academic planning.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
              {[
                { value: '4', label: 'Degree Programs Tracked', sub: 'BSCS, ACT, BSED/BEED, BSHM' },
                { value: '100%', label: 'Online Survey Process', sub: 'No paper forms needed' },
                { value: '1', label: 'Centralized Platform', sub: 'Surveys, data & reports in one place' },
              ].map((stat, i) => (
                <div key={i} className="bg-blue-900 rounded-2xl p-6 text-center">
                  <p className="text-4xl font-extrabold text-yellow-400 mb-1">{stat.value}</p>
                  <p className="text-white font-semibold text-sm mb-1">{stat.label}</p>
                  <p className="text-blue-300 text-xs">{stat.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white py-12 sm:py-20" id="how-it-works">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-10 text-center sm:mb-16">
              <h2 className="mb-4 text-2xl font-bold text-blue-900 sm:text-4xl">How It Works</h2>
              <p className="text-base sm:text-xl text-gray-600 max-w-3xl mx-auto">
                GradTrack starts with verified tracer survey responses, then connects graduates to community discussions, job opportunities, and outcome reports in one system.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
              <div className="space-y-7 sm:space-y-8">
                <div className="flex items-start space-x-4 group">
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 transition group-hover:bg-yellow-500 sm:h-16 sm:w-16">
                    <svg className="h-7 w-7 text-white sm:h-8 sm:w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-blue-900 mb-2">Graduate Verifies Identity</h3>
                    <p className="text-gray-600">
                      Graduates confirm their record using their student number or email before accessing the active tracer survey.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4 group">
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 transition group-hover:bg-yellow-500 sm:h-16 sm:w-16">
                    <svg className="h-7 w-7 text-white sm:h-8 sm:w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-blue-900 mb-2">Graduate Completes the Survey</h3>
                    <p className="text-gray-600">
                      The survey collects graduate profile, education, employment, training, career alignment, and feedback information online.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4 group">
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 transition group-hover:bg-yellow-500 sm:h-16 sm:w-16">
                    <svg className="h-7 w-7 text-white sm:h-8 sm:w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-blue-900 mb-2">Account Opens the Portal</h3>
                    <p className="text-gray-600">
                      After submitting the survey, graduates can create a GradTrack account to join the Community Forum and view job opportunities.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4 group">
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-blue-600 transition group-hover:bg-yellow-500 sm:h-16 sm:w-16">
                    <svg className="h-7 w-7 text-white sm:h-8 sm:w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-blue-900 mb-2">College Reviews the Results</h3>
                    <p className="text-gray-600">
                      GradTrack turns responses into analytics, reports, and review queues for forum posts and job posts before they appear in the portal.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Footer />
      </main>
    </div>
  );
}

export default HomePage;
