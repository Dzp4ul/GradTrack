import { Link } from 'react-router-dom';
import { Briefcase, TrendingUp, Users } from 'lucide-react';
import { useState, useEffect } from 'react';

function HomePage() {
  useEffect(() => {
    // Component setup
  }, []);

  return (
    <div className="min-h-screen bg-cover bg-center bg-fixed relative" style={{ backgroundImage: 'url(520382375_1065446909052636_3412465913398569974_n.jpg)' }}>
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/80 via-blue-800/80 to-blue-900/80 pointer-events-none"></div>
      <nav className="bg-blue-900/95 backdrop-blur-sm shadow-lg sticky top-0 z-50 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center space-x-4">
              <img
                src="/logo.png"
                alt="Norzagaray College"
                className="h-16 w-16 object-contain"
              />
              <div>
                <h1 className="text-xl font-bold text-white">Norzagaray College</h1>
                <p className="text-sm text-blue-100">Alumni Tracking System</p>
              </div>
            </div>
            <div className="flex items-center space-x-6">
              <a href="#about" className="text-white hover:text-yellow-400 font-medium transition">About</a>
              <a href="#features" className="text-white hover:text-yellow-400 font-medium transition">Features</a>
              <a href="#" className="text-white hover:text-yellow-400 font-medium transition">FAQ</a>
              <Link to="/survey" className="text-white hover:text-yellow-400 font-medium transition">Survey</Link>
              <Link to="/signup" className="bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white px-6 py-2 rounded-lg font-medium transition border-2 border-white/30">
                Sign Up
              </Link>
              <Link to="/signin" className="bg-yellow-500 hover:bg-yellow-600 text-blue-900 px-6 py-2.5 rounded-lg font-medium transition shadow-md hover:shadow-lg">
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-blue-900/50"></div>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 relative">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className="text-white space-y-8">
                <div className="inline-block">
                  <img
                    src="Gemini_Generated_Image_d1z1yd1z1yd1z1yd (2) (1).png"
                    alt="GradTrack Logo"
                    className="h-24 object-contain mb-6"
                  />
                </div>
                <h2 className="text-5xl font-bold leading-tight">
                  Connecting Graduates to Their Future
                </h2>
                <p className="text-xl text-blue-100 leading-relaxed">
                  GradTrack empowers Norzagaray College to stay connected with alumni, track career progression, and ensure educational outcomes align with professional success.
                </p>
                <div className="flex space-x-4">
                  <Link to="/signup" className="bg-yellow-500 hover:bg-yellow-600 text-blue-900 px-8 py-4 rounded-lg font-bold text-lg transition shadow-xl hover:shadow-2xl hover:scale-105 transform">
                    Get Started
                  </Link>
                  <button className="bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white px-8 py-4 rounded-lg font-bold text-lg transition border-2 border-white/30">
                    Learn More
                  </button>
                </div>
              </div>

              
            </div>
          </div>
        </section>



        <section id="about" className="bg-white py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-blue-900 mb-4">About GradTrack</h2>
              <p className="text-xl text-gray-600 max-w-3xl mx-auto">
                A comprehensive alumni tracking system designed to bridge the gap between education and career success
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center p-8 rounded-2xl bg-gradient-to-br from-blue-50 to-white border border-blue-100 hover:shadow-xl transition">
                <div className="inline-block bg-blue-600 p-4 rounded-2xl mb-6">
                  <Users className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-blue-900 mb-3">For Graduates</h3>
                <p className="text-gray-600 leading-relaxed">
                  Share your employment information, complete surveys, and stay connected with your alma mater through announcements and updates.
                </p>
              </div>

              <div className="text-center p-8 rounded-2xl bg-gradient-to-br from-yellow-50 to-white border border-yellow-100 hover:shadow-xl transition">
                <div className="inline-block bg-yellow-500 p-4 rounded-2xl mb-6">
                  <TrendingUp className="w-8 h-8 text-blue-900" />
                </div>
                <h3 className="text-2xl font-bold text-blue-900 mb-3">Data-Driven Insights</h3>
                <p className="text-gray-600 leading-relaxed">
                  Analyze employment trends, track course-to-career alignment, and make informed decisions about curriculum development.
                </p>
              </div>

              <div className="text-center p-8 rounded-2xl bg-gradient-to-br from-blue-50 to-white border border-blue-100 hover:shadow-xl transition">
                <div className="inline-block bg-blue-600 p-4 rounded-2xl mb-6">
                  <Briefcase className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-blue-900 mb-3">Career Tracking</h3>
                <p className="text-gray-600 leading-relaxed">
                  Monitor graduate career progression, identify successful outcomes, and ensure educational programs meet industry demands.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="bg-gradient-to-br from-blue-900 to-blue-800 py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-white mb-4">Key Features</h2>
              <p className="text-xl text-blue-100 max-w-3xl mx-auto">
                Everything you need to effectively track and engage with alumni
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { title: 'Graduate Surveys', desc: 'Comprehensive questionnaires for data collection' },
                { title: 'Employment Tracking', desc: 'Real-time job and career information' },
                { title: 'Announcements', desc: 'Keep graduates informed and engaged' },
                { title: 'Course Alignment', desc: 'Measure education-to-career fit' },
                { title: 'Analytics Dashboard', desc: 'Visual insights and reports' },
                { title: 'Secure Access', desc: 'Protected graduate information' },
                { title: 'Easy Updates', desc: 'Simple profile management' },
                { title: 'Engagement Tools', desc: 'Foster lasting connections' }
              ].map((feature, index) => (
                <div key={index} className="bg-white/10 backdrop-blur-sm p-6 rounded-xl border border-white/20 hover:bg-white/15 transition">
                  <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
                  <p className="text-blue-100 text-sm">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white py-20" id="how-it-works">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-blue-900 mb-4">How It Works</h2>
              <p className="text-xl text-gray-600 max-w-3xl mx-auto">
                With GradTrack, your school can stop juggling incomplete data and outdated information. Get everything you need to track and validate your school's impact—all in one place.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div className="space-y-8">
                <div className="flex items-start space-x-4 group">
                  <div className="flex-shrink-0 w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center group-hover:bg-yellow-500 transition">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-blue-900 mb-2">Complete Graduate Survey</h3>
                    <p className="text-gray-600">
                      Graduates answer comprehensive surveys tailored to gather essential employment and career information.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4 group">
                  <div className="flex-shrink-0 w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center group-hover:bg-yellow-500 transition">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-blue-900 mb-2">Submit Employment Information</h3>
                    <p className="text-gray-600">
                      Graduates provide detailed job information, including position, company, and industry to track career paths.
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
                    <h3 className="text-xl font-bold text-blue-900 mb-2">Analyze Course Alignment</h3>
                    <p className="text-gray-600">
                      The system automatically analyzes if graduates' jobs align with their taken courses, providing valuable insights.
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
                    <h3 className="text-xl font-bold text-blue-900 mb-2">Stay Connected with Announcements</h3>
                    <p className="text-gray-600">
                      Graduates can view important announcements, events, and updates from the college, maintaining a strong alumni network.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <footer className="bg-blue-950 text-white py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
              <div>
                <div className="flex items-center space-x-3 mb-4">
                  <img
                    src="/logo.png"
                    alt="Norzagaray College"
                    className="h-12 w-12 object-contain"
                  />
                  <div>
                    <h3 className="font-bold text-lg">Norzagaray College</h3>
                    <p className="text-blue-200 text-xs">GradTrack Alumni System</p>
                  </div>
                </div>
                <p className="text-blue-300 text-sm leading-relaxed">
                  Empowering graduates and strengthening connections for a brighter future.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-lg mb-4">Quick Links</h4>
                <ul className="space-y-2">
                  <li><a href="#about" className="text-blue-200 hover:text-yellow-400 transition text-sm">About Us</a></li>
                  <li><a href="#features" className="text-blue-200 hover:text-yellow-400 transition text-sm">Features</a></li>
                  <li><a href="#" className="text-blue-200 hover:text-yellow-400 transition text-sm">FAQs</a></li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-lg mb-4">Contact Information</h4>
                <ul className="space-y-3 text-sm">
                  <li className="flex items-start space-x-2">
                    <span className="text-yellow-400 mt-1"></span>
                    <span className="text-blue-200">norzagaraycollege2007@gmail.com</span>
                  </li> 
                  <li className="flex items-start space-x-2">
                    <span className="text-yellow-400 mt-1"></span>
                    <span className="text-blue-200">Norzagaray, Bulacan</span>
                  </li>                  
                  <li className="flex items-start space-x-2">
                    <span className="text-yellow-400"></span>
                    <span className="text-blue-200">Mon-Fri: 8:00 AM - 5:00 PM</span>
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-lg mb-4">Follow Us</h4>
                <div className="flex space-x-4 mb-6">
                  <a href="https://www.facebook.com/norzagaraycollege2007" className="bg-blue-800 hover:bg-yellow-500 p-3 rounded-full transition transform hover:scale-110" aria-label="Facebook">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                  </a>
                 
                </div>
                <h5 className="font-semibold text-sm mb-2">Legal</h5>
                <ul className="space-y-2">
                  <li><a href="#" className="text-blue-200 hover:text-yellow-400 transition text-sm">Privacy Policy</a></li>
                  <li><a href="#" className="text-blue-200 hover:text-yellow-400 transition text-sm">Terms of Service</a></li>
                  <li><a href="#" className="text-blue-200 hover:text-yellow-400 transition text-sm">Data Protection</a></li>
                </ul>
              </div>
            </div>

            <div className="border-t border-blue-800 pt-8 text-center">
              <p className="text-blue-200 text-sm">&copy; 2026 Norzagaray College. All rights reserved.</p>
              <p className="text-blue-300 text-xs mt-2">Empowering graduates, strengthening connections</p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

export default HomePage;
