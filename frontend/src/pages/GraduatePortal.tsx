import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  BarChart3,
  Briefcase,
  ChevronDown,
  CheckCircle2,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  User,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { API_BASE_URL, API_ENDPOINTS } from '../config/api';
import { useGraduateAuth } from '../contexts/GraduateAuthContext';
import MessageBox from '../components/MessageBox';

type PortalTab = 'dashboard' | 'mentors' | 'requests' | 'jobs' | 'applications' | 'my_profile' | 'mentor_profile' | 'job_posting';

interface Mentor {
  id: number;
  graduate_id: number;
  first_name: string;
  last_name: string;
  program_name: string | null;
  program_code: string | null;
  year_graduated: number | null;
  current_job_title: string | null;
  company: string | null;
  industry: string | null;
  skills: string | null;
  bio: string | null;
  preferred_topics: string | null;
  availability_status: 'available' | 'busy' | 'unavailable';
  avg_rating: number;
  feedback_count: number;
}

interface MentorshipRequest {
  id: number;
  mentor_id: number;
  request_message: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'completed';
  requested_at: string;
  mentor_first_name?: string;
  mentor_last_name?: string;
  current_job_title?: string;
  company?: string;
  mentee_first_name?: string;
  mentee_last_name?: string;
}

interface JobPost {
  id: number;
  title: string;
  company: string;
  location: string | null;
  job_type: string;
  industry: string | null;
  application_deadline: string | null;
  is_active: number;
}

interface JobApplication {
  id: number;
  job_post_id: number;
  status: 'pending' | 'reviewed' | 'shortlisted' | 'rejected' | 'hired';
  application_note: string | null;
  title?: string;
  company?: string;
  first_name?: string;
  last_name?: string;
}

interface MentorProfileForm {
  current_job_title: string;
  company: string;
  industry: string;
  skills: string;
  bio: string;
  preferred_topics: string;
  availability_status: 'available' | 'busy' | 'unavailable';
  is_active: boolean;
}

interface JobForm {
  id?: number;
  title: string;
  company: string;
  location: string;
  job_type: string;
  industry: string;
  description: string;
  qualifications: string;
  required_skills: string;
  application_deadline: string;
  application_method: string;
  is_active: boolean;
}

interface AlumniBadge {
  code: string;
  name: string;
  description: string;
}

interface AlumniRecommendation {
  area_key: string;
  area: string;
  missing_points: number;
  current_points: number;
  max_points: number;
  action: string;
}

interface AlumniBreakdownItem {
  label: string;
  max_points: number;
  earned_points: number;
  percent: number;
  meta: Record<string, unknown>;
}

interface AlumniRating {
  score: number;
  badges: AlumniBadge[];
  recommendations: AlumniRecommendation[];
  breakdown: Record<string, AlumniBreakdownItem>;
  status_flags: {
    is_survey_complete: boolean;
    is_employed: boolean;
    is_aligned: boolean;
    has_survey_completed_badge: boolean;
    is_verified_graduate: boolean;
    is_active_mentor: boolean;
  };
  permissions: {
    can_post_jobs: boolean;
    can_use_mentorship: boolean;
    can_register_mentor: boolean;
    requirements: {
      job_posting: {
        is_employed: boolean;
      };
      mentorship: {
        is_employed: boolean;
        is_aligned: boolean;
      };
    };
  };
}

const defaultMentorProfile: MentorProfileForm = {
  current_job_title: '',
  company: '',
  industry: '',
  skills: '',
  bio: '',
  preferred_topics: '',
  availability_status: 'available',
  is_active: true,
};

const defaultJobForm: JobForm = {
  title: '',
  company: '',
  location: '',
  job_type: 'full_time',
  industry: '',
  description: '',
  qualifications: '',
  required_skills: '',
  application_deadline: '',
  application_method: '',
  is_active: true,
};

