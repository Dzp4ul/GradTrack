import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import Footer from '../components/Footer';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white">

      {/* Nav */}
      <nav className="bg-blue-900/95 backdrop-blur-sm shadow-lg sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <Link to="/" className="flex items-center space-x-4">
              <img src="/Gradtrack_small.png" alt="Norzagaray College" className="h-16 w-16 object-contain" />
              <div>
                <h1 className="text-xl font-bold text-white">GradTrack</h1>
                <p className="text-sm text-blue-100">Graduate Tracer System</p>
              </div>
            </Link>
            <div className="flex items-center space-x-6">
              <Link to="/about" className="text-yellow-400 font-medium">About</Link>
              <Link to="/#why-gradtrack" className="text-white hover:text-yellow-400 font-medium transition">Features</Link>
              <Link to="/faq" className="text-white hover:text-yellow-400 font-medium transition">FAQ</Link>
              <Link to="/survey" className="bg-yellow-500 hover:bg-yellow-600 text-blue-900 px-6 py-2.5 rounded-lg font-medium transition shadow-md">
                Take Survey
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Mission Hero */}
      <section className="bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 py-20">
        <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">
          <div className="flex justify-center">
            <img src="/GradTrack_bw.png" alt="GradTrack" className="h-64 object-contain" />
          </div>
          <div>
            <h2 className="text-4xl font-extrabold text-yellow-400 mb-6">Our Mission</h2>
            <p className="text-2xl text-white leading-relaxed">
              To make graduate tracer activities at Norzagaray College more organized, and reliable by providing a platform that supports graduate data management, surveys, analytics, reporting, mentorship, and job opportunities in one accessible system.
            </p>
          </div>
        </div>
      </section>

      {/* Orange divider */}
      <div className="h-2 bg-yellow-500" />

      {/* The Challenge */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-3xl font-bold mb-4">
              <span className="text-yellow-500">The Challenge: </span>
              <span className="text-blue-900">Scattered & Incomplete Data</span>
            </h2>
            <p className="text-gray-600 leading-relaxed text-lg">
              Colleges often rely on manual follow-ups, paper forms, or informal channels to gather graduate information. The results are scattered, hard to analyze, and rarely give a complete picture of graduate outcomes or program impact.
            </p>
          </div>
          <div className="flex justify-center">
            <img src="/CHALLENGE (1).png" alt="GradTrack" className="h-64 object-contain" />
          </div>
        </div>
      </section>

      {/* The Solution */}
      <section className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-16 items-center">
          <img src="/GRADTRACK_POV.png" alt="GradTrack" className="h-150 object-contain" />
          <div className="order-1 md:order-2">
            <h2 className="text-3xl font-bold mb-4">
              <span className="text-yellow-500">The Solution: </span>
              <span className="text-blue-900">GradTrack</span>
            </h2>
            <p className="text-gray-600 leading-relaxed text-lg">
              GradTrack centralizes the entire graduate tracking process — from structured tracer surveys to automated course-career alignment analysis — giving the college clean, actionable data in one place.
            </p>
          </div>
        </div>
      </section>

      {/* The Impact */}
      <section className="bg-gray-100 border-b-4 border-yellow-500 overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-stretch">
          <div className="flex flex-col justify-center py-16">
            <h2 className="text-3xl font-bold mb-4">
              <span className="text-yellow-500">The Impact: </span>
              <span className="text-blue-900">Clear Results That Support Your Work</span>
            </h2>
            <p className="text-gray-600 leading-relaxed text-lg">
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
      <section className="py-16 bg-yellow-500">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-blue-900 mb-4">Ready to get started?</h2>
          <p className="text-blue-800 mb-8 text-lg">If you are a Norzagaray College graduate, take the tracer survey now.</p>
          <Link to="/survey" className="bg-blue-900 hover:bg-blue-800 text-white px-10 py-4 rounded-lg font-bold text-lg transition shadow-lg">
            Take the Survey
          </Link>
        </div>
      </section>

      <Footer />

    </div>
  );
}
