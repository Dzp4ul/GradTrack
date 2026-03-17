import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, ChevronRight, ChevronLeft } from 'lucide-react';

const sections = [
  { key: 'A', label: 'General Information' },
  { key: 'B', label: 'Educational Background' },
  { key: 'C', label: 'Training / Advance Studies' },
  { key: 'D', label: 'Employment Data' },
];

function Survey() {
  const [agreed, setAgreed] = useState(false);
  const [currentSection, setCurrentSection] = useState(0);

  // Section A
  const [sectionA, setSectionA] = useState({
    name: '',
    permanentAddress: '',
    email: '',
    telephone: '',
    mobile: '',
    civilStatus: '',
    sex: '',
    birthday: '',
    regionOfOrigin: '',
    province: '',
    locationOfResidence: '',
  });

  // Section B
  const [sectionB, setSectionB] = useState({
    degreeProgram: '',
    college: '',
    yearGraduated: '',
    honors: [] as string[],
    honorsOther: '',
    examName: '',
    examDate: '',
    examRating: '',
    reasons: [] as string[],
    reasonsOther: '',
  });

  // Section C
  const [sectionC, setSectionC] = useState({
    trainingTitle: '',
    trainingDuration: '',
    trainingInstitution: '',
    graduateProgram: '',
    graduateProgramOther: '',
    earnedUnits: '',
    graduateCollege: '',
    advanceStudyReason: [] as string[],
    advanceStudyReasonOther: '',
  });

  // Section D
  const [sectionD, setSectionD] = useState({
    presentlyEmployed: '',
    notEmployedReasons: [] as string[],
    notEmployedOther: '',
    suggestions: '',
  });

  const handleChangeA = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setSectionA({ ...sectionA, [e.target.name]: e.target.value });
  };

  const handleChangeB = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setSectionB({ ...sectionB, [e.target.name]: e.target.value });
  };

  const handleCheckB = (field: 'honors' | 'reasons', value: string) => {
    setSectionB(prev => {
      const arr = prev[field];
      return { ...prev, [field]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
    });
  };

  const handleChangeC = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setSectionC({ ...sectionC, [e.target.name]: e.target.value });
  };

  const handleCheckC = (field: 'advanceStudyReason', value: string) => {
    setSectionC(prev => {
      const arr = prev[field];
      return { ...prev, [field]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
    });
  };

  const handleChangeD = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setSectionD({ ...sectionD, [e.target.name]: e.target.value });
  };

  const handleCheckD = (field: 'notEmployedReasons', value: string) => {
    setSectionD(prev => {
      const arr = prev[field];
      return { ...prev, [field]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
    });
  };

  const handleSubmit = () => {
    console.log('Survey submitted:', { sectionA, sectionB, sectionC, sectionD });
    alert('Survey submitted successfully! Thank you for your participation.');
  };

  const inputClass = 'w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm';
  const selectClass = 'w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm bg-white';
  const labelClass = 'block text-sm font-semibold text-gray-700 mb-1';

  // ─── DATA PRIVACY CONSENT ───
  if (!agreed) {
    return (
      <div className="min-h-screen bg-cover bg-center bg-fixed relative flex flex-col items-center justify-center p-6" style={{ backgroundImage: 'url(/public/520382375_1065446909052636_3412465913398569974_n.jpg)' }}>
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/80 via-blue-800/80 to-blue-900/80 pointer-events-none"></div>
        <div className="flex justify-center mb-6 relative z-10">
          <img
            src="Gemini_Generated_Image_d1z1yd1z1yd1z1yd (2) (1).png"
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
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => setAgreed(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold transition shadow-md hover:shadow-lg"
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

  // ─── PROGRESS BAR ───
  const ProgressBar = () => (
    <div className="w-full max-w-3xl mx-auto mb-10">
      <div className="flex items-center justify-between">
        {sections.map((s, i) => (
          <div key={s.key} className="flex-1 flex flex-col items-center relative">
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
              {i < currentSection ? '✓' : s.key}
            </button>
            <span className={`text-xs mt-2 font-medium text-center ${i === currentSection ? 'text-yellow-400' : 'text-blue-200'}`}>
              {s.label}
            </span>
            {i < sections.length - 1 && (
              <div className={`absolute top-5 left-[55%] w-full h-0.5 ${i < currentSection ? 'bg-green-500' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );

  // ─── SECTION A ───
  const renderSectionA = () => (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold text-blue-900 mb-1">A. General Information</h2>
      <p className="text-gray-500 text-sm mb-4">Please provide your personal details.</p>

      <div>
        <label className={labelClass}>1. Name (Last Name, First Name M.I.)</label>
        <input name="name" value={sectionA.name} onChange={handleChangeA} placeholder="Dela Cruz, Juan S." className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>2. Permanent Address</label>
        <input name="permanentAddress" value={sectionA.permanentAddress} onChange={handleChangeA} placeholder="Enter your permanent address" className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>3. E-mail Address</label>
        <input name="email" type="email" value={sectionA.email} onChange={handleChangeA} placeholder="you@example.com" className={inputClass} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>4. Telephone / Contact Number(s)</label>
          <input name="telephone" value={sectionA.telephone} onChange={handleChangeA} placeholder="(044) 123-4567" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>5. Mobile Number</label>
          <input name="mobile" value={sectionA.mobile} onChange={handleChangeA} placeholder="09XXXXXXXXX" className={inputClass} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>6. Civil Status</label>
          <select name="civilStatus" value={sectionA.civilStatus} onChange={handleChangeA} className={selectClass}>
            <option value="" disabled>Select</option>
            <option value="single">Single</option>
            <option value="married">Married</option>
            <option value="widowed">Widowed</option>
            <option value="separated">Separated</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>7. Sex</label>
          <select name="sex" value={sectionA.sex} onChange={handleChangeA} className={selectClass}>
            <option value="" disabled>Select</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>8. Birthday</label>
          <input name="birthday" type="date" value={sectionA.birthday} onChange={handleChangeA} className={inputClass} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelClass}>9. Region of Origin</label>
          <input name="regionOfOrigin" value={sectionA.regionOfOrigin} onChange={handleChangeA} placeholder="e.g. Region III" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>10. Province</label>
          <input name="province" value={sectionA.province} onChange={handleChangeA} placeholder="e.g. Bulacan" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>11. Location of Residence</label>
          <input name="locationOfResidence" value={sectionA.locationOfResidence} onChange={handleChangeA} placeholder="City / Municipality" className={inputClass} />
        </div>
      </div>
    </div>
  );

  // ─── SECTION B ───
  const honorsOptions = ['Cum Laude', 'Magna Cum Laude', 'Leadership Award', 'Best in Thesis', "Dean's Lister", 'Academic Excellence'];
  const reasonOptions = [
    'High grades in the course/subject area(s) related to the course',
    'Good grades in high school',
    'Influence of parents or relatives',
    'Peer influence',
    'Inspired by a role model',
    'Strong passion for the profession',
    'Prospect for immediate employment',
    'Status or prestige of the profession',
    'Availability of the course in chosen institution',
    'Prospect for career advancement',
    'Affordable for the family',
    'Prospect of attractive compensation',
    'Opportunity for employment abroad',
    'No particular choice / no better idea',
  ];

  const renderSectionB = () => (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold text-blue-900 mb-1">B. Educational Background</h2>
      <p className="text-gray-500 text-sm mb-4">Baccalaureate Degree information only.</p>

      <div className="bg-blue-50 rounded-xl p-5 border border-blue-100 space-y-4">
        <p className="font-semibold text-blue-900 text-sm">12. Educational Attainment</p>
        <div>
          <label className={labelClass}>12a. Degree Program & Specialization</label>
          <input name="degreeProgram" value={sectionB.degreeProgram} onChange={handleChangeB} placeholder="e.g. BS Information Technology" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>12b. College / University</label>
          <input name="college" value={sectionB.college} onChange={handleChangeB} placeholder="e.g. Norzagaray College" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>12c. Year Graduated</label>
          <input name="yearGraduated" value={sectionB.yearGraduated} onChange={handleChangeB} placeholder="e.g. 2024" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>12d. Honors / Awards Received (if any)</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {honorsOptions.map(h => (
              <label key={h} className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={sectionB.honors.includes(h)} onChange={() => handleCheckB('honors', h)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span>{h}</span>
              </label>
            ))}
          </div>
          <input name="honorsOther" value={sectionB.honorsOther} onChange={handleChangeB} placeholder="Other (please specify)" className={`${inputClass} mt-2`} />
        </div>
      </div>

      <div className="bg-blue-50 rounded-xl p-5 border border-blue-100 space-y-4">
        <p className="font-semibold text-blue-900 text-sm">13. Professional Examination(s) Passed (if applicable)</p>
        <div>
          <label className={labelClass}>13a. Name of Examination</label>
          <select name="examName" value={sectionB.examName} onChange={handleChangeB} className={selectClass}>
            <option value="" disabled>Select examination</option>
            <option value="let">Licensure Examination for Teachers</option>
            <option value="cse">Civil Service Examination</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>13b. Date Taken</label>
            <input name="examDate" type="date" value={sectionB.examDate} onChange={handleChangeB} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>13c. Rating</label>
            <input name="examRating" value={sectionB.examRating} onChange={handleChangeB} placeholder="e.g. 85.50" className={inputClass} />
          </div>
        </div>
      </div>

      <div>
        <label className={labelClass}>14. Reason(s) for taking the course / pursuing the degree</label>
        <p className="text-xs text-gray-400 mb-2">You may check more than one answer.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {reasonOptions.map(r => (
            <label key={r} className="flex items-start space-x-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={sectionB.reasons.includes(r)} onChange={() => handleCheckB('reasons', r)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-0.5" />
              <span>{r}</span>
            </label>
          ))}
        </div>
        <input name="reasonsOther" value={sectionB.reasonsOther} onChange={handleChangeB} placeholder="Other (please specify)" className={`${inputClass} mt-2`} />
      </div>
    </div>
  );

  // ─── SECTION C ───
  const renderSectionC = () => (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold text-blue-900 mb-1">C. Training(s) / Advance Studies Attended After College</h2>
      <p className="text-gray-500 text-sm mb-4">Professional training and graduate programs after college.</p>

      <div className="bg-blue-50 rounded-xl p-5 border border-blue-100 space-y-4">
        <p className="font-semibold text-blue-900 text-sm">15. Professional / Work-Related Training(s) After College</p>
        <div>
          <label className={labelClass}>15a. Title of Training</label>
          <input name="trainingTitle" value={sectionC.trainingTitle} onChange={handleChangeC} placeholder="e.g. Web Development Bootcamp" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>15b. Duration</label>
          <input name="trainingDuration" value={sectionC.trainingDuration} onChange={handleChangeC} placeholder="e.g. 3 months" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>15c. Name of Training Institution</label>
          <input name="trainingInstitution" value={sectionC.trainingInstitution} onChange={handleChangeC} placeholder="e.g. TESDA" className={inputClass} />
        </div>
      </div>

      <div className="bg-blue-50 rounded-xl p-5 border border-blue-100 space-y-4">
        <p className="font-semibold text-blue-900 text-sm">16. Graduate Program(s) Attended After College</p>
        <div>
          <label className={labelClass}>16a. Name of Graduate Program</label>
          <select name="graduateProgram" value={sectionC.graduateProgram} onChange={handleChangeC} className={selectClass}>
            <option value="" disabled>Select program</option>
            <option value="maed">Master of Arts in Education</option>
            <option value="mscs">Master of Science in Computer Science</option>
            <option value="mshm">Master of Science in Hospitality Management</option>
            <option value="other">Other</option>
          </select>
          {sectionC.graduateProgram === 'other' && (
            <input name="graduateProgramOther" value={sectionC.graduateProgramOther} onChange={handleChangeC} placeholder="Please specify program" className={`${inputClass} mt-2`} />
          )}
        </div>
        <div>
          <label className={labelClass}>16b. Earned Units</label>
          <input name="earnedUnits" value={sectionC.earnedUnits} onChange={handleChangeC} placeholder="e.g. 24 units" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>16c. Name of College / University</label>
          <input name="graduateCollege" value={sectionC.graduateCollege} onChange={handleChangeC} placeholder="e.g. Bulacan State University" className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass}>17. What made you pursue advance studies?</label>
        <div className="space-y-2 mt-1">
          {['For promotion', 'For professional development'].map(r => (
            <label key={r} className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={sectionC.advanceStudyReason.includes(r)} onChange={() => handleCheckC('advanceStudyReason', r)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span>{r}</span>
            </label>
          ))}
        </div>
        <input name="advanceStudyReasonOther" value={sectionC.advanceStudyReasonOther} onChange={handleChangeC} placeholder="Other (please specify)" className={`${inputClass} mt-2`} />
      </div>
    </div>
  );

  // ─── SECTION D ───
  const notEmployedOptions = [
    'Advance or further study',
    'Family concern and decided not to find a job',
    'Health-related reason(s)',
    'Lack of work experience',
    'No job opportunity',
    'Did not look for a job',
  ];

  const renderSectionD = () => (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold text-blue-900 mb-1">D. Employment Data</h2>
      <p className="text-gray-500 text-sm mb-4">Your current employment status and suggestions.</p>

      <div>
        <label className={labelClass}>18. Are you presently employed?</label>
        <div className="flex space-x-6 mt-2">
          {['Yes', 'No'].map(opt => (
            <label key={opt} className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
              <input type="radio" name="presentlyEmployed" value={opt.toLowerCase()} checked={sectionD.presentlyEmployed === opt.toLowerCase()} onChange={handleChangeD} className="text-blue-600 focus:ring-blue-500" />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      </div>

      {sectionD.presentlyEmployed === 'no' && (
        <div className="bg-red-50 rounded-xl p-5 border border-red-100 space-y-4">
          <p className="font-semibold text-red-800 text-sm">19. Reason(s) why you are not yet employed</p>
          <p className="text-xs text-gray-400">You may check more than one answer.</p>
          <div className="space-y-2">
            {notEmployedOptions.map(r => (
              <label key={r} className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={sectionD.notEmployedReasons.includes(r)} onChange={() => handleCheckD('notEmployedReasons', r)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                <span>{r}</span>
              </label>
            ))}
          </div>
          <input name="notEmployedOther" value={sectionD.notEmployedOther} onChange={handleChangeD} placeholder="Other (please specify)" className={inputClass} />
        </div>
      )}

      <div className="mt-6">
        <label className={labelClass}>35. Suggestions to further improve your course curriculum</label>
        <textarea
          name="suggestions"
          value={sectionD.suggestions}
          onChange={handleChangeD}
          rows={5}
          placeholder="Share your suggestions here..."
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition text-sm resize-none"
        />
      </div>
    </div>
  );

  const renderCurrentSection = () => {
    switch (currentSection) {
      case 0: return renderSectionA();
      case 1: return renderSectionB();
      case 2: return renderSectionC();
      case 3: return renderSectionD();
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-cover bg-center bg-fixed relative" style={{ backgroundImage: 'url(/public/520382375_1065446909052636_3412465913398569974_n.jpg)' }}>
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

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 relative">
        <div className="flex justify-center mb-6">
          <img
            src="Gemini_Generated_Image_d1z1yd1z1yd1z1yd (2) (1).png"
            alt="GradTrack Logo"
            className="h-20 object-contain"
          />
        </div>
        <ProgressBar />

        <div className="bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
          {renderCurrentSection()}

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

            {currentSection < sections.length - 1 ? (
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