export default function GraduatePortal() {
  const { user, logout, checkAuth } = useGraduateAuth();

  const [activeTab, setActiveTab] = useState<PortalTab>('dashboard');
  const [loading, setLoading] = useState(false);
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<MentorshipRequest[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<MentorshipRequest[]>([]);
  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [myPostedJobs, setMyPostedJobs] = useState<JobPost[]>([]);
  const [myApplications, setMyApplications] = useState<JobApplication[]>([]);
  const [receivedApplications, setReceivedApplications] = useState<JobApplication[]>([]);
  const [myMentorProfile, setMyMentorProfile] = useState<MentorProfileForm>(defaultMentorProfile);
  const [hasMentorProfile, setHasMentorProfile] = useState(false);
  const [showMentorProfileForm, setShowMentorProfileForm] = useState(false);
  const [myJobForm, setMyJobForm] = useState<JobForm>(defaultJobForm);
  const [mentorSearch, setMentorSearch] = useState('');
  const [jobSearch, setJobSearch] = useState('');
  const [ratingSummary, setRatingSummary] = useState<AlumniRating | null>(null);
  const [profileForm, setProfileForm] = useState({
    first_name: '',
    middle_name: '',
    last_name: '',
    email: '',
    phone: '',
    address: '',
    password: '',
    confirm_password: '',
  });
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<string>('');

  const [msgBox, setMsgBox] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'warning' | 'info';
    title?: string;
    message: string;
  }>({ isOpen: false, type: 'info', message: '' });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const profileImageInputRef = useRef<HTMLInputElement | null>(null);

  const resolveProfileImageUrl = (path?: string | null) => {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return `${API_BASE_URL}/${path.replace(/^\/+/, '')}`;
  };

  const profileImageUrl = useMemo(() => resolveProfileImageUrl(user?.profile_image_path), [user?.profile_image_path]);

  const userRoleLabel = useMemo(() => {
    const rawRole = (user?.role || 'graduate') as string;
    return rawRole
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }, [user?.role]);

  const userInitials = useMemo(() => {
    const name = (user?.full_name || '').trim();
    if (!name) return 'G';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  }, [user?.full_name]);

  const notify = (type: 'success' | 'error' | 'warning' | 'info', message: string, title?: string) => {
    setMsgBox({ isOpen: true, type, message, title });
  };

  const authenticatedFetch = async (url: string, options?: RequestInit) => {
    const hasFormData = options?.body instanceof FormData;
    const headers = new Headers(options?.headers || {});

    if (!hasFormData && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, {
      credentials: 'include',
      ...options,
      headers,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok || data.success === false) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [ratingRes, mentorList, reqOut, reqIn, jobsList, appsMine, appsReceived, myMentor, mineJobs] = await Promise.all([
        authenticatedFetch(API_ENDPOINTS.ALUMNI_RATING.SUMMARY),
        authenticatedFetch(`${API_ENDPOINTS.MENTORSHIP.MENTORS}?search=${encodeURIComponent(mentorSearch)}`),
        authenticatedFetch(`${API_ENDPOINTS.MENTORSHIP.REQUESTS}?type=outgoing`),
        authenticatedFetch(`${API_ENDPOINTS.MENTORSHIP.REQUESTS}?type=incoming`),
        authenticatedFetch(`${API_ENDPOINTS.JOBS.POSTS}?search=${encodeURIComponent(jobSearch)}`),
        authenticatedFetch(`${API_ENDPOINTS.JOBS.APPLICATIONS}?type=my`),
        authenticatedFetch(`${API_ENDPOINTS.JOBS.APPLICATIONS}?type=received`),
        authenticatedFetch(`${API_ENDPOINTS.MENTORSHIP.MENTORS}?mine=1`),
        authenticatedFetch(`${API_ENDPOINTS.JOBS.POSTS}?mine=1&include_inactive=1`),
      ]);

      setMentors(mentorList.data || []);
      setOutgoingRequests(reqOut.data || []);
      setIncomingRequests(reqIn.data || []);
      setJobs(jobsList.data || []);
      setMyPostedJobs(mineJobs.data || []);
      setMyApplications(appsMine.data || []);
      setReceivedApplications(appsReceived.data || []);
      setRatingSummary(ratingRes?.data?.rating || null);

      if (myMentor.data) {
        setHasMentorProfile(true);
        setShowMentorProfileForm(true);
        setMyMentorProfile({
          current_job_title: myMentor.data.current_job_title || '',
          company: myMentor.data.company || '',
          industry: myMentor.data.industry || '',
          skills: myMentor.data.skills || '',
          bio: myMentor.data.bio || '',
          preferred_topics: myMentor.data.preferred_topics || '',
          availability_status: myMentor.data.availability_status || 'available',
          is_active: !!myMentor.data.is_active,
        });
      } else {
        setHasMentorProfile(false);
        setShowMentorProfileForm(false);
        setMyMentorProfile(defaultMentorProfile);
      }
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Failed to load portal data', 'Load Error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    setProfileForm((prev) => ({
      ...prev,
      first_name: user?.first_name || '',
      middle_name: user?.middle_name || '',
      last_name: user?.last_name || '',
      email: user?.email || '',
      phone: user?.phone || '',
      address: user?.address || '',
    }));
  }, [user]);

  useEffect(() => {
    setProfileImagePreview(profileImageUrl);
  }, [profileImageUrl]);

  useEffect(() => {
    const onDocumentMouseDown = (event: MouseEvent) => {
      if (!profileMenuRef.current) return;
      if (!profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', onDocumentMouseDown);
    return () => document.removeEventListener('mousedown', onDocumentMouseDown);
  }, []);

  const canPostJobs = !!ratingSummary?.permissions?.can_post_jobs;
  const canUseMentorship = !!ratingSummary?.permissions?.can_use_mentorship;
  const canRegisterMentor = !!ratingSummary?.permissions?.can_register_mentor;

  const filteredMentors = useMemo(() => {
    if (!mentorSearch.trim()) return mentors;
    const q = mentorSearch.toLowerCase();
    return mentors.filter((m) =>
      [
        `${m.first_name} ${m.last_name}`,
        m.program_name || '',
        m.program_code || '',
        m.industry || '',
        m.skills || '',
        m.current_job_title || '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [mentorSearch, mentors]);

  const filteredJobs = useMemo(() => {
    if (!jobSearch.trim()) return jobs;
    const q = jobSearch.toLowerCase();
    return jobs.filter((j) =>
      [j.title, j.company, j.location || '', j.job_type, j.industry || '']
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [jobSearch, jobs]);

  const sendMentorshipRequest = async (mentorId: number) => {
    if (!canUseMentorship) {
      notify('warning', 'Mentorship is locked. Set your employment status to employed and alignment to aligned.');
      return;
    }

    const message = window.prompt('Add a short request note for the mentor (optional):', 'I would like to request mentorship guidance.');

    try {
      await authenticatedFetch(API_ENDPOINTS.MENTORSHIP.REQUESTS, {
        method: 'POST',
        body: JSON.stringify({
          mentor_id: mentorId,
          request_message: message || '',
        }),
      });
      notify('success', 'Mentorship request sent successfully.');
      await fetchAll();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to send request');
    }
  };

  const updateMentorshipStatus = async (id: number, status: string) => {
    if (!canUseMentorship) {
      notify('warning', 'Mentorship access is currently locked due to unmet eligibility rules.');
      return;
    }

    try {
      await authenticatedFetch(API_ENDPOINTS.MENTORSHIP.REQUESTS, {
        method: 'PUT',
        body: JSON.stringify({ id, status }),
      });
      notify('success', `Request marked as ${status}.`);
      await fetchAll();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to update request');
    }
  };

  const submitFeedback = async (requestId: number) => {
    if (!canUseMentorship) {
      notify('warning', 'Mentorship access is currently locked due to unmet eligibility rules.');
      return;
    }

    const ratingRaw = window.prompt('Rate your mentorship experience (1-5):', '5');
    const rating = Number(ratingRaw || '0');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      notify('warning', 'Please provide a rating from 1 to 5.');
      return;
    }

    const feedback = window.prompt('Share a short feedback note (optional):', 'Thank you for the guidance!') || '';

    try {
      await authenticatedFetch(API_ENDPOINTS.MENTORSHIP.FEEDBACK, {
        method: 'POST',
        body: JSON.stringify({
          mentorship_request_id: requestId,
          rating,
          feedback_text: feedback,
        }),
      });
      notify('success', 'Feedback submitted.');
      await fetchAll();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to submit feedback');
    }
  };

  const handleMentorProfileSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!canRegisterMentor) {
      notify('warning', 'Mentor profile creation is locked until your employment is set to employed and aligned with your course.');
      return;
    }

    try {
      await authenticatedFetch(API_ENDPOINTS.MENTORSHIP.MENTORS, {
        method: 'POST',
        body: JSON.stringify(myMentorProfile),
      });
      setHasMentorProfile(true);
      setShowMentorProfileForm(true);
      notify('success', 'Mentor profile saved. You can now appear in mentor search.', 'Mentorship');
      await fetchAll();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to save mentor profile');
    }
  };

  const applyToJob = async (jobId: number) => {
    const note = window.prompt('Add application note (optional):', 'I am interested in this opportunity and would love to be considered.') || '';

    try {
      await authenticatedFetch(API_ENDPOINTS.JOBS.APPLICATIONS, {
        method: 'POST',
        body: JSON.stringify({
          job_post_id: jobId,
          application_note: note,
        }),
      });
      notify('success', 'Application submitted successfully.');
      await fetchAll();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to apply');
    }
  };

  const updateApplicationStatus = async (id: number, status: JobApplication['status']) => {
    try {
      await authenticatedFetch(API_ENDPOINTS.JOBS.APPLICATIONS, {
        method: 'PUT',
        body: JSON.stringify({ id, status }),
      });
      notify('success', `Application updated to ${status}.`);
      await fetchAll();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to update application status');
    }
  };

  const handleJobSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!canPostJobs) {
      notify('warning', 'Job posting is locked until your employment status is set to employed.');
      return;
    }

    const payload = {
      ...myJobForm,
      application_deadline: myJobForm.application_deadline || null,
    };

    try {
      if (myJobForm.id) {
        await authenticatedFetch(API_ENDPOINTS.JOBS.POSTS, {
          method: 'PUT',
          body: JSON.stringify({ ...payload, id: myJobForm.id }),
        });
        notify('success', 'Job post updated successfully.');
      } else {
        await authenticatedFetch(API_ENDPOINTS.JOBS.POSTS, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify('success', 'Job post published successfully.');
      }

      setMyJobForm(defaultJobForm);
      await fetchAll();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to save job post');
    }
  };

  const beginEditJob = async (id: number) => {
    try {
      const detail = await authenticatedFetch(`${API_ENDPOINTS.JOBS.POSTS}?id=${id}`);
      const data = detail.data;
      setMyJobForm({
        id: data.id,
        title: data.title || '',
        company: data.company || '',
        location: data.location || '',
        job_type: data.job_type || 'full_time',
        industry: data.industry || '',
        description: data.description || '',
        qualifications: data.qualifications || '',
        required_skills: data.required_skills || '',
        application_deadline: data.application_deadline || '',
        application_method: data.application_method || '',
        is_active: !!data.is_active,
      });
      setActiveTab('job_posting');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to load job details');
    }
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = '/graduate/signin';
  };

  const handleMyProfileSave = async (e: FormEvent) => {
    e.preventDefault();

    if (profileForm.password !== profileForm.confirm_password) {
      notify('warning', 'Password and confirm password do not match.', 'Profile');
      return;
    }

    const formData = new FormData();
    formData.append('first_name', profileForm.first_name.trim());
    formData.append('middle_name', profileForm.middle_name.trim());
    formData.append('last_name', profileForm.last_name.trim());
    formData.append('email', profileForm.email.trim());
    formData.append('phone', profileForm.phone.trim());
    formData.append('address', profileForm.address.trim());

    if (profileForm.password.trim()) {
      formData.append('password', profileForm.password);
    }

    if (profileImageFile) {
      formData.append('profile_image', profileImageFile);
    }

    try {
      await authenticatedFetch(API_ENDPOINTS.GRADUATE_PROFILE, {
        method: 'POST',
        body: formData,
      });

      await checkAuth();
      setProfileImageFile(null);
      setProfileForm((prev) => ({
        ...prev,
        password: '',
        confirm_password: '',
      }));
      notify('success', 'Profile updated successfully.', 'My Profile');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to update profile', 'My Profile');
    }
  };

  const navItems: Array<{ key: PortalTab; label: string; icon: LucideIcon }> = [
    { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { key: 'mentors', label: 'Find Mentors', icon: Users },
    { key: 'requests', label: 'Mentorship Requests', icon: ClipboardList },
    { key: 'jobs', label: 'Browse Jobs', icon: Briefcase },
    { key: 'applications', label: 'My Applications', icon: LayoutDashboard },
    { key: 'mentor_profile', label: 'Mentor Profile', icon: Users },
    { key: 'job_posting', label: 'Job Posting', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside
        className={`fixed inset-y-0 left-0 z-40 bg-blue-900 text-white transition-all duration-300 hidden lg:flex flex-col ${
          sidebarOpen ? 'w-64' : 'w-20'
        }`}
      >
        <div className="flex items-center justify-center gap-3 px-4 py-4 border-b border-white/10">
          {sidebarOpen ? (
            <img src="/Gradtrack_Logo2.png" alt="GradTrack" className="h-12 object-contain" />
          ) : (
            <img src="/Gradtrack_small.png" alt="GradTrack" className="h-10 w-10 object-contain" />
          )}
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              className={`w-[calc(100%-1rem)] mx-2 flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                activeTab === item.key
                  ? 'bg-yellow-500 text-blue-900 font-semibold'
                  : 'text-blue-100 hover:bg-blue-800'
              }`}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {sidebarOpen && <span className="text-sm">{item.label}</span>}
            </button>
          ))}
        </nav>

        <button
          onClick={() => setSidebarOpen((prev) => !prev)}
          className="p-4 border-t border-white/10 hover:bg-white/10 transition-colors flex items-center justify-center"
          aria-label="Toggle sidebar"
        >
          {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </aside>

      <div className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-20'}`}>
        <header className="bg-blue-900 text-white shadow sticky top-0 z-30 border-b-4 border-yellow-500">
          <div className="px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen((prev) => !prev)}
                className="hidden lg:inline-flex p-2 rounded-lg bg-white/10 hover:bg-white/20"
                aria-label="Toggle sidebar"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold">Graduate Ecosystem Portal</h1>
                <p className="text-blue-100 text-sm">
                  Welcome, {user?.full_name}. Explore mentorship and career opportunities.
                </p>
              </div>
            </div>

            <div className="relative" ref={profileMenuRef}>
              <button
                onClick={() => setProfileMenuOpen((prev) => !prev)}
                className="flex items-center gap-3 bg-white/10 hover:bg-white/20 rounded-full px-3 py-1.5 min-w-[260px]"
                aria-haspopup="menu"
                aria-expanded={profileMenuOpen}
              >
                {profileImagePreview ? (
                  <img src={profileImagePreview} alt="Profile" className="w-9 h-9 rounded-full object-cover border border-white/30" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-white text-blue-900 flex items-center justify-center font-bold text-sm">
                    {userInitials}
                  </div>
                )}
                <div className="text-left leading-tight flex-1">
                  <p className="font-semibold text-white text-lg truncate">{user?.full_name || 'Graduate User'}</p>
                  <p className="text-blue-100 text-sm">{userRoleLabel}</p>
                </div>
                <ChevronDown className={`w-4 h-4 text-blue-100 transition-transform ${profileMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {profileMenuOpen && (
                <div className="absolute right-0 mt-2 w-[320px] bg-white rounded-2xl shadow-xl overflow-hidden z-50 text-gray-800 border border-gray-200">
                  <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                    {profileImagePreview ? (
                      <img src={profileImagePreview} alt="Profile" className="w-11 h-11 rounded-full object-cover border border-gray-200" />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-blue-900 text-white flex items-center justify-center font-bold">
                        {userInitials}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-xl text-gray-900 truncate">{user?.full_name || 'Graduate User'}</p>
                      <p className="text-sm text-gray-500 truncate">{user?.email || 'No email available'}</p>
                      <p className="text-sm text-gray-500">{userRoleLabel}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setActiveTab('my_profile');
                      setProfileMenuOpen(false);
                    }}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-2 text-lg"
                  >
                    <User className="w-4 h-4" />
                    My Profile
                  </button>

                  <button
                    onClick={handleLogout}
                    className="w-full px-4 py-3 text-left hover:bg-red-50 flex items-center gap-2 text-lg text-red-600"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6">
          <div className="bg-white rounded-xl border border-gray-200 p-2 mb-6 flex flex-wrap gap-2 lg:hidden">
            {navItems.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  activeTab === tab.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="bg-white rounded-xl p-10 text-center border border-gray-200">Loading portal data...</div>
          ) : (
            <>
            {activeTab === 'dashboard' && (
              <section className="space-y-4">
                {!ratingSummary ? (
                  <div className="bg-white rounded-xl border border-gray-200 p-6 text-gray-600">
                    Dashboard data is not available yet. Try refreshing the page.
                  </div>
                ) : (
                  <>
                    <div className="bg-white rounded-xl border border-gray-200 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-sm text-gray-500">Graduate Access Overview</p>
                          <div className="flex items-baseline gap-2 mt-1">
                            <h2 className="text-2xl font-extrabold text-blue-900">Employment-Based Access</h2>
                            <span className="text-sm text-gray-500">live eligibility status</span>
                          </div>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-2 text-sm min-w-[280px]">
                          <div className={`rounded-lg px-3 py-2 border ${canPostJobs ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                            {canPostJobs ? 'Job posting unlocked' : 'Job posting locked until employment status is set to employed.'}
                          </div>
                          <div className={`rounded-lg px-3 py-2 border ${canUseMentorship ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                            {canUseMentorship ? 'Mentorship features unlocked' : 'Mentorship locked until employment is employed and aligned to your course.'}
                          </div>
                        </div>
                      </div>

                      <div className="grid sm:grid-cols-3 gap-2 mt-3 text-xs">
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                          <p className="text-gray-500">Employment status</p>
                          <p className={ratingSummary.status_flags.is_employed ? 'font-semibold text-green-700' : 'font-semibold text-amber-700'}>
                            {ratingSummary.status_flags.is_employed ? 'Employed' : 'Not employed'}
                          </p>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                          <p className="text-gray-500">Course alignment</p>
                          <p className={ratingSummary.status_flags.is_aligned ? 'font-semibold text-green-700' : 'font-semibold text-amber-700'}>
                            {ratingSummary.status_flags.is_aligned ? 'Aligned' : 'Not aligned'}
                          </p>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                          <p className="text-gray-500">Recognition badges</p>
                          <p className="font-semibold text-blue-900">{ratingSummary.badges.length}</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid xl:grid-cols-3 gap-4">
                      <div className="bg-white rounded-xl border border-gray-200 p-5 xl:col-span-2">
                        <div className="flex items-center gap-2 mb-3">
                          <BarChart3 className="w-5 h-5 text-blue-700" />
                          <h3 className="text-lg font-bold text-blue-900">Feature Access Details</h3>
                        </div>

                        <div className="space-y-3">
                          <div className="rounded-lg border border-gray-200 p-3">
                            <p className="text-sm font-semibold text-blue-900 mb-2">Job Posting Requirements</p>
                            <div className="space-y-1 text-sm">
                              <div className="flex items-center justify-between">
                                <span className="text-gray-700">Employment status is employed</span>
                                <span className={ratingSummary.status_flags.is_employed ? 'text-green-700 font-semibold' : 'text-amber-700 font-semibold'}>
                                  {ratingSummary.status_flags.is_employed ? 'Met' : 'Not met'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-lg border border-gray-200 p-3">
                            <p className="text-sm font-semibold text-blue-900 mb-2">Mentorship Requirements</p>
                            <div className="space-y-1 text-sm">
                              <div className="flex items-center justify-between">
                                <span className="text-gray-700">Employment status is employed</span>
                                <span className={ratingSummary.status_flags.is_employed ? 'text-green-700 font-semibold' : 'text-amber-700 font-semibold'}>
                                  {ratingSummary.status_flags.is_employed ? 'Met' : 'Not met'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-gray-700">Job is aligned with course</span>
                                <span className={ratingSummary.status_flags.is_aligned ? 'text-green-700 font-semibold' : 'text-amber-700 font-semibold'}>
                                  {ratingSummary.status_flags.is_aligned ? 'Met' : 'Not met'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
                            Keep your employment and alignment information updated to maintain access eligibility.
                          </div>
                        </div>
                      </div>

                      <div className="bg-white rounded-xl border border-gray-200 p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <Award className="w-5 h-5 text-amber-600" />
                          <h3 className="text-lg font-bold text-blue-900">Account Snapshot</h3>
                        </div>

                        <div className="space-y-2 text-sm">
                          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                            <span className="text-gray-700">Account holder</span>
                            <span className="font-semibold text-blue-900">{user?.full_name || 'Graduate'}</span>
                          </div>

                          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                            <span className="text-gray-700">Program</span>
                            <span className="font-semibold text-blue-900">{user?.program_code || user?.program_name || 'N/A'}</span>
                          </div>

                          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                            <span className="text-gray-700">Year graduated</span>
                            <span className="font-semibold text-blue-900">{user?.year_graduated || 'N/A'}</span>
                          </div>

                          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                            <span className="text-gray-700">Email</span>
                            <span className="font-semibold text-blue-900">{user?.email || 'N/A'}</span>
                          </div>

                          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                            <span className="text-gray-700">Phone</span>
                            <span className="font-semibold text-blue-900">{user?.phone || 'N/A'}</span>
                          </div>

                          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                            <span className="text-gray-700">Feature unlock summary</span>
                            <span className="font-semibold text-blue-900">
                              {(canPostJobs ? 1 : 0) + (canUseMentorship ? 1 : 0)} / 2 unlocked
                            </span>
                          </div>
                        </div>
                      </div>

                    </div>
                  </>
                )}
              </section>
            )}

            {activeTab === 'mentors' && (
              <section className="space-y-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <input
                    value={mentorSearch}
                    onChange={(e) => setMentorSearch(e.target.value)}
                    placeholder="Search mentors by name, program, industry, or skills"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg"
                  />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  {filteredMentors.map((mentor) => (
                    <div key={mentor.id} className="bg-white rounded-xl border border-gray-200 p-5">
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <h3 className="text-lg font-bold text-blue-900">
                            {mentor.first_name} {mentor.last_name}
                          </h3>
                          <p className="text-sm text-gray-600">
                            {mentor.current_job_title || 'Professional'} {mentor.company ? `at ${mentor.company}` : ''}
                          </p>
                        </div>
                        <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                          {mentor.availability_status}
                        </span>
                      </div>
                      <div className="mt-3 space-y-1 text-sm text-gray-700">
                        <p><span className="font-semibold">Program:</span> {mentor.program_name || mentor.program_code || 'N/A'}</p>
                        <p><span className="font-semibold">Industry:</span> {mentor.industry || 'N/A'}</p>
                        <p><span className="font-semibold">Skills:</span> {mentor.skills || 'N/A'}</p>
                        <p><span className="font-semibold">Topics:</span> {mentor.preferred_topics || 'N/A'}</p>
                        <p><span className="font-semibold">Rating:</span> {mentor.avg_rating} ({mentor.feedback_count} feedback)</p>
                        {mentor.bio && <p className="text-gray-600 mt-2">{mentor.bio}</p>}
                      </div>
                      <button
                        onClick={() => sendMentorshipRequest(mentor.id)}
                        className="mt-4 w-full py-2 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        Request Mentorship
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'requests' && (
              <section className="grid lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="text-xl font-bold text-blue-900 mb-4">Incoming Requests (as Mentor)</h2>
                  <div className="space-y-3">
                    {incomingRequests.length === 0 && <p className="text-gray-500">No incoming mentorship requests.</p>}
                    {incomingRequests.map((req) => (
                      <div key={req.id} className="border border-gray-200 rounded-lg p-3">
                        <p className="font-semibold text-gray-800">{req.mentee_first_name} {req.mentee_last_name}</p>
                        <p className="text-sm text-gray-600 mt-1">{req.request_message || 'No message provided.'}</p>
                        <p className="text-xs text-gray-500 mt-1">Status: {req.status}</p>
                        <div className="mt-3 flex gap-2">
                          {req.status === 'pending' && (
                            <>
                              <button onClick={() => updateMentorshipStatus(req.id, 'accepted')} disabled={!canUseMentorship} className="px-3 py-1.5 bg-green-600 text-white rounded text-sm disabled:opacity-60">Accept</button>
                              <button onClick={() => updateMentorshipStatus(req.id, 'declined')} className="px-3 py-1.5 bg-red-600 text-white rounded text-sm">Decline</button>
                            </>
                          )}
                          {req.status === 'accepted' && (
                            <button onClick={() => updateMentorshipStatus(req.id, 'completed')} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">Mark Completed</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="text-xl font-bold text-blue-900 mb-4">My Mentorship Requests</h2>
                  <div className="space-y-3">
                    {outgoingRequests.length === 0 && <p className="text-gray-500">You have not sent mentorship requests yet.</p>}
                    {outgoingRequests.map((req) => (
                      <div key={req.id} className="border border-gray-200 rounded-lg p-3">
                        <p className="font-semibold text-gray-800">
                          Mentor: {req.mentor_first_name} {req.mentor_last_name}
                        </p>
                        <p className="text-sm text-gray-600">{req.current_job_title || 'Professional'} {req.company ? `at ${req.company}` : ''}</p>
                        <p className="text-sm text-gray-600 mt-1">{req.request_message || 'No request message.'}</p>
                        <p className="text-xs text-gray-500 mt-1">Status: {req.status}</p>
                        {req.status === 'completed' && (
                          <button onClick={() => submitFeedback(req.id)} className="mt-3 px-3 py-1.5 bg-yellow-500 text-blue-900 rounded text-sm font-semibold">
                            Leave Feedback
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'jobs' && (
              <section className="space-y-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <input
                    value={jobSearch}
                    onChange={(e) => setJobSearch(e.target.value)}
                    placeholder="Search jobs by title, company, type, location, or industry"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg"
                  />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  {filteredJobs.map((job) => (
                    <div key={job.id} className="bg-white rounded-xl border border-gray-200 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-bold text-blue-900">{job.title}</h3>
                          <p className="text-sm text-gray-600">{job.company}</p>
                        </div>
                        <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                          {job.job_type.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="mt-3 text-sm text-gray-700 space-y-1">
                        <p><span className="font-semibold">Location:</span> {job.location || 'N/A'}</p>
                        <p><span className="font-semibold">Industry:</span> {job.industry || 'N/A'}</p>
                        <p><span className="font-semibold">Deadline:</span> {job.application_deadline || 'Open until filled'}</p>
                      </div>
                      <button
                        onClick={() => applyToJob(job.id)}
                        className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium"
                      >
                        Apply / Express Interest
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'applications' && (
              <section className="grid lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="text-xl font-bold text-blue-900 mb-4">My Job Applications</h2>
                  <div className="space-y-3">
                    {myApplications.length === 0 && <p className="text-gray-500">No applications yet.</p>}
                    {myApplications.map((app) => (
                      <div key={app.id} className="border border-gray-200 rounded-lg p-3">
                        <p className="font-semibold text-gray-800">{app.title}</p>
                        <p className="text-sm text-gray-600">{app.company}</p>
                        <span className="inline-block mt-2 text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                          {app.status}
                        </span>
                        {app.application_note && <p className="text-sm text-gray-600 mt-2">{app.application_note}</p>}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="text-xl font-bold text-blue-900 mb-4">Applications Received (My Posts)</h2>
                  <div className="space-y-3">
                    {receivedApplications.length === 0 && <p className="text-gray-500">No received applications yet.</p>}
                    {receivedApplications.map((app) => (
                      <div key={app.id} className="border border-gray-200 rounded-lg p-3">
                        <p className="font-semibold text-gray-800">{app.first_name} {app.last_name}</p>
                        <p className="text-sm text-gray-600">Applied for: {app.title} ({app.company})</p>
                        <p className="text-xs text-gray-500 mt-1">Current status: {app.status}</p>
                        <div className="flex flex-wrap gap-2 mt-3">
                          {(['reviewed', 'shortlisted', 'rejected', 'hired'] as JobApplication['status'][]).map((status) => (
                            <button
                              key={status}
                              onClick={() => updateApplicationStatus(app.id, status)}
                              className="px-2.5 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200"
                            >
                              Mark {status}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'my_profile' && (
              <section className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold text-blue-900">My Profile</h2>
                  <p className="text-sm text-gray-600">Manage your personal information and account settings.</p>
                </div>

                <form onSubmit={handleMyProfileSave} className="space-y-4">
                  <div className="grid xl:grid-cols-4 gap-4">
                    <div className="bg-white rounded-xl border border-gray-200 p-5 xl:col-span-1">
                      {profileImagePreview ? (
                        <img src={profileImagePreview} alt="Profile" className="w-28 h-28 rounded-full object-cover border border-gray-300 mx-auto" />
                      ) : (
                        <div className="w-28 h-28 rounded-full bg-blue-100 text-blue-900 font-bold text-3xl flex items-center justify-center mx-auto">
                          {userInitials}
                        </div>
                      )}
                      <p className="text-center text-blue-900 font-semibold mt-3">{user?.full_name || 'Graduate User'}</p>
                      <p className="text-center text-sm text-gray-500">{userRoleLabel}</p>
                      <input
                        ref={profileImageInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setProfileImageFile(file);
                          if (file) {
                            setProfileImagePreview(URL.createObjectURL(file));
                          } else {
                            setProfileImagePreview(profileImageUrl);
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => profileImageInputRef.current?.click()}
                        className="w-full mt-3 px-3 py-2 rounded-lg border border-blue-200 text-blue-800 text-sm font-semibold hover:bg-blue-50"
                      >
                        {profileImageFile ? 'Change Selected Image' : 'Upload Profile Image'}
                      </button>
                      <p className="text-center text-xs text-gray-400 mt-2">PNG, JPG, WEBP, or GIF (max 5 MB)</p>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 p-5 xl:col-span-3">
                      <div className="grid md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">First Name</label>
                          <input
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                            value={profileForm.first_name}
                            onChange={(e) => setProfileForm((prev) => ({ ...prev, first_name: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Middle Name</label>
                          <input
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                            value={profileForm.middle_name}
                            onChange={(e) => setProfileForm((prev) => ({ ...prev, middle_name: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Last Name</label>
                          <input
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                            value={profileForm.last_name}
                            onChange={(e) => setProfileForm((prev) => ({ ...prev, last_name: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-3 mt-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Email Address</label>
                          <input
                            type="email"
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                            value={profileForm.email}
                            onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Phone Number</label>
                          <input
                            className="w-full px-3 py-2 border border-gray-300 rounded"
                            value={profileForm.phone}
                            onChange={(e) => setProfileForm((prev) => ({ ...prev, phone: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="mt-3">
                        <label className="block text-xs text-gray-500 mb-1">Address</label>
                        <input
                          className="w-full px-3 py-2 border border-gray-300 rounded"
                          value={profileForm.address}
                          onChange={(e) => setProfileForm((prev) => ({ ...prev, address: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    <h3 className="text-base font-semibold text-blue-900 mb-3">Account Settings</h3>
                    <div className="grid md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">New Password</label>
                        <input
                          type="password"
                          className="w-full px-3 py-2 border border-gray-300 rounded"
                          value={profileForm.password}
                          onChange={(e) => setProfileForm((prev) => ({ ...prev, password: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Confirm Password</label>
                        <input
                          type="password"
                          className="w-full px-3 py-2 border border-gray-300 rounded"
                          value={profileForm.confirm_password}
                          onChange={(e) => setProfileForm((prev) => ({ ...prev, confirm_password: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end mt-4">
                      <button type="submit" className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-semibold">
                        Save Changes
                      </button>
                    </div>
                  </div>
                </form>
              </section>
            )}

            {activeTab === 'mentor_profile' && (
              <section className="max-w-3xl mx-auto">
                <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Award className="w-5 h-5 text-amber-600" />
                    <h3 className="text-lg font-bold text-blue-900">Profile Badges</h3>
                  </div>
                  <div className="space-y-2">
                    {ratingSummary?.badges?.length ? (
                      ratingSummary.badges.map((badge) => (
                        <div key={badge.code} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                          <p className="font-semibold text-amber-900 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4" />
                            {badge.name}
                          </p>
                          <p className="text-sm text-amber-800 mt-1">{badge.description}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-600">No profile badges yet. Complete eligibility milestones to earn badges.</p>
                    )}
                  </div>
                </div>

                {!hasMentorProfile && !showMentorProfileForm && (
                  <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
                    <h2 className="text-xl font-bold text-blue-900">Become a Mentor</h2>
                    <p className="text-sm text-gray-600 mt-1 mb-4">
                      You do not have an existing mentor profile yet.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowMentorProfileForm(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold"
                    >
                      Create Mentor Profile
                    </button>
                  </div>
                )}

                {(hasMentorProfile || showMentorProfileForm) && (
                <form onSubmit={handleMentorProfileSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                  <h2 className="text-xl font-bold text-blue-900">
                    {hasMentorProfile ? 'Update Mentor Profile' : 'Create Mentor Profile'}
                  </h2>
                  {!canRegisterMentor && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      Mentor registration requires: employed status and aligned course match.
                    </div>
                  )}
                  <fieldset disabled={!canRegisterMentor} className="space-y-3">
                  <input
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                    placeholder="Current job title"
                    value={myMentorProfile.current_job_title}
                    onChange={(e) => setMyMentorProfile((prev) => ({ ...prev, current_job_title: e.target.value }))}
                  />
                  <input
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                    placeholder="Company"
                    value={myMentorProfile.company}
                    onChange={(e) => setMyMentorProfile((prev) => ({ ...prev, company: e.target.value }))}
                  />
                  <input
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                    placeholder="Industry"
                    value={myMentorProfile.industry}
                    onChange={(e) => setMyMentorProfile((prev) => ({ ...prev, industry: e.target.value }))}
                  />
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                    rows={2}
                    placeholder="Skills / expertise (comma separated)"
                    value={myMentorProfile.skills}
                    onChange={(e) => setMyMentorProfile((prev) => ({ ...prev, skills: e.target.value }))}
                  />
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                    rows={3}
                    placeholder="Short bio"
                    value={myMentorProfile.bio}
                    onChange={(e) => setMyMentorProfile((prev) => ({ ...prev, bio: e.target.value }))}
                  />
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                    rows={2}
                    placeholder="Preferred mentoring topics"
                    value={myMentorProfile.preferred_topics}
                    onChange={(e) => setMyMentorProfile((prev) => ({ ...prev, preferred_topics: e.target.value }))}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded"
                      value={myMentorProfile.availability_status}
                      onChange={(e) =>
                        setMyMentorProfile((prev) => ({
                          ...prev,
                          availability_status: e.target.value as MentorProfileForm['availability_status'],
                        }))
                      }
                    >
                      <option value="available">Available</option>
                      <option value="busy">Busy</option>
                      <option value="unavailable">Unavailable</option>
                    </select>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={myMentorProfile.is_active}
                        onChange={(e) => setMyMentorProfile((prev) => ({ ...prev, is_active: e.target.checked }))}
                      />
                      Visible as mentor
                    </label>
                  </div>
                  <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-semibold">
                    {hasMentorProfile ? 'Update Mentor Profile' : 'Save Mentor Profile'}
                  </button>
                  </fieldset>
                </form>
                )}
              </section>
            )}

            {activeTab === 'job_posting' && (
              <section className="grid xl:grid-cols-2 gap-6">
                <form onSubmit={handleJobSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                  <h2 className="text-xl font-bold text-blue-900">Post / Update Job Opportunity</h2>
                  {!canPostJobs && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      Job posting requires: employed status.
                    </div>
                  )}
                  <fieldset disabled={!canPostJobs} className="space-y-3">
                  <input className="w-full px-3 py-2 border border-gray-300 rounded" placeholder="Job title" value={myJobForm.title} onChange={(e) => setMyJobForm((prev) => ({ ...prev, title: e.target.value }))} required />
                  <input className="w-full px-3 py-2 border border-gray-300 rounded" placeholder="Company" value={myJobForm.company} onChange={(e) => setMyJobForm((prev) => ({ ...prev, company: e.target.value }))} required />
                  <div className="grid grid-cols-2 gap-3">
                    <input className="w-full px-3 py-2 border border-gray-300 rounded" placeholder="Location" value={myJobForm.location} onChange={(e) => setMyJobForm((prev) => ({ ...prev, location: e.target.value }))} />
                    <select className="w-full px-3 py-2 border border-gray-300 rounded" value={myJobForm.job_type} onChange={(e) => setMyJobForm((prev) => ({ ...prev, job_type: e.target.value }))}>
                      <option value="full_time">Full time</option>
                      <option value="part_time">Part time</option>
                      <option value="contract">Contract</option>
                      <option value="internship">Internship</option>
                      <option value="remote">Remote</option>
                    </select>
                  </div>
                  <input className="w-full px-3 py-2 border border-gray-300 rounded" placeholder="Industry" value={myJobForm.industry} onChange={(e) => setMyJobForm((prev) => ({ ...prev, industry: e.target.value }))} />
                  <textarea className="w-full px-3 py-2 border border-gray-300 rounded" rows={3} placeholder="Description" value={myJobForm.description} onChange={(e) => setMyJobForm((prev) => ({ ...prev, description: e.target.value }))} required />
                  <textarea className="w-full px-3 py-2 border border-gray-300 rounded" rows={2} placeholder="Qualifications" value={myJobForm.qualifications} onChange={(e) => setMyJobForm((prev) => ({ ...prev, qualifications: e.target.value }))} />
                  <textarea className="w-full px-3 py-2 border border-gray-300 rounded" rows={2} placeholder="Required skills" value={myJobForm.required_skills} onChange={(e) => setMyJobForm((prev) => ({ ...prev, required_skills: e.target.value }))} />
                  <input type="date" className="w-full px-3 py-2 border border-gray-300 rounded" value={myJobForm.application_deadline} onChange={(e) => setMyJobForm((prev) => ({ ...prev, application_deadline: e.target.value }))} />
                  <textarea className="w-full px-3 py-2 border border-gray-300 rounded" rows={2} placeholder="Application method / contact details" value={myJobForm.application_method} onChange={(e) => setMyJobForm((prev) => ({ ...prev, application_method: e.target.value }))} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={myJobForm.is_active} onChange={(e) => setMyJobForm((prev) => ({ ...prev, is_active: e.target.checked }))} />
                    Job is active
                  </label>
                  <button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-semibold">
                    {myJobForm.id ? 'Update Job Post' : 'Publish Job Post'}
                  </button>
                  {myJobForm.id && (
                    <button type="button" onClick={() => setMyJobForm(defaultJobForm)} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg font-medium">
                      Cancel Editing
                    </button>
                  )}
                  </fieldset>
                </form>

                <div className="xl:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="text-xl font-bold text-blue-900 mb-4">My Job Posts</h2>
                  <div className="grid md:grid-cols-2 gap-4">
                    {myPostedJobs.map((job) => (
                        <div key={job.id} className="border border-gray-200 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-gray-800">{job.title}</p>
                              <p className="text-sm text-gray-600">{job.company}</p>
                            </div>
                            <button onClick={() => beginEditJob(job.id)} disabled={!canPostJobs} className="text-sm px-3 py-1.5 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-60 disabled:cursor-not-allowed">
                              Edit
                            </button>
                          </div>
                          <p className="text-xs text-gray-500 mt-2">{job.location || 'No location'} | {job.job_type.replace('_', ' ')}</p>
                        </div>
                      ))}
                  </div>
                </div>
              </section>
            )}
            </>
          )}
        </main>
      </div>

      <MessageBox
        isOpen={msgBox.isOpen}
        onClose={() => setMsgBox((prev) => ({ ...prev, isOpen: false }))}
        type={msgBox.type}
        title={msgBox.title}
        message={msgBox.message}
      />
    </div>
  );
}
