import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-screen-2xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <img src="/Gradtrack_small.png" alt="GradTrack" className="h-10 w-10 object-contain" />
              <div>
                <h3 className="text-lg font-bold text-gray-900">GradTrack</h3>
                <p className="text-xs text-gray-500">Graduate Tracer System</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-gray-600">
              Empowering graduates and strengthening connections for a brighter future.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-900">Quick Links</h4>
            <ul className="space-y-3">
              <li>
                <Link to="/about" className="text-sm text-gray-600 transition hover:text-blue-700">
                  About Us
                </Link>
              </li>
              <li>
                <Link to="/faq" className="text-sm text-gray-600 transition hover:text-blue-700">
                  FAQs
                </Link>
              </li>
              <li>
                <Link to="/survey" className="text-sm text-gray-600 transition hover:text-blue-700">
                  Take Survey
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact Information */}
          <div>
            <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-900">Contact</h4>
            <ul className="space-y-3 text-sm text-gray-600">
              <li>
                <span className="font-semibold text-gray-800">Email:</span>
                <br />
                <a href="mailto:norzagaraycollege2007@gmail.com" className="text-blue-700 hover:underline">
                  norzagaraycollege2007@gmail.com
                </a>
              </li>
              <li>
                <span className="font-semibold text-gray-800">Location:</span>
                <br />
                Norzagaray, Bulacan
              </li>
              <li>
                <span className="font-semibold text-gray-800">Hours:</span>
                <br />
                Mon-Fri: 8:00 AM - 5:00 PM
              </li>
            </ul>
          </div>

          {/* Social & Legal */}
          <div>
            <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-900">Follow Us</h4>
            <div className="flex gap-3">
              <a
                href="https://www.facebook.com/norzagaraycollege2007"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition hover:bg-blue-700 hover:text-white"
                aria-label="Facebook"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
              </a>
            </div>
            <div className="mt-6">
              <h5 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-900">Legal</h5>
              <Link to="/privacy-policy" className="text-sm text-gray-600 transition hover:text-blue-700">
                Privacy Policy
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-gray-100 pt-6 text-center">
          <p className="text-sm text-gray-500">&copy; 2026 Norzagaray College. All rights reserved.</p>
          <p className="mt-1 text-xs text-gray-400">Empowering graduates, strengthening connections</p>
        </div>
      </div>
    </footer>
  );
}