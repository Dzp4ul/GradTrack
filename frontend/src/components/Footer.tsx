import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="bg-blue-950 text-white py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
          <div>
            <div className="flex items-center space-x-3 mb-4">
              <img src="/Gradtrack_small.png" alt="GradTrack" className="h-12 w-12 object-contain" />
              <div>
                <h3 className="font-bold text-lg">GradTrack</h3>
                <p className="text-blue-200 text-xs">Graduate Tracer System</p>
              </div>
            </div>
            <p className="text-blue-300 text-sm leading-relaxed">
              Empowering graduates and strengthening connections for a brighter future.
            </p>
          </div>

          <div>
            <h4 className="font-bold text-lg mb-4">Quick Links</h4>
            <ul className="space-y-2">
              <li><a href="/#about" className="text-blue-200 hover:text-yellow-400 transition text-sm">About Us</a></li>
              <li><a href="/#why-gradtrack" className="text-blue-200 hover:text-yellow-400 transition text-sm">Features</a></li>
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
              <li><Link to="/privacy-policy" className="text-blue-200 hover:text-yellow-400 transition text-sm">Privacy Policy</Link></li>
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
  );
}
