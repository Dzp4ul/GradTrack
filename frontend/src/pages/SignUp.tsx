import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';

function SignUp() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    phone: '',
    dateOfBirth: '',
    gender: '',
    course: '',
    yearGraduated: '',
    address: '',
    password: '',
    confirmPassword: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      alert('Passwords do not match!');
      return;
    }
    // TODO: Handle sign up logic
    console.log('Sign up:', formData);
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 30 }, (_, i) => currentYear - i);

  return (
    <div className="flex min-h-screen">
      {/* Left Side - Fixed Branding */}
      <div className="hidden md:flex md:w-1/2 bg-cover bg-center fixed top-0 left-0 h-screen items-center justify-center" style={{ backgroundImage: 'url(520382375_1065446909052636_3412465913398569974_n.jpg)' }}>
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/85 via-blue-800/85 to-blue-900/85"></div>
        <div className="text-center px-12 relative z-10">
          <img
            src="/logo.png"
            alt="Norzagaray College"
            className="h-32 w-32 object-contain mx-auto mb-8"
          />
          <h2 className="text-3xl font-bold text-white mb-4">Norzagaray College</h2>
          <p className="text-blue-200 text-lg mb-4">GradTrack Alumni Tracking System</p>
          <p className="text-blue-300 text-sm max-w-sm mx-auto mb-8">
            Create an account to share your career journey and stay connected with your alma mater.
          </p>
          <Link
            to="/"
            className="inline-block bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white px-8 py-3 rounded-lg font-medium transition border-2 border-white/30"
          >
            Back to Home
          </Link>
        </div>
      </div>

      {/* Right Side - Scrollable Sign Up Form */}
      <div className="w-full md:w-1/2 md:ml-[50%] min-h-screen bg-gray-50 overflow-y-auto">
        <div className="w-full max-w-2xl mx-auto px-10 py-10">
          {/* Mobile back link */}
          <div className="md:hidden mb-8 text-center">
            <img
              src="/logo.png"
              alt="Norzagaray College"
              className="h-16 w-16 object-contain mx-auto mb-4"
            />
            <Link to="/" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
              ← Back to Home
            </Link>
          </div>

          <div className="flex justify-center mb-6">
            <img
              src="/GRADTRACK_LOGO1.png"
              alt="GradTrack Logo"
              className="h-20 object-contain"
            />
          </div>
          <h1 className="text-3xl font-bold text-blue-900 text-center mb-2">Sign Up</h1>
          <p className="text-gray-500 text-center mb-8">Please fill out the details below.</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name Fields */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="firstName" className="block text-sm font-semibold text-gray-700 mb-1">
                  First name
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={handleChange}
                  placeholder="Juan"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                  required
                />
              </div>
              <div>
                <label htmlFor="middleName" className="block text-sm font-semibold text-gray-700 mb-1">
                  Middle name <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  id="middleName"
                  name="middleName"
                  type="text"
                  value={formData.middleName}
                  onChange={handleChange}
                  placeholder="Santos"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                />
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-semibold text-gray-700 mb-1">
                  Last name
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={handleChange}
                  placeholder="Dela Cruz"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                  required
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-1">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="you@example.com"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                required
              />
            </div>

            {/* Phone Number */}
            <div>
              <label htmlFor="phone" className="block text-sm font-semibold text-gray-700 mb-1">
                Phone number
              </label>
              <div className="flex">
                <span className="inline-flex items-center px-3 bg-gray-100 border border-r-0 border-gray-300 rounded-l-lg text-gray-500 text-sm">
                  +63
                </span>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="9XXXXXXXXX"
                  pattern="[0-9]{10}"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-r-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                  required
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">Format: +63 followed by 10 digits</p>
            </div>

            {/* Date of Birth and Gender */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="dateOfBirth" className="block text-sm font-semibold text-gray-700 mb-1">
                  Date of birth
                </label>
                <input
                  id="dateOfBirth"
                  name="dateOfBirth"
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                  required
                />
              </div>
              <div>
                <label htmlFor="gender" className="block text-sm font-semibold text-gray-700 mb-1">
                  Gender
                </label>
                <select
                  id="gender"
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm bg-white"
                  required
                >
                  <option value="" disabled>Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="prefer-not-to-say">Prefer not to say</option>
                </select>
              </div>
            </div>

            {/* Course/Program */}
            <div>
              <label htmlFor="course" className="block text-sm font-semibold text-gray-700 mb-1">
                Course / Program
              </label>
              <select
                id="course"
                name="course"
                value={formData.course}
                onChange={handleChange}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm bg-white"
                required
              >
                <option value="" disabled>Select your course</option>
                <option value="bsit">BS Information Technology</option>
                <option value="bsba">BS Business Administration</option>
                <option value="bsed">BS Education</option>
                <option value="bscrim">BS Criminology</option>
                <option value="bshm">BS Hospitality Management</option>
                <option value="bstm">BS Tourism Management</option>
                <option value="bscs">BS Computer Science</option>
                <option value="bsn">BS Nursing</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Year Graduated */}
            <div>
              <label htmlFor="yearGraduated" className="block text-sm font-semibold text-gray-700 mb-1">
                Year graduated
              </label>
              <select
                id="yearGraduated"
                name="yearGraduated"
                value={formData.yearGraduated}
                onChange={handleChange}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm bg-white"
                required
              >
                <option value="" disabled>Select year</option>
                {years.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>

            {/* Address */}
            <div>
              <label htmlFor="address" className="block text-sm font-semibold text-gray-700 mb-1">
                Address
              </label>
              <input
                id="address"
                name="address"
                type="text"
                value={formData.address}
                onChange={handleChange}
                placeholder="Enter your address"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm"
                required
              />
            </div>

            {/* Password Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm pr-10"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-semibold text-gray-700 mb-1">
                  Confirm password
                </label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm pr-10"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-400 -mt-3">
              Must include uppercase, lowercase, number, and symbol.
            </p>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-semibold transition shadow-md hover:shadow-lg"
            >
              Create Account
            </button>
          </form>

          <p className="text-center text-gray-600 mt-6 pb-8">
            Already have an account?{' '}
            <Link to="/signin" className="text-blue-600 hover:text-blue-800 font-semibold">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default SignUp;
