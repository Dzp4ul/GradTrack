import { Link } from 'react-router-dom';
import { Target, AlertTriangle, CheckCircle, Users, BarChart2, ShieldCheck } from 'lucide-react';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white">

      {/* Nav */}
      <nav className="bg-blue-900/95 backdrop-blur-sm shadow-lg sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <Link to="/" className="flex items-center space-x-4">
              <img src="/logo.png" alt="Norzagaray College" className="h-16 w-16 object-contain" />
              <div>
                <h1 className="text-xl font-bold text-white">Norzagaray College</h1>
                <p className="text-sm text-blue-100">Alumni Tracking System</p>
              </div>
            </Link>
            <div className="flex items-center space-x-6">
              <Link to="/about" className="text-yellow-400 font-medium">About</Link>
              <Link to="/#why-gradtrack" className="text-white hover:text-yellow-400 font-medium transition">Features</Link>
              <Link to="/" className="text-white hover:text-yellow-400 font-medium transition">FAQ</Link>
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
            <div className="w-64 h-64 bg-white/10 rounded-full flex items-center justify-center">
              <Target className="w-32 h-32 text-yellow-400 opacity-80" />
            </div>
          </div>
          <div>
            <h2 className="text-4xl font-extrabold text-yellow-400 mb-6">Our Mission</h2>
            <p className="text-2xl text-white leading-relaxed">
              To provide Norzagaray College with a reliable system to accurately track graduate outcomes, measure program effectiveness, and support data-driven decisions for academic improvement.
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
            <div className="relative w-72 h-72">
              <div className="absolute inset-0 bg-blue-700 rounded-full opacity-20" />
              <div className="absolute inset-8 bg-blue-600 rounded-full opacity-30" />
              <div className="absolute inset-0 flex items-center justify-center">
                <AlertTriangle className="w-28 h-28 text-yellow-500" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* The Solution */}
      <section className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-16 items-center">
          <div className="flex justify-center order-2 md:order-1">
            <div className="relative w-72 h-72">
              <div className="absolute inset-0 bg-yellow-400 rounded-full opacity-20" />
              <div className="absolute inset-8 bg-yellow-500 rounded-full opacity-20" />
              <div className="absolute inset-0 flex items-center justify-center">
                <CheckCircle className="w-28 h-28 text-blue-700" />
              </div>
            </div>
          </div>
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

      {/* Who It Serves */}
      <section className="py-20 bg-blue-900">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-white text-center mb-12">Who It Serves</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: <Users className="w-8 h-8 text-white" />,
                bg: 'bg-blue-700',
                title: 'Graduates',
                desc: 'Complete tracer surveys online and submit employment details — no paper forms, no manual process.',
              },
              {
                icon: <BarChart2 className="w-8 h-8 text-blue-900" />,
                bg: 'bg-yellow-400',
                title: 'Registrar & Admin',
                desc: 'Manage graduate records, create surveys, view responses, and generate employment reports.',
              },
              {
                icon: <ShieldCheck className="w-8 h-8 text-white" />,
                bg: 'bg-blue-700',
                title: 'Deans',
                desc: 'Monitor survey completion status and review graduate outcomes specific to their college and programs.',
              },
            ].map((item, i) => (
              <div key={i} className="bg-white/10 rounded-2xl p-8 text-center border border-white/20 hover:bg-white/15 transition">
                <div className={`inline-flex ${item.bg} p-4 rounded-2xl mb-5`}>
                  {item.icon}
                </div>
                <h3 className="text-xl font-bold text-white mb-3">{item.title}</h3>
                <p className="text-blue-200 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
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

      {/* Footer */}
      <footer className="bg-blue-950 text-white py-8 text-center">
        <p className="text-blue-200 text-sm">&copy; 2026 Norzagaray College. All rights reserved.</p>
        <p className="text-blue-300 text-xs mt-1">Empowering graduates, strengthening connections</p>
      </footer>

    </div>
  );
}
