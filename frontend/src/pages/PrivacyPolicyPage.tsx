import { Link } from 'react-router-dom';
import Footer from '../components/Footer';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">

      {/* Nav */}
      <nav className="bg-blue-900/95 backdrop-blur-sm shadow-lg sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <Link to="/" className="flex items-center space-x-4">
              <img src="/Gradtrack_small.png" alt="GradTrack" className="h-16 w-16 object-contain" />
              <div>
                <h1 className="text-xl font-bold text-white">GradTrack</h1>
                <p className="text-sm text-blue-100">Graduate Tracer System</p>
              </div>
            </Link>
            <div className="flex items-center space-x-6">
              <Link to="/about" className="text-white hover:text-yellow-400 font-medium transition">About</Link>
              <Link to="/#why-gradtrack" className="text-white hover:text-yellow-400 font-medium transition">Features</Link>
              <Link to="/faq" className="text-white hover:text-yellow-400 font-medium transition">FAQ's</Link>
              <Link to="/survey" className="bg-yellow-500 hover:bg-yellow-600 text-blue-900 px-6 py-2.5 rounded-lg font-medium transition shadow-md">
                Take Survey
              </Link>
            </div>
          </div>
        </div>
      </nav>


      {/* Content */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-8xl mx-auto px-6 space-y-10 text-gray-700 leading-relaxed">

          <p>
            Your privacy is important to us. Norzagaray College ("us", "we", or "our") operates the GradTrack graduate tracer system. All information provided by graduates and users of this system will be used solely for the purpose of tracking graduate outcomes, measuring program effectiveness, and supporting institutional reporting. We are committed to respecting your privacy and complying with applicable laws and regulations regarding any personal information we may collect.
          </p>
          <p>
            This policy is effective as of January 1, 2026, and was last updated on January 1, 2026.
          </p>

          <div>
            <h2 className="text-3xl font-bold text-blue-900 mb-3">Information We Collect</h2>
            <p>
              Information we collect includes both information you knowingly and actively provide us when using or participating in any of our services, and any information automatically sent by your devices in the course of accessing our system.
            </p>
          </div>

          <div>
            <h2 className="text-3xl font-bold text-blue-900 mb-3">Log Data</h2>
            <p>
              When you visit our system, our servers may automatically log the standard data provided by your web browser. It may include your device's Internet Protocol (IP) address, your browser type and version, the pages you visit, the time and date of your visit, the time spent on each page, and other details about your visit.
            </p>
            <p className="mt-3">
              Please be aware that while this information may not be personally identifying by itself, it may be possible to combine it with other data to personally identify individual persons.
            </p>
          </div>

          <div>
            <h2 className="text-3xl font-bold text-blue-900 mb-3">Personal Information</h2>
            <p className="mb-3">We may ask for personal information, which may include one or more of the following:</p>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li>Full name</li>
              <li>Email address</li>
              <li>Phone/mobile number</li>
              <li>Home/mailing address</li>
              <li>Date of birth</li>
              <li>Degree program and graduation year</li>
              <li>Employment information (job title, company, industry)</li>
            </ul>
          </div>

          <div>
            <h2 className="text-3xl font-bold text-blue-900 mb-3">Legitimate Reasons for Processing Your Personal Information</h2>
            <p>
              We only collect and use your personal information when we have a legitimate reason for doing so. In which instance, we only collect personal information that is reasonably necessary to provide our services to you — specifically, to conduct graduate tracer studies and generate employment outcome reports for Norzagaray College.
            </p>
          </div>

          <div>
            <h2 className="text-3xl font-bold text-blue-900 mb-3">Collection and Use of Information</h2>
            <p className="mb-3">We may collect personal information from you when you do any of the following on our system:</p>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li>Register as a graduate in the GradTrack system</li>
              <li>Complete a tracer survey</li>
              <li>Submit employment or career information</li>
              <li>Use a web browser to access our content</li>
              <li>Contact us via email or any similar technologies</li>
            </ul>
          </div>

          <div>
            <h2 className="text-3xl font-bold text-blue-900 mb-3">Security of Your Personal Information</h2>
            <p>
              When we collect and process personal information, and while we retain this information, we will protect it within commercially acceptable means to prevent loss and theft, as well as unauthorized access, disclosure, copying, use, or modification. Access to graduate data is restricted by role — only authorized administrators, registrars, and deans may view graduate records within their scope.
            </p>
          </div>

          <div>
            <h2 className="text-3xl font-bold text-blue-900 mb-3">How Long We Keep Your Information</h2>
            <p>
              We keep your personal information only for as long as we need to. This time period may depend on what we are using your information for, in accordance with this privacy policy. If your personal information is no longer required, we will delete it or make it anonymous by removing all details that identify you.
            </p>
            <p className="mt-3">
              However, if necessary, we may retain your personal information for our compliance with a legal, accounting, or reporting obligation or for archiving purposes in the public interest, scientific or historical research purposes, or statistical purposes.
            </p>
          </div>

          <div>
            <h2 className="text-3xl font-bold text-blue-900 mb-3">Children's Privacy</h2>
            <p>
              We do not aim any of our products or services directly at children under the age of 13, and we do not knowingly collect personal information about children under 13. GradTrack is intended for use by college graduates and authorized institutional staff only.
            </p>
          </div>

          <div>
            <h2 className="text-3xl font-bold text-blue-900 mb-3">Disclosure of Personal Information to Third Parties</h2>
            <p className="mb-3">We may disclose personal information to:</p>
            <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li>Authorized personnel of Norzagaray College (administrators, registrars, deans)</li>
              <li>Third-party service providers for the purpose of hosting and maintaining the system (e.g., cloud infrastructure providers)</li>
              <li>Government or accrediting bodies as required by law or institutional reporting obligations</li>
              <li>Courts, tribunals, regulatory authorities, and law enforcement officers, as required by law</li>
            </ul>
          </div>

          <div>
            <h2 className="text-3xl font-bold text-blue-900 mb-3">Your Rights and Controlling Your Personal Information</h2>
            <p>
              You always retain the right to withhold personal information from us, with the understanding that your experience of our system may be affected. We will not discriminate against you for exercising any of your rights over your personal information.
            </p>
            <p className="mt-3">
              If you believe that any information we hold about you is inaccurate, out of date, incomplete, irrelevant, or misleading, please contact us using the details provided in this privacy policy. We will take reasonable steps to correct any information found to be inaccurate, incomplete, misleading, or out of date.
            </p>
          </div>

          <div>
            <h2 className="text-3xl font-bold text-blue-900 mb-3">Contact Us</h2>
            <p>
              For any questions or concerns regarding your privacy, you may contact us using the following details:
            </p>
            <p className="mt-3 font-semibold text-blue-900">Norzagaray College — GradTrack System</p>
            <p className="text-blue-700">norzagaraycollege2007@gmail.com</p>
            <p className="text-gray-600">Norzagaray, Bulacan | Mon–Fri: 8:00 AM – 5:00 PM</p>
          </div>

        </div>
      </section>

      <Footer />
    </div>
  );
}
