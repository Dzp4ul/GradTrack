import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ChevronRight, ChevronLeft, ClipboardList } from 'lucide-react';
import { philippineRegions, philippineProvinces, philippineCities, philippineBarangays } from '../data/philippineAddress';

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
  const [agreed, setAgreed] = useState(false);
  const [agreedCheckbox, setAgreedCheckbox] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeSurvey, setActiveSurvey] = useState<Survey | null>(null);
  const [currentSection, setCurrentSection] = useState(0);
  const [responses, setResponses] = useState<Record<number, any>>({});

  useEffect(() => {
    fetchActiveSurvey();
  }, []);

  const fetchActiveSurvey = async () => {
    try {
      const response = await fetch('/api/surveys/index.php');
      const result = await response.json();
      
      if (result.success && result.data.length > 0) {
        // Find the first active survey
        const active = result.data.find((s: Survey) => s.status === 'active');
        
        if (active) {
          // Fetch full survey details with questions
          const detailResponse = await fetch(`/api/surveys/index.php?id=${active.id}`);
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

  const handleSubmit = async () => {
    if (!activeSurvey) return;

    try {
      const response = await fetch('/api/surveys/responses.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          survey_id: activeSurvey.id,
          graduate_id: null,
          responses: responses,
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert('Survey submitted successfully! Thank you for your participation.');
        setResponses({});
        setCurrentSection(0);
        setAgreed(false);
      } else {
        const errorMsg = result.error || 'Unknown error occurred';
        const hint = result.hint || '';
        alert(`Error: ${errorMsg}\n\n${hint}`);
        console.error('Survey submission error:', result);
      }
    } catch (error) {
      console.error('Error submitting survey:', error);
      alert('Error submitting survey. Please check your internet connection and try again.');
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
          <img src="Gradtrack_Logo2.png" alt="GradTrack Logo" className="h-20 object-contain" />
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
            src="Gradtrack_Logo2.png"
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
  const currentSectionQuestions = sectionQuestions[currentSectionName] || [];

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
            src="Gradtrack_Logo2.png"
            alt="GradTrack Logo"
            className="h-20 object-contain"
          />
        </div>
        <ProgressBar />

        <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
          <h2 className="text-2xl font-bold text-blue-900 mb-4">{activeSurvey.title}</h2>
          {activeSurvey.description && (
            <p className="text-gray-600 mb-6">{activeSurvey.description}</p>
          )}

          <div className="space-y-8">
            {/* Section Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl p-4 mb-4 shadow-md">
              <h3 className="text-xl font-bold text-white uppercase tracking-wide">
                {currentSectionName}
              </h3>
            </div>
            
            {/* Questions in this section */}
            <div className="space-y-6">
              {currentSectionQuestions.map((question) => {
                const globalIdx = activeSurvey.questions.findIndex(q => q.id === question.id);
                return (
                  <div key={question.id} className="bg-blue-50 rounded-xl p-5 border border-blue-100">
                    <label className="block text-base font-semibold text-gray-800 mb-3">
                      {globalIdx + 1}. {question.question_text}
                      {question.is_required === 1 && (
                        <span className="text-red-600 ml-1 font-bold" style={{ fontSize: '1.2em' }}>*</span>
                      )}
                    </label>
                    {renderQuestion(question)}
                  </div>
                );
              })}
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
                onClick={() => setCurrentSection(prev => prev + 1)}
                className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition shadow-md hover:shadow-lg"
              >
                <span>Next</span>
                <ChevronRight className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-semibold transition shadow-md hover:shadow-lg"
              >
                Submit Survey
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Survey;
