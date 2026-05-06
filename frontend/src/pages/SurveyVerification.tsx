import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { API_ROOT } from '../config/api';
import MessageBox from '../components/MessageBox';

interface Program {
  id: number;
  name: string;
  code: string;
}

interface SurveySummary {
  id: number;
  title: string;
  status: string;
}

type VerificationMethod = 'student_number' | 'email';

const SURVEY_ACCESS_KEYS = ['survey_token', 'graduate_id', 'graduate_name', 'graduate_profile'] as const;

const formatStudentNumber = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
};

function SurveyVerification() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const surveyId = searchParams.get('survey_id');

  const [verificationMethod, setVerificationMethod] = useState<VerificationMethod>('student_number');
  const [studentNumber, setStudentNumber] = useState('');
  const [email, setEmail] = useState('');
  const [lastName, setLastName] = useState('');
  const [program, setProgram] = useState('');
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingPrograms, setLoadingPrograms] = useState(true);
  const [activeSurvey, setActiveSurvey] = useState<SurveySummary | null>(null);
  const [msgBox, setMsgBox] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
    title?: string;
  }>({ isOpen: false, type: 'info', message: '' });

  useEffect(() => {
    fetchPrograms();
    fetchActiveSurvey();
  }, []);

  const fetchActiveSurvey = async () => {
    try {
      if (surveyId) {
        const detailResponse = await fetch(`${API_ROOT}/surveys/index.php?id=${surveyId}`);
        const detailResult = await detailResponse.json();

        if (detailResult.success && detailResult.data?.status === 'active') {
          setActiveSurvey(detailResult.data);
        }
        return;
      }

      const response = await fetch(`${API_ROOT}/surveys/index.php`);
      const result = await response.json();
      
      if (result.success && result.data.length > 0) {
        // Find the first active survey
        const active = result.data.find((s: SurveySummary) => s.status === 'active');
        if (active) {
          setActiveSurvey(active);
        }
      }
    } catch (error) {
      console.error('Error fetching survey:', error);
    }
  };

  const fetchPrograms = async () => {
    try {
      const response = await fetch(`${API_ROOT}/surveys/programs.php`);
      const result = await response.json();
      if (result.success) {
        setPrograms(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching programs:', error);
    } finally {
      setLoadingPrograms(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedIdentifier = verificationMethod === 'student_number' ? studentNumber.trim() : email.trim();
    const selectedIdentifierLabel = verificationMethod === 'student_number' ? 'student number' : 'email address';
    
    if (!selectedIdentifier || !lastName.trim() || !program.trim()) {
      setMsgBox({
        isOpen: true,
        type: 'warning',
        message: `Please enter your ${selectedIdentifierLabel}, last name, and program`,
        title: 'Required Fields'
      });
      return;
    }

    if (verificationMethod === 'student_number' && !/^\d{4}-\d{4}$/.test(selectedIdentifier)) {
      setMsgBox({
        isOpen: true,
        type: 'warning',
        message: 'Student No. must follow the format 4digits-4digits (e.g., 2XXX-XXXX).',
        title: 'Invalid Student Number'
      });
      return;
    }

    // Use surveyId from URL or active survey
    const targetSurveyId = surveyId || activeSurvey?.id;
    
    if (!targetSurveyId) {
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: 'No active survey found. Please contact administrator.',
        title: 'Survey Not Found'
      });
      return;
    }

    setLoading(true);

    try {
      console.log('Sending verification request:', {
        verification_method: verificationMethod,
        student_number: verificationMethod === 'student_number' ? selectedIdentifier : '',
        email: verificationMethod === 'email' ? selectedIdentifier : '',
        last_name: lastName,
        program: program,
        survey_id: targetSurveyId
      });

      const response = await fetch(`${API_ROOT}/surveys/verify.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verification_method: verificationMethod,
          student_number: verificationMethod === 'student_number' ? selectedIdentifier : '',
          email: verificationMethod === 'email' ? selectedIdentifier : '',
          last_name: lastName,
          program: program,
          survey_id: targetSurveyId
        })
      });

      const result = await response.json();
      console.log('Verification response:', result);

      if (result.success) {
        // Store survey access outside the browser session so graduates can resume later.
        if (result.data.token) {
          SURVEY_ACCESS_KEYS.forEach((key) => sessionStorage.removeItem(key));
          localStorage.setItem('survey_token', result.data.token);
          localStorage.setItem('graduate_id', result.data.graduate_id);
          localStorage.setItem('graduate_name', result.data.graduate_name);
          if (result.data.profile) {
            localStorage.setItem('graduate_profile', JSON.stringify(result.data.profile));
          } else {
            localStorage.removeItem('graduate_profile');
          }
          
          console.log('Token stored:', result.data.token);
        }

        setMsgBox({
          isOpen: true,
          type: 'success',
          message: `Welcome, ${result.data.graduate_name}! Redirecting to survey...`,
          title: 'Verification Successful'
        });

        // Redirect to survey after 1.5 seconds
        setTimeout(() => {
          console.log('Redirecting to:', `/survey?survey_id=${targetSurveyId}`);
          navigate(`/survey?survey_id=${targetSurveyId}`);
        }, 1500);
      } else {
        const failureMessage = result.message || result.error || 'Verification failed';
        const isAlreadyAnswered = /already completed this survey|already answered|already submitted/i.test(failureMessage);

        setMsgBox({
          isOpen: true,
          type: isAlreadyAnswered ? 'info' : 'error',
          message: isAlreadyAnswered
            ? 'You already answered this survey. Thank you for your response.'
            : failureMessage,
          title: isAlreadyAnswered ? 'Survey Already Answered' : 'Verification Failed'
        });
      }
    } catch (error) {
      console.error('Verification error:', error);
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: 'Network error. Please check your connection and try again.',
        title: 'Connection Error'
      });
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-base';
  const selectClass = 'w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-base bg-white';
  const methodButtonClass = (method: VerificationMethod) =>
    `flex-1 px-4 py-3 rounded-lg border text-sm font-semibold transition ${
      verificationMethod === method
        ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
        : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400 hover:text-blue-700'
    }`;

  return (
    <div
      className="min-h-screen bg-cover bg-center bg-fixed relative flex flex-col items-center justify-center p-4 sm:p-6"
      style={{ backgroundImage: 'url(520382375_1065446909052636_3412465913398569974_n.jpg)' }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/80 via-blue-800/80 to-blue-900/80 pointer-events-none"></div>

      <div className="flex justify-center mb-6 relative z-10">
        <img src="/Gradtrack_Logo2.png" alt="GradTrack Logo" className="h-20 object-contain" />
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-5 border border-blue-100 relative z-10 sm:p-8">
        <div className="flex justify-center mb-6">
          <div className="bg-blue-600 p-4 rounded-full">
            <ShieldCheck className="w-10 h-10 text-white" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-blue-900 text-center mb-2">
          Verify Your Identity
        </h1>
        {activeSurvey && (
          <p className="text-center text-sm text-gray-500 mb-2">
            Survey: <span className="font-semibold text-blue-600">{activeSurvey.title}</span>
          </p>
        )}
        <p className="text-gray-600 text-center mb-6 text-sm">
          Please verify your identity to access the survey
        </p>

        <div className="bg-blue-50 rounded-lg p-4 mb-6 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-gray-700">
            Enter your information exactly as it appears in the registrar records
          </p>
        </div>

        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Verify Using
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                className={methodButtonClass('student_number')}
                onClick={() => setVerificationMethod('student_number')}
                disabled={loading}
              >
                Student Number
              </button>
              <button
                type="button"
                className={methodButtonClass('email')}
                onClick={() => setVerificationMethod('email')}
                disabled={loading}
              >
                Email
              </button>
            </div>
          </div>

          {verificationMethod === 'student_number' ? (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Student Number <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={studentNumber}
                onChange={(e) => setStudentNumber(formatStudentNumber(e.target.value))}
                placeholder="2XXX-XXXX"
                maxLength={9}
                pattern="[0-9]{4}-[0-9]{4}"
                title="Use this format: 2XXX-XXXX"
                className={inputClass}
                required
                disabled={loading}
              />
            </div>
          ) : (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Email Address <span className="text-red-600">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g., juan@email.com"
                className={inputClass}
                required
                disabled={loading}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Last Name <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Enter your last name"
              className={inputClass}
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Program <span className="text-red-600">*</span>
            </label>
            {loadingPrograms ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              </div>
            ) : (
              <select
                value={program}
                onChange={(e) => setProgram(e.target.value)}
                className={selectClass}
                disabled={loading}
                required
              >
                <option value="">Select your program</option>
                {programs.map((prog) => (
                  <option key={prog.id} value={prog.code}>
                    {prog.name} ({prog.code})
                  </option>
                ))}
              </select>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || loadingPrograms}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-semibold transition shadow-md hover:shadow-lg flex items-center justify-center space-x-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Verifying...</span>
              </>
            ) : (
              <span>Verify & Continue</span>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => navigate('/')}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium"
          >
            ← Back to Home
          </button>
        </div>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setMsgBox({
              isOpen: true,
              type: 'info',
              title: 'Forgot Your Student Number?',
              message: 'Please contact the Registrar Office to retrieve your student number. You can also check your old school ID, diploma, or transcript of records.'
            })}
            className="text-sm text-gray-600 hover:text-blue-600 underline"
          >
            Forgot your student number?
          </button>
        </div>
      </div>

      <MessageBox
        isOpen={msgBox.isOpen}
        onClose={() => setMsgBox({ ...msgBox, isOpen: false })}
        type={msgBox.type}
        message={msgBox.message}
        title={msgBox.title}
      />
    </div>
  );
}

export default SurveyVerification;
