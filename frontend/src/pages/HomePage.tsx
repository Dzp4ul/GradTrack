import { Link } from 'react-router-dom';
import { Briefcase, TrendingUp, Users, BarChart2, Bell, ShieldCheck } from 'lucide-react';
import Footer from '../components/Footer';
import PublicNav from '../components/PublicNav';

function HomePage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-cover bg-center bg-fixed relative" style={{ backgroundImage: 'url(520382375_1065446909052636_3412465913398569974_n.jpg)' }}>
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/80 via-blue-800/80 to-blue-900/80 pointer-events-none"></div>
      <PublicNav />

      <main className="relative">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-blue-900/50"></div>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16 lg:py-20 relative">
            <div className="max-w-3xl">
              <div className="text-white space-y-6 sm:space-y-8">
                <div className="inline-block">
                  <img
                    src="/Gradtrack_Logo2.png"
                    alt="GradTrack Logo"
                    className="h-20 sm:h-24 object-contain mb-4 sm:mb-6"
                  />
                </div>
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight">
                  Connecting Graduates to Their Future
                </h2>
                <p className="text-base sm:text-lg lg:text-xl text-blue-100 leading-relaxed">
                  GradTrack empowers Norzagaray College to stay connected with alumni, track career progression, and ensure educational outcomes align with professional success.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                  <Link to="/survey" className="w-full bg-yellow-500 hover:bg-yellow-600 text-blue-900 px-8 py-4 rounded-lg font-bold text-base sm:text-lg transition shadow-xl text-center sm:w-auto">
                    Take Survey
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>



        <section id="about" className="bg-white py-14 sm:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10 sm:mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-blue-900 mb-4">About GradTrack</h2>
              <p className="text-base sm:text-xl text-gray-600 max-w-3xl mx-auto">
                GradTrack is Norzagaray College's official graduate tracking and survey management system built to monitor alumni outcomes, measure program effectiveness, and strengthen the bond between the college and its graduates.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-blue-50 to-white border border-blue-100 hover:shadow-xl transition">
                <div className="inline-block bg-blue-600 p-4 rounded-2xl mb-6">
                  <Users className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-blue-900 mb-3">For Graduates</h3>
                <p className="text-gray-600 leading-relaxed">
                  Complete tracer surveys, submit your employment details, and receive announcements from Norzagaray College all in one place.
                </p>
              </div>

              <div className="text-center p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-yellow-50 to-white border border-yellow-100 hover:shadow-xl transition">
                <div className="inline-block bg-yellow-500 p-4 rounded-2xl mb-6">
                  <TrendingUp className="w-8 h-8 text-blue-900" />
                </div>
                <h3 className="text-2xl font-bold text-blue-900 mb-3">Institutional Insights</h3>
                <p className="text-gray-600 leading-relaxed">
                  Gain a clear picture of graduate outcomes employment rates, industry distribution, and course-career alignment.
                </p>
              </div>

              <div className="text-center p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-blue-50 to-white border border-blue-100 hover:shadow-xl transition">
                <div className="inline-block bg-blue-600 p-4 rounded-2xl mb-6">
                  <Briefcase className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-blue-900 mb-3">Course-Career Alignment</h3>
                <p className="text-gray-600 leading-relaxed">
                  Automatically measures whether graduates are working in fields related to their degree, giving the college actionable data to improve its programs.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="why-gradtrack" className="bg-gray-50 py-14 sm:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10 sm:mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-blue-900 mb-4">Why GradTrack?</h2>
              <p className="text-base sm:text-xl text-gray-600 max-w-2xl mx-auto">
                Built specifically for Norzagaray College to turn graduate data into meaningful action.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 mb-16">
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

        <section className="bg-white py-14 sm:py-20" id="how-it-works">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10 sm:mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-blue-900 mb-4">How It Works</h2>
              <p className="text-base sm:text-xl text-gray-600 max-w-3xl mx-auto">
                GradTrack starts with verified tracer survey responses, then connects graduates to mentorship, job opportunities, and outcome reports in one system.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
              <div className="space-y-8">
                <div className="flex items-start space-x-4 group">
                  <div className="flex-shrink-0 w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center group-hover:bg-yellow-500 transition">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  <div className="flex-shrink-0 w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center group-hover:bg-yellow-500 transition">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  <div className="flex-shrink-0 w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center group-hover:bg-yellow-500 transition">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-blue-900 mb-2">Account Opens the Portal</h3>
                    <p className="text-gray-600">
                      After submitting the survey, graduates can create a GradTrack account to browse mentors, request guidance, and view job opportunities.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4 group">
                  <div className="flex-shrink-0 w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center group-hover:bg-yellow-500 transition">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-blue-900 mb-2">College Reviews the Results</h3>
                    <p className="text-gray-600">
                      GradTrack turns responses into analytics, reports, and approval queues for mentor profiles and job posts before they appear in the portal.
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
