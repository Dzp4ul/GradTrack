import { Link } from 'react-router-dom';
import Footer from '../components/Footer';
import PublicNav from '../components/PublicNav';

export default function AboutPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-white">

      {/* Nav */}
      <PublicNav active="about" />

      {/* Mission Hero */}
      <section className="bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 py-14 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid md:grid-cols-2 gap-8 md:gap-12 items-center">
          <div className="flex justify-center">
            <img src="/GradTrack_bw.png" alt="GradTrack" className="h-40 sm:h-64 object-contain" />
          </div>
          <div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-yellow-400 mb-4 sm:mb-6">Our Mission</h2>
            <p className="text-lg sm:text-2xl text-white leading-relaxed">
              To make graduate tracer activities at Norzagaray College more organized, and reliable by providing a platform that supports graduate data management, surveys, analytics, reporting, community discussion, and job opportunities in one accessible system.
            </p>
          </div>
        </div>
      </section>

      {/* Orange divider */}
      <div className="h-2 bg-yellow-500" />

      {/* The Challenge */}
      <section className="py-14 sm:py-24 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid md:grid-cols-2 gap-8 md:gap-16 items-center">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              <span className="text-yellow-500">The Challenge: </span>
              <span className="text-blue-900">Scattered & Incomplete Data</span>
            </h2>
            <p className="text-gray-600 leading-relaxed text-base sm:text-lg">
              Colleges often rely on manual follow-ups, paper forms, or informal channels to gather graduate information. The results are scattered, hard to analyze, and rarely give a complete picture of graduate outcomes or program impact.
            </p>
          </div>
          <div className="flex justify-center">
            <img src="/CHALLENGE (1).png" alt="GradTrack" className="h-48 sm:h-64 object-contain" />
          </div>
        </div>
      </section>

      {/* The Solution */}
      <section className="py-14 sm:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid md:grid-cols-2 gap-8 md:gap-16 items-center">
          <img src="/GRADTRACK_POV.png" alt="GradTrack" className="h-64 sm:h-96 w-full object-contain" />
          <div className="order-1 md:order-2">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              <span className="text-yellow-500">The Solution: </span>
              <span className="text-blue-900">GradTrack</span>
            </h2>
            <p className="text-gray-600 leading-relaxed text-base sm:text-lg">
              GradTrack centralizes the entire graduate tracking process — from structured tracer surveys to automated course-career alignment analysis — giving the college clean, actionable data in one place.
            </p>
          </div>
        </div>
      </section>

      {/* The Impact */}
      <section className="bg-gray-100 border-b-4 border-yellow-500 overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid md:grid-cols-2 gap-8 md:gap-12 items-stretch">
          <div className="flex flex-col justify-center py-12 sm:py-16">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">
              <span className="text-yellow-500">The Impact: </span>
              <span className="text-blue-900">Clear Results That Support Your Work</span>
            </h2>
            <p className="text-gray-600 leading-relaxed text-base sm:text-lg">
              GradTrack gives Norzagaray College a reliable way to track graduate outcomes and share results with faculty, administrators, and accrediting bodies. Collect employment data, review survey results, and use accurate information to support program decisions and meet reporting requirements.
            </p>
          </div>
          <div className="flex items-end justify-end">
            <img
              src="/download (2).png"
              alt="Graduate celebrating"
              className="w-auto object-contain object-bottom" style={{ height: '110%', maxHeight: '500px', marginBottom: '-4px' }}
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 sm:py-16 bg-yellow-500">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-blue-900 mb-4">Ready to get started?</h2>
          <p className="text-blue-800 mb-8 text-base sm:text-lg">If you are a Norzagaray College graduate, take the tracer survey now.</p>
          <Link to="/survey" className="inline-block w-full bg-blue-900 hover:bg-blue-800 text-white px-10 py-4 rounded-lg font-bold text-base sm:text-lg transition shadow-lg sm:w-auto">
            Take the Survey
          </Link>
        </div>
      </section>

      <Footer />

    </div>
  );
}
