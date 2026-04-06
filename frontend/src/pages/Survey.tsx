import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ShieldCheck, ChevronRight, ChevronLeft, ClipboardList, Save } from 'lucide-react';
import { philippineRegions, philippineProvinces, philippineCities, philippineBarangays } from '../data/philippineAddress';
import MessageBox from '../components/MessageBox';
import { API_ROOT } from '../config/api';

interface Question {
  id?: number;
  question_text: string;
  question_type: string;
  options: string[] | null;
  is_required: number;
  sort_order: number;
  section?: string;
}

interface Survey {
  id: number;
  title: string;
  description: string;
  status: string;
  questions: Question[];
}

function Survey() {
  const [searchParams] = useSearchParams();
  const surveyIdFromUrl = searchParams.get('survey_id');
  
  const [agreed, setAgreed] = useState(false);
  const [agreedCheckbox, setAgreedCheckbox] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeSurvey, setActiveSurvey] = useState<Survey | null>(null);
  const [currentSection, setCurrentSection] = useState(0);
  const [responses, setResponses] = useState<Record<number, any>>({});
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [msgBox, setMsgBox] = useState<{ isOpen: boolean; type: 'success' | 'error' | 'warning' | 'info'; message: string; title?: string }>({ isOpen: false, type: 'info', message: '' });
  const [token, setToken] = useState<string | null>(null);
  const [graduateId, setGraduateId] = useState<number | null>(null);
  const [graduateName, setGraduateName] = useState<string>('');
  const [tokenValidated, setTokenValidated] = useState(false);

  useEffect(() => {
    validateTokenAndFetchSurvey();
  }, []);

  const validateTokenAndFetchSurvey = async () => {
    // Get token from sessionStorage
    const storedToken = sessionStorage.getItem('survey_token');
    const storedGraduateId = sessionStorage.getItem('graduate_id');
    const storedGraduateName = sessionStorage.getItem('graduate_name');

    console.log('Checking token:', storedToken);
    console.log('Survey ID from URL:', surveyIdFromUrl);

    if (!storedToken) {
      // No token, redirect to verification with survey_id
      console.log('No token found, redirecting to verification');
      const redirectUrl = surveyIdFromUrl 
        ? `/survey-verify?survey_id=${surveyIdFromUrl}`
        : '/survey-verify';
      
      setMsgBox({
        isOpen: true,
        type: 'warning',
        message: 'Please verify your identity first',
        title: 'Verification Required'
      });
      setTimeout(() => {
        window.location.href = redirectUrl;
      }, 2000);
      return;
    }

    try {
      console.log('Validating token with backend...');
      // Validate token with backend
      const tokenResponse = await fetch(`${API_ROOT}/surveys/validate-token.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: storedToken })
      });

      const tokenResult = await tokenResponse.json();
      console.log('Token validation result:', tokenResult);

      if (!tokenResult.success) {
        console.log('Token validation failed');
        setMsgBox({
          isOpen: true,
          type: 'error',
          message: tokenResult.message || 'Invalid or expired token',
          title: 'Access Denied'
        });
        sessionStorage.removeItem('survey_token');
        sessionStorage.removeItem('graduate_id');
        sessionStorage.removeItem('graduate_name');
        
        const redirectUrl = surveyIdFromUrl 
          ? `/survey-verify?survey_id=${surveyIdFromUrl}`
          : '/survey-verify';
        
        setTimeout(() => {
          window.location.href = redirectUrl;
        }, 2000);
        return;
      }

      // Token is valid
      console.log('Token is valid!');
      setToken(storedToken);
      setGraduateId(parseInt(storedGraduateId || '0'));
      setGraduateName(storedGraduateName || '');
      setTokenValidated(true);

      // Fetch survey
      await fetchActiveSurvey();
    } catch (error) {
      console.error('Token validation error:', error);
      setMsgBox({
        isOpen: true,
        type: 'error',
        message: 'Error validating access. Please try again.',
        title: 'Validation Error'
      });
      setLoading(false);
    }
  };

  // Load draft from localStorage
  useEffect(() => {
    if (activeSurvey) {
      const draftKey = `survey_draft_${activeSurvey.id}`;
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const draft = JSON.parse(saved);
        setResponses(draft.responses || {});
        setCurrentSection(draft.section || 0);
        setLastSaved(new Date(draft.timestamp));
      }
    }
  }, [activeSurvey]);

  // Auto-save draft
  useEffect(() => {
    if (activeSurvey && Object.keys(responses).length > 0) {
      const draftKey = `survey_draft_${activeSurvey.id}`;
      const draft = { responses, section: currentSection, timestamp: new Date().toISOString() };
      localStorage.setItem(draftKey, JSON.stringify(draft));
      setLastSaved(new Date());
    }
  }, [responses, currentSection, activeSurvey]);

  const fetchActiveSurvey = async () => {
    try {
      const response = await fetch(`${API_ROOT}/surveys/index.php`);
      const result = await response.json();
      
      if (result.success && result.data.length > 0) {
        // Find the first active survey
        const active = result.data.find((s: Survey) => s.status === 'active');
        
        if (active) {
          // Fetch full survey details with questions
          const detailResponse = await fetch(`${API_ROOT}/surveys/index.php?id=${active.id}`);
          const detailResult = await detailResponse.json();
          
          if (detailResult.success) {
            const survey = detailResult.data;
            survey.questions = (survey.questions || []).map((q: Question) => ({
              ...q,
              options: typeof q.options === 'string' ? JSON.parse(q.options) : q.options,
            }));
            setActiveSurvey(survey);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching survey:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResponseChange = (questionId: number, value: any) => {
    setResponses(prev => ({ ...prev, [questionId]: value }));
  };

  const handleCheckboxChange = (questionId: number, option: string) => {
    setResponses(prev => {
      const current = prev[questionId] || [];
      const updated = current.includes(option)
        ? current.filter((v: string) => v !== option)
        : [...current, option];
      return { ...prev, [questionId]: updated };
    });
  };

  // Validate current section before moving to next
  const validateCurrentSection = () => {
    const requiredQuestions = currentSectionQuestions.filter(
      q => q.is_required === 1 || q.is_required === '1'
    );
    
    for (const question of requiredQuestions) {
      const answer = responses[question.id!];
      
      // Check if answer is empty, null, undefined, or empty array
      if (!answer || 
          (Array.isArray(answer) && answer.length === 0) || 
          (typeof answer === 'string' && answer.trim() === '')) {
        setMsgBox({ isOpen: true, type: 'warning', message: `Please answer the required question: "${question.question_text}"`, title: 'Required Field' });
        return false;
      }
    }
    
    return true;
  };

  const handleSubmit = async () => {
    if (!activeSurvey || !token || !graduateId) return;

    try {
      const response = await fetch(`${API_ROOT}/surveys/responses.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          survey_id: activeSurvey.id,
          graduate_id: graduateId,
          token: token,
          responses: responses,
        }),
      });

      const result = await response.json();

      if (result.success) {
        localStorage.removeItem(`survey_draft_${activeSurvey.id}`);
        sessionStorage.removeItem('survey_token');
        sessionStorage.removeItem('graduate_id');
        sessionStorage.removeItem('graduate_name');
        setMsgBox({ isOpen: true, type: 'success', message: 'Survey submitted successfully! Thank you for your participation.', title: 'Success' });
        setResponses({});
        setCurrentSection(0);
        setAgreed(false);
        setLastSaved(null);
        
        // Redirect to home after 3 seconds
        setTimeout(() => {
          window.location.href = '/';
        }, 3000);
      } else {
        const errorMsg = result.error || 'Unknown error occurred';
        const hint = result.hint || '';
        setMsgBox({ isOpen: true, type: 'error', message: `Error: ${errorMsg}\n\n${hint}`, title: 'Submission Error' });
        console.error('Survey submission error:', result);
      }
    } catch (error) {
      console.error('Error submitting survey:', error);
      setMsgBox({ isOpen: true, type: 'error', message: 'Error submitting survey. Please check your internet connection and try again.', title: 'Network Error' });
    }
  };

  const inputClass = 'w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm';
  const selectClass = 'w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm bg-white';
  const labelClass = 'block text-sm font-semibold text-gray-700 mb-1';

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-cover bg-center bg-fixed relative flex items-center justify-center" style={{ backgroundImage: 'url(520382375_1065446909052636_3412465913398569974_n.jpg)' }}>
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/80 via-blue-800/80 to-blue-900/80 pointer-events-none"></div>
        <div className="relative z-10">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-white"></div>
        </div>
      </div>
    );
  }

  // No active survey
  if (!activeSurvey) {
    return (
      <div className="min-h-screen bg-cover bg-center bg-fixed relative flex flex-col items-center justify-center p-6" style={{ backgroundImage: 'url(520382375_1065446909052636_3412465913398569974_n.jpg)' }}>
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/80 via-blue-800/80 to-blue-900/80 pointer-events-none"></div>
        <div className="flex justify-center mb-6 relative z-10">
          <img src="/Gradtrack_Logo2.png" alt="GradTrack Logo" className="h-20 object-contain" />
        </div>
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-10 border border-blue-100 relative z-10 text-center">
          <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-blue-900 mb-4">No Active Survey</h1>
          <p className="text-gray-600 mb-6">There are currently no active surveys available. Please check back later.</p>
          <Link to="/" className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold transition">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  // ─── DATA PRIVACY CONSENT ───
  if (!agreed) {
    return (
      <div className="min-h-screen bg-cover bg-center bg-fixed relative flex flex-col items-center justify-center p-6" style={{ backgroundImage: 'url(520382375_1065446909052636_3412465913398569974_n.jpg)' }}>
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/80 via-blue-800/80 to-blue-900/80 pointer-events-none"></div>
        <div className="flex justify-center mb-6 relative z-10">
          <img
            src="/Gradtrack_Logo2.png"
            alt="GradTrack Logo"
            className="h-20 object-contain"
          />
        </div>
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-10 border border-blue-100 relative z-10">
          <div className="flex justify-center mb-6">
            <div className="bg-blue-600 p-4 rounded-full">
              <ShieldCheck className="w-10 h-10 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-blue-900 text-center mb-2">
            Data Privacy Notice & Informed Consent
          </h1>
          <div className="mt-6 bg-blue-50 rounded-xl p-6 border border-blue-100">
            <p className="text-gray-700 leading-relaxed text-sm">
              By proceeding with this form, you voluntarily consent to participate in this research. The information you provide will be collected and processed in accordance with the <strong>Data Privacy Act of 2012 (RA 10173)</strong> and will be used for academic research purposes only. Your responses will be kept confidential, reported in aggregated form, and accessed only by the researcher. Participation is voluntary.
            </p>
          </div>
          <div className="mt-6 flex items-start space-x-3">
            <input
              type="checkbox"
              id="agreeCheckbox"
              checked={agreedCheckbox}
              onChange={(e) => setAgreedCheckbox(e.target.checked)}
              className="mt-1 w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <label htmlFor="agreeCheckbox" className="text-gray-700 text-sm cursor-pointer">
              I have read and understood the Data Privacy Notice and I voluntarily consent to participate in this survey.
            </label>
          </div>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => setAgreed(true)}
              disabled={!agreedCheckbox}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-8 py-3 rounded-lg font-semibold transition shadow-md hover:shadow-lg disabled:shadow-none"
            >
              I Agree & Proceed
            </button>
            <Link
              to="/"
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-8 py-3 rounded-lg font-semibold transition text-center"
            >
              Decline & Go Back
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Progress Bar
  const ProgressBar = () => (
    <div className="w-full max-w-5xl mx-auto mb-10">
      <div className="flex items-center justify-between">
        {allSections.map((section, i) => (
          <div key={i} className="flex-1 flex flex-col items-center relative">
            <button
              onClick={() => setCurrentSection(i)}
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition z-10 ${
                i < currentSection
                  ? 'bg-green-500 text-white'
                  : i === currentSection
                  ? 'bg-blue-600 text-white ring-4 ring-blue-200'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {i < currentSection ? '✓' : i + 1}
            </button>
            <span className={`text-xs mt-2 font-medium text-center max-w-[100px] truncate ${i === currentSection ? 'text-yellow-400' : 'text-blue-200'}`} title={section}>
              {section}
            </span>
            {i < allSections.length - 1 && (
              <div className={`absolute top-5 left-[55%] w-full h-0.5 ${i < currentSection ? 'bg-green-500' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );

  // Render question based on type
  const renderQuestion = (question: Question) => {
    const value = responses[question.id!] || '';

    switch (question.question_type) {
      case 'text':
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleResponseChange(question.id!, e.target.value)}
            className={inputClass}
            required={question.is_required === 1}
          />
        );

      case 'date':
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => handleResponseChange(question.id!, e.target.value)}
            className={inputClass}
            required={question.is_required === 1}
          />
        );

      case 'multiple_choice':
        return (
          <select
            value={value}
            onChange={(e) => handleResponseChange(question.id!, e.target.value)}
            className={selectClass}
            required={question.is_required === 1}
          >
            <option value="">Select an option</option>
            {question.options?.map((option, idx) => (
              <option key={idx} value={option}>{option}</option>
            ))}
          </select>
        );

      case 'radio':
        return (
          <div className="space-y-2">
            {question.options?.map((option, idx) => (
              <label key={idx} className="flex items-center space-x-3 text-sm text-gray-700 cursor-pointer hover:bg-blue-100 p-2 rounded-lg transition">
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  value={option}
                  checked={value === option}
                  onChange={(e) => handleResponseChange(question.id!, e.target.value)}
                  className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  required={question.is_required === 1}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        );

      case 'checkbox':
        return (
          <div className="space-y-2">
            {question.options?.map((option, idx) => (
              <label key={idx} className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={(value || []).includes(option)}
                  onChange={() => handleCheckboxChange(question.id!, option)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        );

      case 'rating':
        return (
          <div className="flex space-x-2">
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                type="button"
                onClick={() => handleResponseChange(question.id!, rating)}
                className={`px-4 py-2 rounded-lg border-2 transition ${
                  value === rating
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                }`}
              >
                {rating}
              </button>
            ))}
          </div>
        );

      default:
        return (
          <textarea
            value={value}
            onChange={(e) => handleResponseChange(question.id!, e.target.value)}
            rows={4}
            className={inputClass}
            required={question.is_required === 1}
          />
        );
    }
  };

  // Get unique sections from all questions
  const allSections: string[] = [];
  const sectionQuestions: Record<string, Question[]> = {};
  
  activeSurvey?.questions.forEach(q => {
    const section = q.section || 'General';
    if (!allSections.includes(section)) {
      allSections.push(section);
    }
    if (!sectionQuestions[section]) {
      sectionQuestions[section] = [];
    }
    sectionQuestions[section].push(q);
  });

  const totalPages = allSections.length;
  const currentSectionName = allSections[currentSection] || 'General';
  
  // Filter questions based on conditional logic
  const getFilteredQuestions = () => {
    const questions = sectionQuestions[currentSectionName] || [];
    const filtered: Question[] = [];
    
    // Find question 28 (index 27 in 0-based array)
    const question28 = activeSurvey?.questions[27];
    const answer28 = question28?.id ? responses[question28.id] : null;
    
    questions.forEach((q) => {
      const globalIdx = activeSurvey?.questions.findIndex(quest => quest.id === q.id) ?? -1;
      const questionNumber = globalIdx + 1;
      
      // If question is between 29-44
      if (questionNumber >= 29 && questionNumber <= 44) {
        // Only show if answer to question 28 is "Yes"
        if (answer28?.toLowerCase() === 'yes') {
          filtered.push(q);
        }
      }
      // If question is 45
      else if (questionNumber === 45) {
        // Only show if answer to question 28 is "No"
        if (answer28?.toLowerCase() === 'no') {
          filtered.push(q);
        }
      }
      // All other questions show normally
      else {
        filtered.push(q);
      }
    });
    
    return filtered;
  };
  
  const currentSectionQuestions = getFilteredQuestions();

  return (
    <div className="min-h-screen bg-cover bg-center bg-fixed relative" style={{ backgroundImage: 'url(520382375_1065446909052636_3412465913398569974_n.jpg)' }}>
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/80 via-blue-800/80 to-blue-900/80 pointer-events-none"></div>
      {/* Header */}
      <nav className="bg-blue-900/95 backdrop-blur-sm shadow-lg sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <img src="/logo.png" alt="Norzagaray College" className="h-10 w-10 object-contain" />
              <h1 className="text-lg font-bold text-white">GradTrack Survey</h1>
            </div>
            <Link to="/" className="text-white hover:text-yellow-400 font-medium transition text-sm">
              ← Back to Home
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 relative">
        <div className="flex justify-center mb-6">
          <img
            src="/Gradtrack_Logo2.png"
            alt="GradTrack Logo"
            className="h-20 object-contain"
          />
        </div>
        <ProgressBar />

        <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-2xl font-bold text-blue-900">{activeSurvey.title}</h2>
              {graduateName && (
                <p className="text-green-600 font-medium mt-1">Welcome, {graduateName}!</p>
              )}
              {activeSurvey.description && (
                <p className="text-gray-600 mt-2">{activeSurvey.description}</p>
              )}
            </div>
            {lastSaved && (
              <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-1.5 rounded-lg">
                <Save className="w-4 h-4" />
                <span>Draft saved</span>
              </div>
            )}
          </div>

          <div className="space-y-8">
            {/* Section Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-4 mb-4 shadow-md">
              <h3 className="text-xl font-bold text-white uppercase tracking-wide">
                {currentSectionName}
              </h3>
            </div>
            
            {/* Questions in this section */}
            <div className="space-y-6">
              {(() => {
                const renderedQuestions: JSX.Element[] = [];
                let i = 0;
                
                while (i < currentSectionQuestions.length) {
                  const question = currentSectionQuestions[i];
                  const globalIdx = activeSurvey.questions.findIndex(q => q.id === question.id);
                  const questionText = question.question_text.toLowerCase();
                  
                  // Check if this is Last Name and next two are First Name and Middle Name
                  if (questionText.includes('last name') &&
                      i + 2 < currentSectionQuestions.length &&
                      currentSectionQuestions[i + 1].question_text.toLowerCase().includes('first name') &&
                      currentSectionQuestions[i + 2].question_text.toLowerCase().includes('middle name')) {
                    
                    const firstNameQ = currentSectionQuestions[i + 1];
                    const middleNameQ = currentSectionQuestions[i + 2];
                    const firstNameIdx = activeSurvey.questions.findIndex(q => q.id === firstNameQ.id);
                    const middleNameIdx = activeSurvey.questions.findIndex(q => q.id === middleNameQ.id);
                    
                    renderedQuestions.push(
                      <div key={`name-group-${question.id}`} className="bg-blue-50 rounded-xl p-5 border border-blue-100">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {globalIdx + 1}. {question.question_text}
                              {(question.is_required === 1 || question.is_required === '1') && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(question)}
                          </div>
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {firstNameIdx + 1}. {firstNameQ.question_text}
                              {(firstNameQ.is_required === 1 || firstNameQ.is_required === '1') && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(firstNameQ)}
                          </div>
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {middleNameIdx + 1}. {middleNameQ.question_text}
                              {(middleNameQ.is_required === 1 || middleNameQ.is_required === '1') && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(middleNameQ)}
                          </div>
                        </div>
                      </div>
                    );
                    i += 3;
                  }
                  // Check if this is Email and next two are Mobile Number and Telephone/Contact Number
                  else if (questionText.includes('email') &&
                      i + 2 < currentSectionQuestions.length &&
                      currentSectionQuestions[i + 1].question_text.toLowerCase().includes('mobile') &&
                      (currentSectionQuestions[i + 2].question_text.toLowerCase().includes('telephone') ||
                       currentSectionQuestions[i + 2].question_text.toLowerCase().includes('contact number'))) {
                    
                    const mobileQ = currentSectionQuestions[i + 1];
                    const telephoneQ = currentSectionQuestions[i + 2];
                    const mobileIdx = activeSurvey.questions.findIndex(q => q.id === mobileQ.id);
                    const telephoneIdx = activeSurvey.questions.findIndex(q => q.id === telephoneQ.id);
                    
                    renderedQuestions.push(
                      <div key={`contact-group-${question.id}`} className="bg-blue-50 rounded-xl p-5 border border-blue-100">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {globalIdx + 1}. {question.question_text}
                              {(question.is_required === 1 || question.is_required === '1') && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(question)}
                          </div>
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {mobileIdx + 1}. {mobileQ.question_text}
                              {(mobileQ.is_required === 1 || mobileQ.is_required === '1') && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(mobileQ)}
                          </div>
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {telephoneIdx + 1}. {telephoneQ.question_text}
                              {(telephoneQ.is_required === 1 || telephoneQ.is_required === '1') && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(telephoneQ)}
                          </div>
                        </div>
                      </div>
                    );
                    i += 3;
                  }
                  // Check if this is Civil Status and next two are Sex and Birthday
                  else if (questionText.includes('civil status') &&
                      i + 2 < currentSectionQuestions.length &&
                      currentSectionQuestions[i + 1].question_text.toLowerCase().includes('sex') &&
                      (currentSectionQuestions[i + 2].question_text.toLowerCase().includes('birthday') ||
                       currentSectionQuestions[i + 2].question_text.toLowerCase().includes('birth date') ||
                       currentSectionQuestions[i + 2].question_text.toLowerCase().includes('date of birth'))) {
                    
                    const sexQ = currentSectionQuestions[i + 1];
                    const birthdayQ = currentSectionQuestions[i + 2];
                    const sexIdx = activeSurvey.questions.findIndex(q => q.id === sexQ.id);
                    const birthdayIdx = activeSurvey.questions.findIndex(q => q.id === birthdayQ.id);
                    
                    renderedQuestions.push(
                      <div key={`personal-group-${question.id}`} className="bg-blue-50 rounded-xl p-5 border border-blue-100">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {globalIdx + 1}. {question.question_text}
                              {(question.is_required === 1 || question.is_required === '1') && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(question)}
                          </div>
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {sexIdx + 1}. {sexQ.question_text}
                              {(sexQ.is_required === 1 || sexQ.is_required === '1') && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(sexQ)}
                          </div>
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {birthdayIdx + 1}. {birthdayQ.question_text}
                              {(birthdayQ.is_required === 1 || birthdayQ.is_required === '1') && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(birthdayQ)}
                          </div>
                        </div>
                      </div>
                    );
                    i += 3;
                  }
                  // Check if this is Region and next two are Province and City/Municipality
                  else if (questionText.includes('region') &&
                      i + 2 < currentSectionQuestions.length &&
                      currentSectionQuestions[i + 1].question_text.toLowerCase().includes('province') &&
                      (currentSectionQuestions[i + 2].question_text.toLowerCase().includes('city') ||
                       currentSectionQuestions[i + 2].question_text.toLowerCase().includes('municipality'))) {
                    
                    const provinceQ = currentSectionQuestions[i + 1];
                    const cityQ = currentSectionQuestions[i + 2];
                    const provinceIdx = activeSurvey.questions.findIndex(q => q.id === provinceQ.id);
                    const cityIdx = activeSurvey.questions.findIndex(q => q.id === cityQ.id);
                    
                    renderedQuestions.push(
                      <div key={`address-group-${question.id}`} className="bg-blue-50 rounded-xl p-5 border border-blue-100">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {globalIdx + 1}. {question.question_text}
                              {(question.is_required === 1 || question.is_required === '1') && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(question)}
                          </div>
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {provinceIdx + 1}. {provinceQ.question_text}
                              {(provinceQ.is_required === 1 || provinceQ.is_required === '1') && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(provinceQ)}
                          </div>
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {cityIdx + 1}. {cityQ.question_text}
                              {(cityQ.is_required === 1 || cityQ.is_required === '1') && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(cityQ)}
                          </div>
                        </div>
                      </div>
                    );
                    i += 3;
                  }
                  // Check if this is Degree Program and next is Year Graduated
                  else if ((questionText.includes('degree program') || questionText.includes('degree/program')) &&
                      i + 1 < currentSectionQuestions.length &&
                      currentSectionQuestions[i + 1].question_text.toLowerCase().includes('year graduated')) {
                    
                    const yearGradQ = currentSectionQuestions[i + 1];
                    const yearGradIdx = activeSurvey.questions.findIndex(q => q.id === yearGradQ.id);
                    
                    renderedQuestions.push(
                      <div key={`degree-group-${question.id}`} className="bg-blue-50 rounded-xl p-5 border border-blue-100">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {globalIdx + 1}. {question.question_text}
                              {(question.is_required === 1 || question.is_required === '1') && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(question)}
                          </div>
                          <div>
                            <label className="block text-base font-semibold text-gray-800 mb-3">
                              {yearGradIdx + 1}. {yearGradQ.question_text}
                              {(yearGradQ.is_required === 1 || yearGradQ.is_required === '1') && (
                                <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                              )}
                            </label>
                            {renderQuestion(yearGradQ)}
                          </div>
                        </div>
                      </div>
                    );
                    i += 2;
                  }
                  else {
                    // Render normal question
                    renderedQuestions.push(
                      <div key={question.id} className="bg-blue-50 rounded-xl p-5 border border-blue-100">
                        <label className="block text-base font-semibold text-gray-800 mb-3">
                          {globalIdx + 1}. {question.question_text}
                          {(question.is_required === 1 || question.is_required === '1') && (
                            <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                          )}
                        </label>
                        {renderQuestion(question)}
                      </div>
                    );
                    i++;
                  }
                }
                
                return renderedQuestions;
              })()}
            </div>
          </div>

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-10 pt-6 border-t border-gray-100">
            <button
              onClick={() => setCurrentSection(prev => prev - 1)}
              disabled={currentSection === 0}
              className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-semibold transition ${
                currentSection === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              <ChevronLeft className="w-5 h-5" />
              <span>Previous</span>
            </button>

            {currentSection < totalPages - 1 ? (
              <button
                onClick={() => {
                  if (validateCurrentSection()) {
                    setCurrentSection(prev => prev + 1);
                  }
                }}
                className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition shadow-md hover:shadow-lg"
              >
                <span>Next</span>
                <ChevronRight className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={() => {
                  if (validateCurrentSection()) {
                    handleSubmit();
                  }
                }}
                className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-semibold transition shadow-md hover:shadow-lg"
              >
                Submit Survey
              </button>
            )}
          </div>
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

export default Survey;
