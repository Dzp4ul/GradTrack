import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Award,
  BarChart3,
  Briefcase,
  ChevronDown,
  ClipboardList,
  Mail,
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
import NotificationBell from '../components/NotificationBell';

type PortalTab = 'dashboard' | 'mentors' | 'requests' | 'jobs' | 'my_profile' | 'mentor_profile' | 'job_posting';
type ApprovalStatus = 'pending' | 'approved' | 'declined';

const portalTabKeys: PortalTab[] = ['dashboard', 'mentors', 'requests', 'jobs', 'my_profile', 'mentor_profile', 'job_posting'];

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
  contact_email?: string | null;
  profile_image_path?: string | null;
  availability_status: string | null;
  max_members?: number | null;
  post_status?: 'open' | 'closed' | null;
  active_mentees_count?: number;
  approval_status?: ApprovalStatus;
  approval_reviewed_at?: string | null;
  approval_notes?: string | null;
  avg_rating: number;
  feedback_count: number;
}

interface MentorshipRequest {
  id: number;
  mentor_id: number;
  request_message: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'completed' | 'cancelled';
  requested_at: string;
  mentee_name?: string | null;
  mentee_email?: string | null;
  mentee_program?: string | null;
  reason_for_request?: string | null;
  topic?: string | null;
  preferred_schedule?: string | null;
  session_date?: string | null;
  session_time?: string | null;
  session_type?: string | null;
  meeting_link?: string | null;
  meeting_location?: string | null;
  session_notes?: string | null;
  mentor_first_name?: string;
  mentor_last_name?: string;
  mentor_profile_image_path?: string | null;
  current_job_title?: string;
  company?: string;
  industry?: string;
  availability_status?: string | null;
  mentee_first_name?: string;
  mentee_last_name?: string;
  mentee_feedback_rating?: number | null;
  mentee_feedback_text?: string | null;
  mentee_found_helpful?: boolean | null;
}

interface JobPost {
  id: number;
  title: string;
  company: string;
  location: string | null;
  job_type: string;
  industry: string | null;
  description?: string | null;
  salary_range?: string | null;
  required_skills?: string | null;
  course_program_fit?: string | null;
  application_deadline: string | null;
  contact_email?: string | null;
  application_link?: string | null;
  application_method?: string | null;
  poster_program_name?: string | null;
  poster_program_code?: string | null;
  approval_status?: ApprovalStatus;
  approval_reviewed_at?: string | null;
  approval_notes?: string | null;
  is_active: number;
}

interface ProgramOption {
  id: number;
  name: string;
  code: string;
}

interface MentorProfileForm {
  contact_email: string;
  current_job_title: string;
  company: string;
  industry: string;
  skills: string;
  bio: string;
  preferred_topics: string;
  availability_status: string;
  max_members: string;
  post_status: 'open' | 'closed';
  is_active: boolean;
}

interface MentorshipRequestForm {
  mentor_id: number | null;
  mentor_name: string;
  mentee_name: string;
  mentee_email: string;
  mentee_program: string;
  reason_for_request: string;
  request_message: string;
}

interface SessionScheduleForm {
  session_date: string;
  session_time: string;
  session_type: string;
  meeting_link: string;
  meeting_location: string;
  session_notes: string;
}

interface MenteeFeedbackForm {
  request_id: number | null;
  mentor_name: string;
  mentor_helpful: boolean;
  rating: string;
  feedback_text: string;
}

interface JobForm {
  id?: number;
  title: string;
  company: string;
  location: string;
  job_type: string;
  industry: string;
  salary_range: string;
  description: string;
  required_skills: string;
  course_program_fit: string;
  application_deadline: string;
  contact_email: string;
  application_link: string;
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
    can_request_mentorship?: boolean;
    can_register_mentor: boolean;
    requirements: {
      job_posting: {
        is_employed: boolean;
      };
      mentorship_request?: {
        is_unemployed: boolean;
      };
      mentorship: {
        is_employed: boolean;
        is_aligned: boolean;
      };
    };
  };
}

const defaultMentorProfile: MentorProfileForm = {
  contact_email: '',
  current_job_title: '',
  company: '',
  industry: '',
  skills: '',
  bio: '',
  preferred_topics: '',
  availability_status: 'Available: Saturday 2 PM - 5 PM',
  max_members: '5',
  post_status: 'open',
  is_active: true,
};

const defaultMentorshipRequestForm: MentorshipRequestForm = {
  mentor_id: null,
  mentor_name: '',
  mentee_name: '',
  mentee_email: '',
  mentee_program: '',
  reason_for_request: '',
  request_message: '',
};

const defaultScheduleForm: SessionScheduleForm = {
  session_date: '',
  session_time: '',
  session_type: 'Google Meet',
  meeting_link: '',
  meeting_location: '',
  session_notes: '',
};

const defaultMenteeFeedbackForm: MenteeFeedbackForm = {
  request_id: null,
  mentor_name: '',
  mentor_helpful: true,
  rating: '5',
  feedback_text: '',
};

const sessionTypeOptions = ['Face-to-face', 'Google Meet', 'Zoom',];
const defaultAvailability = 'Available: Saturday 2 PM - 5 PM';
const availabilityDayOptions = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const availabilityTimeOptions = ['8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM', '7 PM', '8 PM'];

const buildAvailabilityStatus = (day: string, startTime: string, endTime: string) => `Available: ${day} ${startTime} - ${endTime}`;

const extractAvailabilityTimeRange = (value?: string | null) => {
  const normalized = (value || '').replace(/\s+–\s+/g, ' - ').trim();
  const match = normalized.match(/^Available:\s+[A-Za-z]+\s+(.+?)\s*-\s*(.+)$/i);
  if (!match) return '';
  return `${match[1].trim()} - ${match[2].trim()}`;
};

const parseAvailabilityStatus = (value?: string | null) => {
  const normalized = (value || defaultAvailability).replace(/\s+–\s+/g, ' - ').trim();
  const match = normalized.match(/^Available:\s+([A-Za-z]+)\s+(.+?)\s*-\s*(.+)$/i);

  if (!match) {
    return { day: 'Saturday', startTime: '2 PM', endTime: '5 PM' };
  }

  const day = availabilityDayOptions.find((option) => option.toLowerCase() === match[1].toLowerCase()) || 'Saturday';
  const startTime = availabilityTimeOptions.includes(match[2].trim()) ? match[2].trim() : '2 PM';
  const endTime = availabilityTimeOptions.includes(match[3].trim()) ? match[3].trim() : '5 PM';

  return { day, startTime, endTime };
};

const defaultJobForm: JobForm = {
  title: '',
  company: '',
  location: '',
  job_type: 'full_time',
  industry: '',
  salary_range: '',
  description: '',
  required_skills: '',
  course_program_fit: '',
  application_deadline: '',
  contact_email: '',
  application_link: '',
  application_method: '',
  is_active: true,
};

export default function GraduatePortal() {
  const { user, logout, checkAuth } = useGraduateAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<PortalTab>('mentors');
  const [loading, setLoading] = useState(false);
  const [mentors, setMentors] = useState<Mentor[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<MentorshipRequest[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<MentorshipRequest[]>([]);
  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [myPostedJobs, setMyPostedJobs] = useState<JobPost[]>([]);
  const [programOptions, setProgramOptions] = useState<ProgramOption[]>([]);
  const [myMentorProfile, setMyMentorProfile] = useState<MentorProfileForm>(defaultMentorProfile);
  const [hasMentorProfile, setHasMentorProfile] = useState(false);
  const [myMentorApprovalStatus, setMyMentorApprovalStatus] = useState<ApprovalStatus | null>(null);
  const [myMentorApprovalNotes, setMyMentorApprovalNotes] = useState('');
  const [showMentorProfileForm, setShowMentorProfileForm] = useState(false);
  const [myJobForm, setMyJobForm] = useState<JobForm>(defaultJobForm);
  const [showJobPostForm, setShowJobPostForm] = useState(false);
  const [mentorSearch, setMentorSearch] = useState('');
  const [mentorProgramTab, setMentorProgramTab] = useState('all');
  const [mentorIndustryFilter, setMentorIndustryFilter] = useState('');
  const [mentorSkillsFilter, setMentorSkillsFilter] = useState('');
  const [mentorYearFilter, setMentorYearFilter] = useState('');
  const [requestForm, setRequestForm] = useState<MentorshipRequestForm>(defaultMentorshipRequestForm);
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<number, SessionScheduleForm>>({});
  const [menteeFeedbackForm, setMenteeFeedbackForm] = useState<MenteeFeedbackForm>(defaultMenteeFeedbackForm);
  const [jobSearch, setJobSearch] = useState('');
  const [jobProgramTab, setJobProgramTab] = useState('all');
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
    type: 'success' | 'error' | 'warning' | 'info' | 'confirm';
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
  }>({ isOpen: false, type: 'info', message: '' });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const profileImageInputRef = useRef<HTMLInputElement | null>(null);
  const mentorImageInputRef = useRef<HTMLInputElement | null>(null);
  const fetchAllRef = useRef<(silent?: boolean) => Promise<void>>(async () => {});
  const fetchInFlightRef = useRef<Promise<void> | null>(null);
  const liveRefreshCooldownRef = useRef<number>(0);

  const resolveProfileImageUrl = (path?: string | null) => {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return `${API_BASE_URL}/${path.replace(/^\/+/, '')}`;
  };

  const profileImageUrl = useMemo(() => resolveProfileImageUrl(user?.profile_image_path), [user?.profile_image_path]);
  const mentorAvailability = useMemo(
    () => parseAvailabilityStatus(myMentorProfile.availability_status),
    [myMentorProfile.availability_status],
  );

  const updateMentorAvailability = (field: keyof typeof mentorAvailability, value: string) => {
    const next = { ...mentorAvailability, [field]: value };
    setMyMentorProfile((prev) => ({
      ...prev,
      availability_status: buildAvailabilityStatus(next.day, next.startTime, next.endTime),
    }));
  };

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    const first = (firstName || '').trim();
    const last = (lastName || '').trim();
    if (!first && !last) return 'G';
    return `${first.charAt(0)}${last.charAt(0) || first.charAt(1) || ''}`.toUpperCase();
  };

  const formatAvailability = (value?: string | null) => {
    const availability = (value || '').trim();
    if (!availability) return defaultAvailability;
    if (availability === 'available') return defaultAvailability;
    if (availability === 'busy') return 'Busy';
    if (availability === 'unavailable') return 'Unavailable';
    return availability;
  };

  const formatStatus = (status: MentorshipRequest['status']) =>
    status.charAt(0).toUpperCase() + status.slice(1);

  const formatApprovalStatus = (status?: ApprovalStatus | null) => {
    if (!status) return 'Not submitted';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const approvalStatusClass = (status?: ApprovalStatus | null) => {
    if (status === 'approved') return 'border-green-200 bg-green-50 text-green-700';
    if (status === 'declined') return 'border-red-200 bg-red-50 text-red-700';
    if (status === 'pending') return 'border-amber-200 bg-amber-50 text-amber-700';
    return 'border-gray-200 bg-gray-50 text-gray-600';
  };

  const approvalStatusMessage = (status?: ApprovalStatus | null, feature = 'item') => {
    if (status === 'approved') return `This ${feature} is approved and visible when active.`;
    if (status === 'declined') return `This ${feature} was declined. Update it and submit again for review.`;
    if (status === 'pending') return `This ${feature} is pending dean approval and is not visible yet.`;
    return `This ${feature} has not been submitted for approval yet.`;
  };

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

  const selectTab = (tab: PortalTab) => {
    setActiveTab(tab);
    setSearchParams(tab === 'mentors' ? {} : { tab });
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

  const fetchAll = useCallback(async (silent = false) => {
    if (fetchInFlightRef.current) {
      return fetchInFlightRef.current;
    }

    const run = (async () => {
      if (!silent) {
        setLoading(true);
      }

      try {
        const [ratingRes, mentorList, jobsList, reqOutResult, reqInResult, myMentorResult, mineJobsResult] = await Promise.allSettled([
          authenticatedFetch(API_ENDPOINTS.ALUMNI_RATING.SUMMARY),
          authenticatedFetch(`${API_ENDPOINTS.MENTORSHIP.MENTORS}?search=${encodeURIComponent(mentorSearch)}`),
          authenticatedFetch(`${API_ENDPOINTS.JOBS.POSTS}?search=${encodeURIComponent(jobSearch)}`),
          authenticatedFetch(`${API_ENDPOINTS.MENTORSHIP.REQUESTS}?type=outgoing`),
          authenticatedFetch(`${API_ENDPOINTS.MENTORSHIP.REQUESTS}?type=incoming`),
          authenticatedFetch(`${API_ENDPOINTS.MENTORSHIP.MENTORS}?mine=1`),
          authenticatedFetch(`${API_ENDPOINTS.JOBS.POSTS}?mine=1&include_inactive=1`),
        ]);

        if (mentorList.status === 'fulfilled') {
          setMentors(mentorList.value.data || []);
        }
        if (jobsList.status === 'fulfilled') {
          setJobs(jobsList.value.data || []);
        }
        if (ratingRes.status === 'fulfilled') {
          setRatingSummary(ratingRes.value?.data?.rating || null);
        }
        if (reqOutResult.status === 'fulfilled') {
          setOutgoingRequests(reqOutResult.value.data || []);
        }
        if (reqInResult.status === 'fulfilled') {
          const incoming = reqInResult.value.data || [];
          setIncomingRequests(incoming);
          setScheduleDrafts((prev) => {
            const next = { ...prev };
            incoming.forEach((req: MentorshipRequest) => {
              if (!next[req.id]) {
                const defaultTimeFromAvailability = extractAvailabilityTimeRange(req.availability_status);
                next[req.id] = {
                  session_date: req.session_date || '',
                  session_time: req.session_time || defaultTimeFromAvailability,
                  session_type: req.session_type || 'Google Meet',
                  meeting_link: req.meeting_link || '',
                  meeting_location: req.meeting_location || '',
                  session_notes: req.session_notes || '',
                };
              }
            });
            return next;
          });
        }
        if (mineJobsResult.status === 'fulfilled') {
          setMyPostedJobs(mineJobsResult.value.data || []);
        }
        if (myMentorResult.status === 'fulfilled') {
          const myMentorData = myMentorResult.value.data;
          if (myMentorData) {
            setHasMentorProfile(true);
            setShowMentorProfileForm(true);
            setMyMentorApprovalStatus(myMentorData.approval_status || 'pending');
            setMyMentorApprovalNotes(myMentorData.approval_notes || '');
            setMyMentorProfile({
              contact_email: myMentorData.contact_email || user?.email || '',
              current_job_title: myMentorData.current_job_title || '',
              company: myMentorData.company || '',
              industry: myMentorData.industry || '',
              skills: myMentorData.skills || '',
              bio: myMentorData.bio || '',
              preferred_topics: myMentorData.preferred_topics || '',
              availability_status: formatAvailability(myMentorData.availability_status),
              max_members: String(Math.max(1, Number(myMentorData.max_members || 1))),
              post_status: (myMentorData.post_status || 'open') === 'closed' ? 'closed' : 'open',
              is_active: !!myMentorData.is_active,
            });
          } else {
            setHasMentorProfile(false);
            setMyMentorApprovalStatus(null);
            setMyMentorApprovalNotes('');
            setShowMentorProfileForm(false);
            setMyMentorProfile({ ...defaultMentorProfile, contact_email: user?.email || '' });
          }
        }

        const errors: string[] = [];
        if (ratingRes.status === 'rejected') errors.push('rating');
        if (mentorList.status === 'rejected') errors.push('mentors');
        if (jobsList.status === 'rejected') errors.push('jobs');
        if (reqOutResult.status === 'rejected') errors.push('outgoing requests');
        if (reqInResult.status === 'rejected') errors.push('incoming requests');
        if (myMentorResult.status === 'rejected') errors.push('mentor profile');
        if (mineJobsResult.status === 'rejected') errors.push('posted jobs');

        if (errors.length > 0 && !silent) {
          notify('warning', `Some data could not be loaded: ${errors.join(', ')}.`);
        }
      } catch (error) {
        notify('error', error instanceof Error ? error.message : 'Failed to load portal data', 'Load Error');
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    })();

    fetchInFlightRef.current = run;
    try {
      await run;
    } finally {
      fetchInFlightRef.current = null;
    }
  }, [jobSearch, mentorSearch, user?.email]);

  useEffect(() => {
    fetchAllRef.current = fetchAll;
  }, [fetchAll]);

  const fetchProgramOptions = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.SURVEY_PROGRAMS);
      const data = await response.json();
      if (!response.ok || data?.success === false) {
        throw new Error(data?.error || 'Failed to load programs');
      }
      setProgramOptions(Array.isArray(data?.data) ? data.data : []);
    } catch {
      setProgramOptions([]);
    }
  };

  useEffect(() => {
    fetchAll();
    fetchProgramOptions();
  }, []);

  useEffect(() => {
    const onLiveNotificationUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ audience?: string }>;
      if (customEvent?.detail?.audience && customEvent.detail.audience !== 'graduate') {
        return;
      }

      const now = Date.now();
      if (now - liveRefreshCooldownRef.current < 1200) {
        return;
      }

      liveRefreshCooldownRef.current = now;
      void fetchAllRef.current(true);
    };

    window.addEventListener('gradtrack:notifications-updated', onLiveNotificationUpdate as EventListener);
    return () => window.removeEventListener('gradtrack:notifications-updated', onLiveNotificationUpdate as EventListener);
  }, []);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && portalTabKeys.includes(tabParam as PortalTab)) {
      setActiveTab(tabParam as PortalTab);
    }
  }, [searchParams]);

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
    setMyMentorProfile((prev) => ({
      ...prev,
      contact_email: prev.contact_email || user?.email || '',
    }));
  }, [user?.email]);

  useEffect(() => {
    setMyJobForm((prev) => ({
      ...prev,
      contact_email: prev.contact_email || user?.email || '',
      course_program_fit: prev.course_program_fit || user?.program_code || user?.program_name || '',
    }));
  }, [user?.email, user?.program_code, user?.program_name]);

  useEffect(() => {
    setRequestForm((prev) => ({
      ...prev,
      mentee_name: prev.mentor_id ? prev.mentee_name : user?.full_name || '',
      mentee_email: prev.mentor_id ? prev.mentee_email : user?.email || '',
      mentee_program: prev.mentor_id ? prev.mentee_program : user?.program_code || user?.program_name || '',
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
  const canRequestMentorship = !!ratingSummary?.permissions?.can_request_mentorship;
  const canRegisterMentor = !!ratingSummary?.permissions?.can_register_mentor;

  const getDefaultJobForm = (): JobForm => ({
    ...defaultJobForm,
    contact_email: user?.email || '',
    course_program_fit: user?.program_code || user?.program_name || '',
  });

  const openCreateJobForm = () => {
    setMyJobForm(getDefaultJobForm());
    setShowJobPostForm(true);
  };

  const closeJobPostForm = () => {
    setMyJobForm(getDefaultJobForm());
    setShowJobPostForm(false);
  };

  const normalizeProgramKey = (programCode?: string | null, programName?: string | null) => {
    const code = (programCode || '').trim();
    if (code) return code.toUpperCase();
    const name = (programName || '').trim();
    return name;
  };

  const normalizeProgramText = (value?: string | null) => (value || '').trim().toUpperCase();

  const formatEmploymentType = (value?: string | null) =>
    (value || 'full_time')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());

  const normalizeApplicationLink = (value?: string | null) => {
    const link = (value || '').trim();
    if (!link) return '';
    return /^https?:\/\//i.test(link) ? link : `https://${link}`;
  };

  const renderMeetingLinkOrLocation = (meetingLink?: string | null, meetingLocation?: string | null) => {
    const rawLink = (meetingLink || '').trim();
    if (rawLink) {
      const href = normalizeApplicationLink(rawLink);
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-blue-700 hover:underline break-all"
        >
          {rawLink}
        </a>
      );
    }

    const location = (meetingLocation || '').trim();
    return location || 'N/A';
  };

  const jobMatchesProgramTab = (job: JobPost, tabKey: string) => {
    const selected = normalizeProgramText(tabKey);
    if (!selected || selected === 'ALL') return true;

    const fit = normalizeProgramText(job.course_program_fit);
    const posterProgram = normalizeProgramText(normalizeProgramKey(job.poster_program_code, job.poster_program_name));

    return posterProgram === selected || fit.includes(selected);
  };

  const mentorProgramTabs = useMemo(() => {
    const tabMap = new Map<string, string>();

    programOptions.forEach((program) => {
      const key = normalizeProgramKey(program.code, program.name);
      if (!key) return;
      tabMap.set(key, (program.code || program.name).trim());
    });

    mentors.forEach((mentor) => {
      const key = normalizeProgramKey(mentor.program_code, mentor.program_name);
      if (!key || tabMap.has(key)) return;
      tabMap.set(key, (mentor.program_code || mentor.program_name || key).trim());
    });

    return [{ key: 'all', label: 'All' }, ...Array.from(tabMap.entries()).map(([key, label]) => ({ key, label }))];
  }, [mentors, programOptions]);

  const mentorIndustryOptions = useMemo(() => {
    const values = mentors
      .map((mentor) => (mentor.industry || '').trim())
      .filter(Boolean);
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }, [mentors]);

  const mentorYearOptions = useMemo(() => {
    const values = mentors
      .map((mentor) => mentor.year_graduated)
      .filter((year): year is number => year !== null && year !== undefined);
    return Array.from(new Set(values)).sort((a, b) => b - a);
  }, [mentors]);

  const jobProgramTabs = useMemo(() => {
    const tabMap = new Map<string, string>();

    programOptions.forEach((program) => {
      const key = normalizeProgramKey(program.code, program.name);
      if (!key) return;
      tabMap.set(key, (program.code || program.name).trim());
    });

    jobs.forEach((job) => {
      const key = normalizeProgramKey(job.poster_program_code, job.poster_program_name);
      if (!key || tabMap.has(key)) return;
      tabMap.set(key, (job.poster_program_code || job.poster_program_name || key).trim());
    });

    return [{ key: 'all', label: 'All' }, ...Array.from(tabMap.entries()).map(([key, label]) => ({ key, label }))];
  }, [jobs, programOptions]);

  useEffect(() => {
    if (!mentorProgramTabs.some((tab) => tab.key === mentorProgramTab)) {
      setMentorProgramTab('all');
    }
  }, [mentorProgramTab, mentorProgramTabs]);

  useEffect(() => {
    if (!jobProgramTabs.some((tab) => tab.key === jobProgramTab)) {
      setJobProgramTab('all');
    }
  }, [jobProgramTab, jobProgramTabs]);

  const filteredMentors = useMemo(() => {
    const q = mentorSearch.toLowerCase();
    const industry = mentorIndustryFilter.toLowerCase();
    const skills = mentorSkillsFilter.toLowerCase();
    const year = mentorYearFilter.trim();

    return mentors.filter((m) => {
      if (mentorProgramTab !== 'all') {
        const mentorProgramKey = normalizeProgramKey(m.program_code, m.program_name);
        if (mentorProgramKey !== mentorProgramTab) {
          return false;
        }
      }

      if (industry && !(m.industry || '').toLowerCase().includes(industry)) {
        return false;
      }

      if (skills && !(m.skills || '').toLowerCase().includes(skills)) {
        return false;
      }

      if (year && String(m.year_graduated || '') !== year) {
        return false;
      }

      if (!q.trim()) return true;

      return [
        `${m.first_name} ${m.last_name}`,
        m.program_name || '',
        m.program_code || '',
        m.industry || '',
        m.skills || '',
        m.current_job_title || '',
        m.preferred_topics || '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [
    mentorSearch,
    mentorProgramTab,
    mentorIndustryFilter,
    mentorSkillsFilter,
    mentorYearFilter,
    mentors,
  ]);

  const filteredJobs = useMemo(() => {
    const q = jobSearch.toLowerCase();
    return jobs.filter((j) => {
      if (!jobMatchesProgramTab(j, jobProgramTab)) {
        return false;
      }

      if (!q.trim()) return true;

      return [
        j.title,
        j.company,
        j.location || '',
        j.job_type,
        j.industry || '',
        j.description || '',
        j.salary_range || '',
        j.required_skills || '',
        j.course_program_fit || '',
        j.contact_email || '',
        j.application_link || '',
        j.application_method || '',
        j.poster_program_name || '',
        j.poster_program_code || '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [jobSearch, jobProgramTab, jobs, jobMatchesProgramTab]);

  const appliedMentorIds = useMemo(() => {
    const activeStatuses: MentorshipRequest['status'][] = ['pending', 'accepted'];
    return new Set(
      outgoingRequests
        .filter((request) => activeStatuses.includes(request.status))
        .map((request) => request.mentor_id),
    );
  }, [outgoingRequests]);

  const pendingIncomingRequests = useMemo(
    () => incomingRequests.filter((request) => request.status === 'pending'),
    [incomingRequests],
  );

  const nonPendingIncomingRequests = useMemo(
    () => incomingRequests.filter((request) => request.status !== 'pending'),
    [incomingRequests],
  );

  const acceptedIncomingRequests = useMemo(
    () => incomingRequests.filter((request) => request.status === 'accepted'),
    [incomingRequests],
  );

  const finalizedIncomingRequests = useMemo(
    () => nonPendingIncomingRequests.filter((request) => request.status !== 'accepted'),
    [nonPendingIncomingRequests],
  );

  const groupedPendingScheduleDraft = useMemo(() => {
    const firstPendingId = pendingIncomingRequests[0]?.id;
    if (!firstPendingId) {
      return defaultScheduleForm;
    }
    return scheduleDrafts[firstPendingId] || defaultScheduleForm;
  }, [pendingIncomingRequests, scheduleDrafts]);

  const updateGroupedPendingSchedule = (field: keyof SessionScheduleForm, value: string) => {
    setScheduleDrafts((prev) => {
      const next = { ...prev };
      pendingIncomingRequests.forEach((request) => {
        next[request.id] = {
          ...(next[request.id] || defaultScheduleForm),
          [field]: value,
        };
      });
      return next;
    });
  };

  const openMentorshipRequestForm = (mentor: Mentor) => {
    if (!canRequestMentorship) {
      notify('warning', 'Mentorship request is locked. Requests are allowed if you are not employed, or if your current work is not aligned with your course.');
      return;
    }

    if (appliedMentorIds.has(mentor.id)) {
      notify('info', 'You already applied for mentorship with this mentor.');
      return;
    }

    const mentorPostStatus = (mentor.post_status || 'open').toLowerCase();
    if (mentorPostStatus !== 'open') {
      notify('warning', 'This mentor post is currently closed and not accepting requests.');
      return;
    }

    const maxMembers = Math.max(1, Number(mentor.max_members || 1));
    const activeMentees = Number(mentor.active_mentees_count || 0);
    if (activeMentees >= maxMembers) {
      notify('warning', 'This mentor group is full at the moment. Please choose another mentor.');
      return;
    }

    setRequestForm({
      ...defaultMentorshipRequestForm,
      mentor_id: mentor.id,
      mentor_name: `${mentor.first_name} ${mentor.last_name}`,
      mentee_name: user?.full_name || '',
      mentee_email: user?.email || '',
      mentee_program: user?.program_code || user?.program_name || '',
      request_message: `Hi ${mentor.first_name}, I would like to request mentorship guidance.`,
    });
  };

  const closeMentorshipRequestForm = () => setRequestForm(defaultMentorshipRequestForm);

  const submitMentorshipRequest = async (e: FormEvent) => {
    e.preventDefault();

    if (!requestForm.mentor_id) {
      notify('warning', 'Please choose a mentor before sending a request.');
      return;
    }

    try {
      await authenticatedFetch(API_ENDPOINTS.MENTORSHIP.REQUESTS, {
        method: 'POST',
        body: JSON.stringify({
          mentor_id: requestForm.mentor_id,
          mentee_name: requestForm.mentee_name,
          mentee_email: requestForm.mentee_email,
          mentee_program: requestForm.mentee_program,
          reason_for_request: requestForm.reason_for_request,
          request_message: requestForm.request_message,
        }),
      });
      notify('success', 'Mentorship request sent successfully.');
      closeMentorshipRequestForm();
      await fetchAll();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to send request');
    }
  };

  const updateMentorshipStatus = async (id: number, status: string, extraPayload: Record<string, unknown> = {}) => {
    if (!canUseMentorship) {
      notify('warning', 'Mentorship access is currently locked due to unmet eligibility rules.');
      return;
    }

    try {
      const response = await authenticatedFetch(API_ENDPOINTS.MENTORSHIP.REQUESTS, {
        method: 'PUT',
        body: JSON.stringify({ id, status, ...extraPayload }),
      });
      const updatedCount = Number(response?.updated_requests_count || 1);
      if (status === 'accepted') {
        notify('success', `Session schedule applied to ${updatedCount} mentee request${updatedCount === 1 ? '' : 's'}.`);
      } else if (status === 'completed') {
        notify('success', `Marked ${updatedCount} mentorship request${updatedCount === 1 ? '' : 's'} as completed.`);
      } else {
        notify('success', `Request marked as ${status}.`);
      }
      const sessionEmail = response?.mentee_session_email_notification;
      if (status === 'accepted' && sessionEmail) {
        const sentCount = Number(sessionEmail.sent_count || 0);
        const targetCount = Number(sessionEmail.target_count || 0);
        if (targetCount > 0 && sentCount < targetCount) {
          notify('warning', `Session notification emails sent to ${sentCount} of ${targetCount} mentees.`);
        }
      }
      await fetchAll();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to update request');
    }
  };

  const openMenteeFeedbackForm = (request: MentorshipRequest) => {
    if (request.status !== 'completed') {
      notify('warning', 'Feedback is available after the mentorship request is completed.');
      return;
    }

    setMenteeFeedbackForm({
      request_id: request.id,
      mentor_name: `${request.mentor_first_name || ''} ${request.mentor_last_name || ''}`.trim() || 'Mentor',
      mentor_helpful: request.mentee_found_helpful ?? true,
      rating: request.mentee_feedback_rating ? String(request.mentee_feedback_rating) : '5',
      feedback_text: request.mentee_feedback_text || '',
    });
  };

  const closeMenteeFeedbackForm = () => setMenteeFeedbackForm(defaultMenteeFeedbackForm);

  const submitMenteeFeedback = async (e: FormEvent) => {
    e.preventDefault();

    if (!menteeFeedbackForm.request_id) {
      notify('warning', 'Please choose a completed mentoring session first.');
      return;
    }

    const rating = Number(menteeFeedbackForm.rating || '0');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      notify('warning', 'Please provide a rating from 1 to 5.');
      return;
    }

    try {
      await authenticatedFetch(API_ENDPOINTS.MENTORSHIP.FEEDBACK, {
        method: 'POST',
        body: JSON.stringify({
          mentorship_request_id: menteeFeedbackForm.request_id,
          feedback_role: 'mentee',
          rating,
          mentor_helpful: menteeFeedbackForm.mentor_helpful,
          feedback_text: menteeFeedbackForm.feedback_text,
        }),
      });
      notify('success', 'Feedback submitted.');
      closeMenteeFeedbackForm();
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

    const mentorEmail = myMentorProfile.contact_email.trim();
    if (!mentorEmail) {
      notify('warning', 'Please provide your mentor contact email before saving.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mentorEmail)) {
      notify('warning', 'Please enter a valid email address for mentor contact.');
      return;
    }

    const maxMembers = Number(myMentorProfile.max_members || '0');
    if (!Number.isInteger(maxMembers) || maxMembers < 1 || maxMembers > 100) {
      notify('warning', 'Maximum members must be a whole number between 1 and 100.');
      return;
    }

    try {
      const currentEmail = (user?.email || '').trim().toLowerCase();
      if (mentorEmail.toLowerCase() !== currentEmail || profileImageFile) {
        const profileData = new FormData();
        profileData.append('first_name', profileForm.first_name.trim() || user?.first_name || '');
        profileData.append('middle_name', profileForm.middle_name.trim() || user?.middle_name || '');
        profileData.append('last_name', profileForm.last_name.trim() || user?.last_name || '');
        profileData.append('email', mentorEmail);
        profileData.append('phone', profileForm.phone.trim());
        profileData.append('address', profileForm.address.trim());
        if (profileImageFile) {
          profileData.append('profile_image', profileImageFile);
        }
        await authenticatedFetch(API_ENDPOINTS.GRADUATE_PROFILE, {
          method: 'POST',
          body: profileData,
        });
        await checkAuth();
        setProfileForm((prev) => ({ ...prev, email: mentorEmail }));
        setProfileImageFile(null);
      }

      const mentorPayload = {
        current_job_title: myMentorProfile.current_job_title,
        company: myMentorProfile.company,
        industry: myMentorProfile.industry,
        skills: myMentorProfile.skills,
        bio: myMentorProfile.bio,
        preferred_topics: myMentorProfile.preferred_topics,
        availability_status: myMentorProfile.availability_status,
        max_members: maxMembers,
        post_status: myMentorProfile.post_status,
        is_active: true,
      };
      await authenticatedFetch(API_ENDPOINTS.MENTORSHIP.MENTORS, {
        method: 'POST',
        body: JSON.stringify(mentorPayload),
      });
      setHasMentorProfile(true);
      setMyMentorApprovalStatus('pending');
      setMyMentorApprovalNotes('');
      setShowMentorProfileForm(true);
      notify('success', 'Mentor profile submitted for dean approval. It will appear in Find Mentors after approval.', 'Mentorship');
      await fetchAll();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to save mentor profile');
    }
  };

  const handleDeleteMentorProfile = async () => {
    if (!hasMentorProfile) {
      return;
    }

    const confirmed = window.confirm('Delete your mentor profile? This will remove it from Find Mentors and mentorship requests.');
    if (!confirmed) {
      return;
    }

    try {
      await authenticatedFetch(API_ENDPOINTS.MENTORSHIP.MENTORS, {
        method: 'DELETE',
      });

      setHasMentorProfile(false);
      setShowMentorProfileForm(false);
      setMyMentorApprovalStatus(null);
      setMyMentorApprovalNotes('');
      setMyMentorProfile({ ...defaultMentorProfile, contact_email: user?.email || '' });

      notify('success', 'Mentor profile deleted successfully.');
      await fetchAll(true);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to delete mentor profile');
    }
  };

  const handleJobSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!canPostJobs) {
      notify('warning', 'Job posting is locked until your employment status is set to employed.');
      return;
    }

    const contactEmail = myJobForm.contact_email.trim();
    const applicationLink = myJobForm.application_link.trim();
    const contactDetails = myJobForm.application_method.trim();

    if (!contactEmail && !applicationLink && !contactDetails) {
      notify('warning', 'Add a contact email, application link, or other contact details so applicants know how to apply.');
      return;
    }

    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      notify('warning', 'Please enter a valid contact email.');
      return;
    }

    const formData = new FormData();
    formData.append('title', myJobForm.title.trim());
    formData.append('company', myJobForm.company.trim());
    formData.append('location', myJobForm.location.trim());
    formData.append('job_type', myJobForm.job_type);
    formData.append('industry', myJobForm.industry.trim());
    formData.append('salary_range', myJobForm.salary_range.trim());
    formData.append('description', myJobForm.description.trim());
    formData.append('required_skills', myJobForm.required_skills.trim());
    formData.append('course_program_fit', myJobForm.course_program_fit.trim());
    formData.append('application_deadline', myJobForm.application_deadline || '');
    formData.append('contact_email', contactEmail);
    formData.append('application_link', applicationLink);
    formData.append('application_method', contactDetails);
    formData.append('is_active', myJobForm.is_active ? '1' : '0');

    try {
      if (myJobForm.id) {
        formData.append('id', String(myJobForm.id));
        formData.append('_method', 'PUT');
        await authenticatedFetch(API_ENDPOINTS.JOBS.POSTS, {
          method: 'POST',
          body: formData,
        });
        notify('success', 'Job post submitted for dean approval.');
      } else {
        await authenticatedFetch(API_ENDPOINTS.JOBS.POSTS, {
          method: 'POST',
          body: formData,
        });
        notify('success', 'Job post submitted for dean approval.');
      }

      closeJobPostForm();
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
        salary_range: data.salary_range || '',
        description: data.description || '',
        required_skills: data.required_skills || '',
        course_program_fit: data.course_program_fit || data.poster_program_code || data.poster_program_name || '',
        application_deadline: data.application_deadline || '',
        contact_email: data.contact_email || data.poster_email || user?.email || '',
        application_link: data.application_link || '',
        application_method: data.application_method || '',
        is_active: !!data.is_active,
      });
      setShowJobPostForm(true);
      selectTab('job_posting');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to load job details');
    }
  };

  const handleLogout = () => {
    setProfileMenuOpen(false);
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: 'Logout Confirmation',
      message: 'Are you sure you want to log out?',
      confirmText: 'Logout',
      cancelText: 'Cancel',
      onConfirm: async () => {
        await logout();
        window.location.href = '/graduate/signin';
      },
    });
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
    { key: 'mentors', label: 'Find Mentors', icon: Users },
    { key: 'requests', label: 'Mentorship Requests', icon: ClipboardList },
    { key: 'jobs', label: 'Browse Jobs', icon: Briefcase },
    { key: 'mentor_profile', label: 'Mentor Profile', icon: Users },
    { key: 'job_posting', label: 'Job Posting', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex overflow-x-hidden">
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
              onClick={() => selectTab(item.key)}
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

      <div className={`flex-1 min-w-0 transition-all duration-300 ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-20'}`}>
        <header className="bg-blue-900 text-white shadow sticky top-0 z-30 border-b-4 border-yellow-500">
          <div className="px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen((prev) => !prev)}
                className="hidden lg:inline-flex p-2 rounded-lg bg-white/10 hover:bg-white/20"
                aria-label="Toggle sidebar"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-lg font-bold sm:text-2xl">Graduate Ecosystem Portal</h1>
                <p className="text-blue-100 text-xs sm:text-sm">
                  Welcome, {user?.full_name}. Explore mentorship and career opportunities.
                </p>
              </div>
            </div>

            <div className="flex w-full items-center justify-end gap-3 sm:w-auto">
              <NotificationBell audience="graduate" colorScheme="dark" />

              <div className="relative min-w-0 flex-1 sm:w-auto sm:flex-none" ref={profileMenuRef}>
                <button
                  onClick={() => setProfileMenuOpen((prev) => !prev)}
                  className="flex w-full min-w-0 items-center gap-3 bg-white/10 hover:bg-white/20 rounded-full px-3 py-1.5 sm:min-w-[260px]"
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
                  <div className="absolute right-0 mt-2 w-full bg-white rounded-2xl shadow-xl overflow-hidden z-50 text-gray-800 border border-gray-200 sm:w-[320px]">
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
                        selectTab('my_profile');
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
          </div>
        </header>

        <main className="p-3 sm:p-6">
          <div className="bg-white rounded-xl border border-gray-200 p-2 mb-5 flex gap-2 overflow-x-auto lg:hidden">
            {navItems.map((tab) => (
              <button
                key={tab.key}
                onClick={() => selectTab(tab.key)}
                className={`shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition ${
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
                  <div className="bg-white rounded-xl border border-gray-200 p-4 text-gray-600 sm:p-6">
                    Dashboard data is not available yet. Try refreshing the page.
                  </div>
                ) : (
                  <>
                    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-sm text-gray-500">Graduate Access Overview</p>
                          <div className="flex items-baseline gap-2 mt-1">
                            <h2 className="text-2xl font-extrabold text-blue-900">Employment-Based Access</h2>
                            <span className="text-sm text-gray-500">live eligibility status</span>
                          </div>
                        </div>
                        <div className="grid w-full gap-2 text-sm sm:min-w-[280px] sm:grid-cols-2">
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
                <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-bold text-blue-900">Find Mentors</h2>
                      <p className="text-sm text-gray-600">
                        Search by course, industry, skills, and batch.
                      </p>
                    </div>
                    <p className="text-sm text-gray-500">
                      {filteredMentors.length} mentor{filteredMentors.length === 1 ? '' : 's'} found
                    </p>
                  </div>

                  {!canRequestMentorship && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      Mentorship requests are available if you are not employed, or if your current work is not aligned with your course.
                    </div>
                  )}

                  <input
                    value={mentorSearch}
                    onChange={(e) => setMentorSearch(e.target.value)}
                    placeholder="Search mentors by name, course, IT, interview preparation, career shifting, or skills"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg"
                  />

                  <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Course</label>
                      <select
                        value={mentorProgramTab}
                        onChange={(e) => setMentorProgramTab(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        {mentorProgramTabs.map((tab) => (
                          <option key={tab.key} value={tab.key}>{tab.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Industry</label>
                      <select
                        value={mentorIndustryFilter}
                        onChange={(e) => setMentorIndustryFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value="">All industries</option>
                        {mentorIndustryOptions.map((industry) => (
                          <option key={industry} value={industry}>{industry}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Skills</label>
                      <input
                        value={mentorSkillsFilter}
                        onChange={(e) => setMentorSkillsFilter(e.target.value)}
                        placeholder="React, SQL, HR"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Batch</label>
                      <select
                        value={mentorYearFilter}
                        onChange={(e) => setMentorYearFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value="">All years</option>
                        {mentorYearOptions.map((year) => (
                          <option key={year} value={year}>Batch: {year}</option>
                        ))}
                      </select>
                    </div>

                  </div>
                </div>

                {filteredMentors.length === 0 ? (
                  <div className="bg-white rounded-xl border border-gray-200 p-4 text-center text-gray-500 sm:p-6">
                    No mentors found for this program filter yet.
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    {filteredMentors.map((mentor) => (
                      <div key={mentor.id} className="bg-white rounded-xl border border-gray-200 p-5">
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex items-start gap-3 min-w-0">
                            {mentor.profile_image_path ? (
                              <img
                                src={resolveProfileImageUrl(mentor.profile_image_path)}
                                alt={`${mentor.first_name} ${mentor.last_name}`}
                                className="w-14 h-14 rounded-full object-cover border border-gray-200"
                              />
                            ) : (
                              <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-900 flex items-center justify-center font-bold">
                                {getInitials(mentor.first_name, mentor.last_name)}
                              </div>
                            )}
                            <div className="min-w-0">
                            <h3 className="text-lg font-bold text-blue-900">
                              {mentor.first_name} {mentor.last_name}
                            </h3>
                            <p className="text-sm text-gray-600">
                              {mentor.current_job_title || 'Professional'} {mentor.company ? `at ${mentor.company}` : ''}
                            </p>
                            <p className="text-xs text-gray-500">
                              Batch: {mentor.year_graduated || 'N/A'}
                            </p>
                            </div>
                          </div>
                          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                            {formatAvailability(mentor.availability_status)}
                          </span>
                        </div>
                        <div className="mt-3 space-y-1 text-sm text-gray-700">
                          <p><span className="font-semibold">Program:</span> {mentor.program_name || mentor.program_code || 'N/A'}</p>
                          <p><span className="font-semibold">Industry:</span> {mentor.industry || 'N/A'}</p>
                          <p><span className="font-semibold">Skills:</span> {mentor.skills || 'N/A'}</p>
                          <p><span className="font-semibold">Topics:</span> {mentor.preferred_topics || 'N/A'}</p>
                          <p><span className="font-semibold">Mentorship Type:</span> Group mentoring</p>
                          <p>
                            <span className="font-semibold">Group Slots:</span>{' '}
                            {Math.max(0, Math.max(1, Number(mentor.max_members || 1)) - Number(mentor.active_mentees_count || 0))} left of {Math.max(1, Number(mentor.max_members || 1))}
                          </p>
                          <p>
                            <span className="font-semibold">Post Status:</span>{' '}
                            <span
                              className={(mentor.post_status || 'open') === 'open' ? 'text-green-700 font-semibold' : 'text-red-700 font-semibold'}
                            >
                              {(mentor.post_status || 'open') === 'open' ? 'Open' : 'Closed'}
                            </span>
                          </p>
                          <p><span className="font-semibold">Rating:</span> {mentor.avg_rating} ({mentor.feedback_count} feedback)</p>
                          <p className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-blue-600" />
                            <span>{mentor.contact_email || 'Use mentorship request to connect'}</span>
                          </p>
                          {mentor.bio && <p className="text-gray-600 mt-2">{mentor.bio}</p>}
                        </div>
                        <button
                          onClick={() => openMentorshipRequestForm(mentor)}
                          disabled={
                            !canRequestMentorship
                            || appliedMentorIds.has(mentor.id)
                            || (mentor.post_status || 'open') !== 'open'
                            || Number(mentor.active_mentees_count || 0) >= Math.max(1, Number(mentor.max_members || 1))
                          }
                          className="mt-4 w-full py-2 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {appliedMentorIds.has(mentor.id)
                            ? 'Request Sent'
                            : (mentor.post_status || 'open') !== 'open'
                            ? 'Post Closed'
                            : Number(mentor.active_mentees_count || 0) >= Math.max(1, Number(mentor.max_members || 1))
                              ? 'Group Full'
                              : 'Request Mentorship'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeTab === 'requests' && (
              <section className="grid lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="text-xl font-bold text-blue-900 mb-4">Incoming Requests (as Mentor)</h2>
                  <p className="text-xs text-blue-700 mb-3">Group mentoring mode: accepting one request applies the same schedule to all pending mentees and notifies them.</p>
                  <div className="space-y-3">
                    {incomingRequests.length === 0 && <p className="text-gray-500">No incoming mentorship requests.</p>}

                    {pendingIncomingRequests.length > 0 && (
                      <div className="border border-blue-200 rounded-lg p-3 bg-blue-50/30">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-gray-800">Pending Group Requests ({pendingIncomingRequests.length})</p>
                            <p className="text-xs text-gray-500">Set one schedule and apply to all pending mentees.</p>
                          </div>
                          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">Pending</span>
                        </div>

                        <div className="mt-3 space-y-2">
                          {pendingIncomingRequests.map((req) => (
                            <div key={`pending-${req.id}`} className="rounded border border-gray-200 bg-white p-2">
                              <p className="font-semibold text-sm text-gray-800">{req.mentee_name || `${req.mentee_first_name || ''} ${req.mentee_last_name || ''}`}</p>
                              <p className="text-xs text-gray-500">{req.mentee_email || 'No email'} | {req.mentee_program || 'No program'}</p>
                              <p className="text-xs text-gray-700 mt-1"><span className="font-semibold">Reason:</span> {req.reason_for_request || 'N/A'}</p>
                              <p className="text-xs text-gray-700"><span className="font-semibold">Message:</span> {req.request_message || 'No message provided.'}</p>
                              <button onClick={() => updateMentorshipStatus(req.id, 'declined')} className="mt-2 px-2 py-1 bg-red-600 text-white rounded text-xs">Decline only this mentee</button>
                            </div>
                          ))}
                        </div>

                        <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3 space-y-3">
                          <p className="text-sm font-semibold text-blue-900">Shared Session Schedule</p>
                          <div className="grid sm:grid-cols-2 gap-2">
                            <input
                              type="date"
                              value={groupedPendingScheduleDraft.session_date}
                              onChange={(e) => updateGroupedPendingSchedule('session_date', e.target.value)}
                              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            />
                            <input
                              value={groupedPendingScheduleDraft.session_time}
                              onChange={(e) => updateGroupedPendingSchedule('session_time', e.target.value)}
                              placeholder="2 PM - 5 PM"
                              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            />
                            <select
                              value={groupedPendingScheduleDraft.session_type}
                              onChange={(e) => updateGroupedPendingSchedule('session_type', e.target.value)}
                              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            >
                              {sessionTypeOptions.map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                            <input
                              value={groupedPendingScheduleDraft.meeting_link}
                              onChange={(e) => updateGroupedPendingSchedule('meeting_link', e.target.value)}
                              placeholder="Meeting link"
                              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            />
                          </div>
                          <input
                            value={groupedPendingScheduleDraft.meeting_location}
                            onChange={(e) => updateGroupedPendingSchedule('meeting_location', e.target.value)}
                            placeholder="Room, campus location, or chat channel"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                          <textarea
                            value={groupedPendingScheduleDraft.session_notes}
                            onChange={(e) => updateGroupedPendingSchedule('session_notes', e.target.value)}
                            placeholder="Notes for the mentees"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            rows={2}
                          />
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            onClick={() => updateMentorshipStatus(pendingIncomingRequests[0].id, 'accepted', { ...groupedPendingScheduleDraft, apply_to_all: true })}
                            disabled={!canUseMentorship || pendingIncomingRequests.length === 0}
                            className="px-3 py-1.5 bg-green-600 text-white rounded text-sm disabled:opacity-60"
                          >
                            Accept All Pending
                          </button>
                        </div>
                      </div>
                    )}

                    {acceptedIncomingRequests.length > 0 && (
                      <div className="border border-green-200 rounded-lg p-3 bg-green-50/30">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-gray-800">Accepted Group Requests ({acceptedIncomingRequests.length})</p>
                            <p className="text-xs text-gray-500">Use one action to complete all accepted mentees in this group.</p>
                          </div>
                          <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">Accepted</span>
                        </div>

                        <div className="mt-3 space-y-2">
                          {acceptedIncomingRequests.map((req) => (
                            <div key={`accepted-${req.id}`} className="rounded border border-gray-200 bg-white p-2">
                              <p className="font-semibold text-sm text-gray-800">{req.mentee_name || `${req.mentee_first_name || ''} ${req.mentee_last_name || ''}`}</p>
                              <p className="text-xs text-gray-500">{req.mentee_email || 'No email'} | {req.mentee_program || 'No program'}</p>
                              <div className="text-xs text-gray-700 mt-1 space-y-1">
                                <p><span className="font-semibold">Session Date:</span> {req.session_date || 'N/A'}</p>
                                <p><span className="font-semibold">Session Time:</span> {req.session_time || 'N/A'}</p>
                                <p><span className="font-semibold">Type:</span> {req.session_type || 'N/A'}</p>
                                <p><span className="font-semibold">Link / Location:</span> {renderMeetingLinkOrLocation(req.meeting_link, req.meeting_location)}</p>
                                <p><span className="font-semibold">Notes:</span> {req.session_notes || 'N/A'}</p>
                              </div>
                              <button onClick={() => updateMentorshipStatus(req.id, 'cancelled')} className="mt-2 px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">Cancel only this mentee</button>
                            </div>
                          ))}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            onClick={() => updateMentorshipStatus(acceptedIncomingRequests[0].id, 'completed', { apply_to_all: true })}
                            disabled={!canUseMentorship || acceptedIncomingRequests.length === 0}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-60"
                          >
                            Complete Group Session
                          </button>
                        </div>
                      </div>
                    )}

                    {finalizedIncomingRequests.map((req) => (
                      <div key={req.id} className="border border-gray-200 rounded-lg p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-gray-800">{req.mentee_name || `${req.mentee_first_name || ''} ${req.mentee_last_name || ''}`}</p>
                            <p className="text-xs text-gray-500">{req.mentee_email || 'No email'} | {req.mentee_program || 'No program'}</p>
                          </div>
                          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                            {formatStatus(req.status)}
                          </span>
                        </div>

                        <div className="mt-3 text-sm text-gray-700 space-y-1">
                          <p><span className="font-semibold">Reason:</span> {req.reason_for_request || 'N/A'}</p>
                          <p><span className="font-semibold">Message:</span> {req.request_message || 'No message provided.'}</p>
                        </div>

                        {req.status !== 'pending' && (
                          <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 space-y-1">
                            <p><span className="font-semibold">Session Date:</span> {req.session_date || 'N/A'}</p>
                            <p><span className="font-semibold">Session Time:</span> {req.session_time || 'N/A'}</p>
                            <p><span className="font-semibold">Type:</span> {req.session_type || 'N/A'}</p>
                            <p><span className="font-semibold">Link / Location:</span> {renderMeetingLinkOrLocation(req.meeting_link, req.meeting_location)}</p>
                            <p><span className="font-semibold">Notes:</span> {req.session_notes || 'N/A'}</p>
                          </div>
                        )}

                        {req.mentee_feedback_rating && (
                          <p className="text-xs text-gray-500 mt-2">
                            Mentee feedback: {req.mentee_feedback_rating}/5 - {req.mentee_feedback_text || 'No comment'}
                          </p>
                        )}
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
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex items-center gap-3">
                            {req.mentor_profile_image_path ? (
                              <img
                                src={resolveProfileImageUrl(req.mentor_profile_image_path)}
                                alt={`${req.mentor_first_name || ''} ${req.mentor_last_name || ''}`}
                                className="w-10 h-10 rounded-full object-cover border border-gray-200"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-900 flex items-center justify-center font-bold text-sm">
                                {getInitials(req.mentor_first_name, req.mentor_last_name)}
                              </div>
                            )}
                            <div>
                              <p className="font-semibold text-gray-800">
                                Mentor: {req.mentor_first_name} {req.mentor_last_name}
                              </p>
                              <p className="text-sm text-gray-600">{req.current_job_title || 'Professional'} {req.company ? `at ${req.company}` : ''}</p>
                            </div>
                          </div>
                          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                            {formatStatus(req.status)}
                          </span>
                        </div>

                        <div className="text-sm text-gray-700 mt-3 space-y-1">
                          <p><span className="font-semibold">Reason:</span> {req.reason_for_request || 'N/A'}</p>
                          <p><span className="font-semibold">Message:</span> {req.request_message || 'No request message.'}</p>
                        </div>

                        {(['accepted', 'completed'] as MentorshipRequest['status'][]).includes(req.status) && (
                          <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 space-y-1">
                            <p><span className="font-semibold">Session Date:</span> {req.session_date || 'N/A'}</p>
                            <p><span className="font-semibold">Session Time:</span> {req.session_time || 'N/A'}</p>
                            <p><span className="font-semibold">Type:</span> {req.session_type || 'N/A'}</p>
                            <p><span className="font-semibold">Link / Location:</span> {renderMeetingLinkOrLocation(req.meeting_link, req.meeting_location)}</p>
                            <p><span className="font-semibold">Notes:</span> {req.session_notes || 'N/A'}</p>
                          </div>
                        )}

                        {req.status === 'completed' && (
                          <button onClick={() => openMenteeFeedbackForm(req)} className="mt-3 px-3 py-1.5 bg-yellow-500 text-blue-900 rounded text-sm font-semibold">
                            {req.mentee_feedback_rating ? 'Update Feedback' : 'Leave Feedback'}
                          </button>
                        )}
                        {req.status === 'pending' && (
                          <button onClick={() => updateMentorshipStatus(req.id, 'cancelled')} className="mt-3 px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-sm">
                            Cancel Request
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
                <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-bold text-blue-900">Browse Jobs</h2>
                      <p className="text-sm text-gray-600">
                        Find posted opportunities and use the listed email, link, or contact details to apply externally.
                      </p>
                    </div>
                    <p className="text-sm text-gray-500">
                      {filteredJobs.length} job{filteredJobs.length === 1 ? '' : 's'} found
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {jobProgramTabs.map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setJobProgramTab(tab.key)}
                        className={`px-3 py-1.5 rounded-full text-sm border transition ${
                          jobProgramTab === tab.key
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white border-gray-300 text-gray-700 hover:border-blue-300 hover:text-blue-700'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <input
                    value={jobSearch}
                    onChange={(e) => setJobSearch(e.target.value)}
                    placeholder="Search jobs by title, company, skills, program fit, salary, or location"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg"
                  />
                </div>

                {filteredJobs.length === 0 ? (
                  <div className="bg-white rounded-xl border border-gray-200 p-4 text-center text-gray-500 sm:p-6">
                    No jobs found for this program filter yet.
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    {filteredJobs.map((job) => {
                      const applicationLink = normalizeApplicationLink(job.application_link);
                      const contactEmail = (job.contact_email || '').trim();
                      const mailSubject = encodeURIComponent(`Application for ${job.title} at ${job.company}`);

                      return (
                        <div key={job.id} className="bg-white rounded-xl border border-gray-200 p-5">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="text-lg font-bold text-blue-900">{job.title}</h3>
                              <p className="text-sm text-gray-600">{job.company}</p>
                            </div>
                            <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                              {formatEmploymentType(job.job_type)}
                            </span>
                          </div>
                          <p className="mt-3 text-sm text-gray-700 whitespace-pre-line">
                            {job.description || 'No job description posted yet.'}
                          </p>
                          <div className="mt-3 text-sm text-gray-700 space-y-1">
                            <p><span className="font-semibold">Location:</span> {job.location || 'N/A'}</p>
                            <p><span className="font-semibold">Salary Range:</span> {job.salary_range || 'Not specified'}</p>
                            <p><span className="font-semibold">Course / Program Fit:</span> {job.course_program_fit || job.poster_program_code || job.poster_program_name || 'Open to eligible graduates'}</p>
                            <p><span className="font-semibold">Required Skills:</span> {job.required_skills || 'Not specified'}</p>
                            <p><span className="font-semibold">Deadline:</span> {job.application_deadline || 'Open until filled'}</p>
                          </div>

                          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-sm text-gray-700 space-y-2">
                            <p className="font-semibold text-blue-900">How to apply</p>
                            {contactEmail && (
                              <a
                                href={`mailto:${contactEmail}?subject=${mailSubject}`}
                                className="block text-blue-700 hover:underline"
                              >
                                Email {contactEmail}
                              </a>
                            )}
                            {applicationLink && (
                              <a
                                href={applicationLink}
                                target="_blank"
                                rel="noreferrer"
                                className="block text-blue-700 hover:underline"
                              >
                                Open application link
                              </a>
                            )}
                            {job.application_method && (
                              <p className="whitespace-pre-line">{job.application_method}</p>
                            )}
                            {!contactEmail && !applicationLink && !job.application_method && (
                              <p>No application contact details posted yet.</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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
              <section className="max-w-4xl mx-auto space-y-6">
                {!hasMentorProfile && !showMentorProfileForm && (
                  <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-5 text-center max-w-2xl mx-auto sm:p-8">
                    <h2 className="text-3xl font-bold text-blue-900">Become a Mentor</h2>
                    <p className="text-gray-600 mt-2 max-w-xl mx-auto">
                      Share your experience with fellow graduates. Build your mentor profile and start receiving mentorship requests.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowMentorProfileForm(true)}
                      className="mt-6 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-semibold"
                    >
                      Create Mentor Profile
                    </button>
                  </div>
                )}

                {(hasMentorProfile || showMentorProfileForm) && (
                  <form onSubmit={handleMentorProfileSubmit} className="bg-white rounded-2xl border border-gray-200 p-4 space-y-5 shadow-sm sm:p-6">
                    <div>
                      <h2 className="text-2xl font-bold text-blue-900">
                        {hasMentorProfile ? 'Update Mentor Profile' : 'Create Mentor Profile'}
                      </h2>
                      <p className="text-sm text-gray-600 mt-1">
                        Keep your mentor details up to date. Approved active profiles appear in Find Mentors.
                      </p>
                    </div>

                    {hasMentorProfile && (
                      <div className={`rounded-lg border px-3 py-2 text-sm ${approvalStatusClass(myMentorApprovalStatus)}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold">Approval Status: {formatApprovalStatus(myMentorApprovalStatus)}</span>
                          <span>{approvalStatusMessage(myMentorApprovalStatus, 'mentor profile')}</span>
                        </div>
                        {myMentorApprovalNotes && (
                          <p className="mt-1 whitespace-pre-line text-xs">Review notes: {myMentorApprovalNotes}</p>
                        )}
                      </div>
                    )}

                    {!canRegisterMentor && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        Mentor registration requires: employed status and aligned course match.
                      </div>
                    )}

                    <fieldset disabled={!canRegisterMentor} className="space-y-4">
                      <div className="grid md:grid-cols-[180px_1fr] gap-4 items-start">
                        <div className="rounded-xl border border-gray-200 p-4 text-center">
                          {profileImagePreview ? (
                            <img src={profileImagePreview} alt="Mentor profile" className="w-24 h-24 rounded-full object-cover border border-gray-300 mx-auto" />
                          ) : (
                            <div className="w-24 h-24 rounded-full bg-blue-100 text-blue-900 font-bold text-2xl flex items-center justify-center mx-auto">
                              {userInitials}
                            </div>
                          )}
                          <input
                            ref={mentorImageInputRef}
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
                            onClick={() => mentorImageInputRef.current?.click()}
                            className="w-full mt-3 px-3 py-2 rounded-lg border border-blue-200 text-blue-800 text-sm font-semibold hover:bg-blue-50"
                          >
                            {profileImageFile ? 'Change Photo' : 'Add Profile Picture'}
                          </button>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-3">
                          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                            <p className="text-xs font-semibold text-blue-700">Batch</p>
                            <p className="text-xl font-bold text-blue-900">Batch: {user?.year_graduated || 'N/A'}</p>
                          </div>
                          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                            <p className="text-xs font-semibold text-blue-700">Program</p>
                            <p className="text-xl font-bold text-blue-900">{user?.program_code || user?.program_name || 'N/A'}</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Contact Email</label>
                          <input
                            type="email"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            placeholder="mentor@email.com"
                            value={myMentorProfile.contact_email}
                            onChange={(e) => setMyMentorProfile((prev) => ({ ...prev, contact_email: e.target.value }))}
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Current Job Title</label>
                          <input
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            placeholder="e.g. Software Engineer"
                            value={myMentorProfile.current_job_title}
                            onChange={(e) => setMyMentorProfile((prev) => ({ ...prev, current_job_title: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Company</label>
                          <input
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            placeholder="Company"
                            value={myMentorProfile.company}
                            onChange={(e) => setMyMentorProfile((prev) => ({ ...prev, company: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Industry</label>
                          <input
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            placeholder="Industry"
                            value={myMentorProfile.industry}
                            onChange={(e) => setMyMentorProfile((prev) => ({ ...prev, industry: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Skills / Expertise</label>
                        <textarea
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          rows={2}
                          placeholder="Skills / expertise (comma separated)"
                          value={myMentorProfile.skills}
                          onChange={(e) => setMyMentorProfile((prev) => ({ ...prev, skills: e.target.value }))}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Short Bio</label>
                        <textarea
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          rows={3}
                          placeholder="Tell graduates how you can help"
                          value={myMentorProfile.bio}
                          onChange={(e) => setMyMentorProfile((prev) => ({ ...prev, bio: e.target.value }))}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Preferred Mentoring Topics</label>
                        <textarea
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          rows={2}
                          placeholder="Preferred mentoring topics"
                          value={myMentorProfile.preferred_topics}
                          onChange={(e) => setMyMentorProfile((prev) => ({ ...prev, preferred_topics: e.target.value }))}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Availability</label>
                        <div className="grid sm:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Day</label>
                            <select
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              value={mentorAvailability.day}
                              onChange={(e) => updateMentorAvailability('day', e.target.value)}
                            >
                              {availabilityDayOptions.map((day) => (
                                <option key={day} value={day}>{day}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Start</label>
                            <select
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              value={mentorAvailability.startTime}
                              onChange={(e) => updateMentorAvailability('startTime', e.target.value)}
                            >
                              {availabilityTimeOptions.map((time) => (
                                <option key={time} value={time}>{time}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">End</label>
                            <select
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              value={mentorAvailability.endTime}
                              onChange={(e) => updateMentorAvailability('endTime', e.target.value)}
                            >
                              {availabilityTimeOptions.map((time) => (
                                <option key={time} value={time}>{time}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <p className="mt-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                          {formatAvailability(myMentorProfile.availability_status)}
                        </p>
                      </div>

                      <div className="grid md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Maximum Number of Members</label>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            placeholder="e.g. 10"
                            value={myMentorProfile.max_members}
                            onChange={(e) => setMyMentorProfile((prev) => ({ ...prev, max_members: e.target.value }))}
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Mentorship Post Status</label>
                          <select
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            value={myMentorProfile.post_status}
                            onChange={(e) => setMyMentorProfile((prev) => ({ ...prev, post_status: e.target.value as 'open' | 'closed' }))}
                          >
                            <option value="open">Open (accepting mentee requests)</option>
                            <option value="closed">Closed (not accepting requests)</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-semibold">
                          {hasMentorProfile ? 'Submit Updated Profile for Approval' : 'Submit Mentor Profile for Approval'}
                        </button>
                        {hasMentorProfile && (
                          <button
                            type="button"
                            onClick={handleDeleteMentorProfile}
                            className="w-full border border-red-300 text-red-700 hover:bg-red-50 py-2.5 rounded-lg font-semibold"
                          >
                            Delete Mentor Profile
                          </button>
                        )}
                      </div>
                    </fieldset>
                  </form>
                )}
              </section>
            )}

            {activeTab === 'job_posting' && (
              <section className="space-y-6">
                {!showJobPostForm && (
                  <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm sm:p-6">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div>
                        <h2 className="text-2xl font-bold text-blue-900">Job Posting</h2>
                        <p className="text-sm text-gray-600 mt-1">
                          Share an opening with eligible graduates. Approved active posts appear in Browse Jobs.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={openCreateJobForm}
                        disabled={!canPostJobs}
                        className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        Create Job Post
                      </button>
                    </div>

                    {!canPostJobs && (
                      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        Job posting requires: employed status.
                      </div>
                    )}
                  </div>
                )}

                {showJobPostForm && (
                <form onSubmit={handleJobSubmit} className="bg-white rounded-2xl border border-gray-200 p-4 space-y-5 shadow-sm sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-2xl font-bold text-blue-900">Post / Update Job Opportunity</h2>
                      <p className="text-sm text-gray-600 mt-1">
                        Eligible employed graduates can share openings. New and updated posts are reviewed before they appear in Browse Jobs.
                      </p>
                    </div>
                    <span className="text-xs px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                      Posted by: {user?.program_code || user?.program_name || 'Graduate'}
                    </span>
                  </div>

                  {!canPostJobs && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      Job posting requires: employed status.
                    </div>
                  )}

                  <fieldset disabled={!canPostJobs} className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Job Title</label>
                        <input
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          placeholder="Job title"
                          value={myJobForm.title}
                          onChange={(e) => setMyJobForm((prev) => ({ ...prev, title: e.target.value }))}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Company Name</label>
                        <input
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          placeholder="Company name"
                          value={myJobForm.company}
                          onChange={(e) => setMyJobForm((prev) => ({ ...prev, company: e.target.value }))}
                          required
                        />
                      </div>
                    </div>

                    <div className="grid md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Location</label>
                        <input
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          placeholder="City, province, remote, or hybrid"
                          value={myJobForm.location}
                          onChange={(e) => setMyJobForm((prev) => ({ ...prev, location: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Salary Range</label>
                        <input
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          placeholder="e.g. PHP 25,000 - 35,000"
                          value={myJobForm.salary_range}
                          onChange={(e) => setMyJobForm((prev) => ({ ...prev, salary_range: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Employment Type</label>
                        <select
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          value={myJobForm.job_type}
                          onChange={(e) => setMyJobForm((prev) => ({ ...prev, job_type: e.target.value }))}
                        >
                          <option value="full_time">Full time</option>
                          <option value="part_time">Part time</option>
                          <option value="contract">Contract</option>
                          <option value="internship">Internship</option>
                          <option value="remote">Remote</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
                      <textarea
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        rows={3}
                        placeholder="Description"
                        value={myJobForm.description}
                        onChange={(e) => setMyJobForm((prev) => ({ ...prev, description: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="grid md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Required Skills</label>
                        <textarea
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          rows={2}
                          placeholder="e.g. JavaScript, customer service, data encoding"
                          value={myJobForm.required_skills}
                          onChange={(e) => setMyJobForm((prev) => ({ ...prev, required_skills: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Course / Program Fit</label>
                        <textarea
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          rows={2}
                          placeholder="e.g. BSIT, BSBA, any computer-related course"
                          value={myJobForm.course_program_fit}
                          onChange={(e) => setMyJobForm((prev) => ({ ...prev, course_program_fit: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Application Deadline</label>
                        <input
                          type="date"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          value={myJobForm.application_deadline}
                          onChange={(e) => setMyJobForm((prev) => ({ ...prev, application_deadline: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Contact Email</label>
                        <input
                          type="email"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          placeholder="hr@example.com"
                          value={myJobForm.contact_email}
                          onChange={(e) => setMyJobForm((prev) => ({ ...prev, contact_email: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Application Link</label>
                        <input
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          placeholder="https://company.com/careers/apply"
                          value={myJobForm.application_link}
                          onChange={(e) => setMyJobForm((prev) => ({ ...prev, application_link: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Other Contact Details</label>
                        <input
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          placeholder="Phone number, office contact, or instructions"
                          value={myJobForm.application_method}
                          onChange={(e) => setMyJobForm((prev) => ({ ...prev, application_method: e.target.value }))}
                        />
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={myJobForm.is_active}
                        onChange={(e) => setMyJobForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                      />
                      Job is active after approval
                    </label>

                    <button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white py-2.5 rounded-lg font-semibold">
                      {myJobForm.id ? 'Submit Updated Job for Approval' : 'Submit Job Post for Approval'}
                    </button>

                    {myJobForm.id && (
                      <button
                        type="button"
                        onClick={() => {
                          closeJobPostForm();
                        }}
                        className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg font-medium"
                      >
                        Cancel Editing
                      </button>
                    )}

                    {!myJobForm.id && (
                      <button
                        type="button"
                        onClick={closeJobPostForm}
                        className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg font-medium"
                      >
                        Cancel
                      </button>
                    )}
                  </fieldset>
                </form>
                )}

                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                  <h2 className="text-xl font-bold text-blue-900 mb-4">My Job Posts</h2>
                  <div className="grid md:grid-cols-2 gap-4">
                    {myPostedJobs.length === 0 && (
                      <p className="text-gray-500 text-sm">No job posts yet.</p>
                    )}
                    {myPostedJobs.map((job) => (
                      <div key={job.id} className="border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-gray-800">{job.title}</p>
                            <p className="text-sm text-gray-600">{job.company}</p>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <span className={`text-xs px-2 py-1 rounded-full border ${approvalStatusClass(job.approval_status)}`}>
                              {formatApprovalStatus(job.approval_status)}
                            </span>
                            <button
                              onClick={() => beginEditJob(job.id)}
                              disabled={!canPostJobs}
                              className="text-sm px-3 py-1.5 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              Edit
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">
                          {approvalStatusMessage(job.approval_status, 'job post')}
                        </p>
                        {job.approval_notes && (
                          <p className="text-xs text-red-600 mt-1 whitespace-pre-line">Review notes: {job.approval_notes}</p>
                        )}
                        <p className="text-xs text-gray-500 mt-2">
                          {job.location || 'No location'} | {formatEmploymentType(job.job_type)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Salary: {job.salary_range || 'Not specified'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Program fit: {job.course_program_fit || job.poster_program_code || job.poster_program_name || 'Open to eligible graduates'}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Apply via: {job.application_link || job.contact_email || job.application_method || 'No contact details'}
                        </p>
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

      {requestForm.mentor_id && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={submitMentorshipRequest} className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-blue-900">Request Mentorship</h2>
                <p className="text-sm text-gray-600">Mentor: {requestForm.mentor_name}</p>
              </div>
              <button type="button" onClick={closeMentorshipRequestForm} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Close request form">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Mentee Name</label>
                <input
                  value={requestForm.mentee_name}
                  onChange={(e) => setRequestForm((prev) => ({ ...prev, mentee_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Email</label>
                <input
                  type="email"
                  value={requestForm.mentee_email}
                  onChange={(e) => setRequestForm((prev) => ({ ...prev, mentee_email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Course / Program</label>
              <input
                value={requestForm.mentee_program}
                onChange={(e) => setRequestForm((prev) => ({ ...prev, mentee_program: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Reason for Request</label>
              <textarea
                value={requestForm.reason_for_request}
                onChange={(e) => setRequestForm((prev) => ({ ...prev, reason_for_request: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                rows={3}
                placeholder="Tell the mentor why you need guidance"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Message to Mentor</label>
              <textarea
                value={requestForm.request_message}
                onChange={(e) => setRequestForm((prev) => ({ ...prev, request_message: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                rows={3}
                placeholder="Write a short message"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeMentorshipRequestForm} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold">
                Send Request
              </button>
            </div>
          </form>
        </div>
      )}

      {menteeFeedbackForm.request_id && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form onSubmit={submitMenteeFeedback} className="bg-white rounded-lg shadow-xl w-full max-w-lg p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-blue-900">Mentee Feedback</h2>
                <p className="text-sm text-gray-600">Mentor: {menteeFeedbackForm.mentor_name}</p>
              </div>
              <button type="button" onClick={closeMenteeFeedbackForm} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Close feedback form">
                <X className="w-5 h-5" />
              </button>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={menteeFeedbackForm.mentor_helpful}
                onChange={(e) => setMenteeFeedbackForm((prev) => ({ ...prev, mentor_helpful: e.target.checked }))}
              />
              The mentor was helpful
            </label>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Rating</label>
              <select
                value={menteeFeedbackForm.rating}
                onChange={(e) => setMenteeFeedbackForm((prev) => ({ ...prev, rating: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                {['5', '4', '3', '2', '1'].map((rating) => (
                  <option key={rating} value={rating}>{rating}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Comments</label>
              <textarea
                value={menteeFeedbackForm.feedback_text}
                onChange={(e) => setMenteeFeedbackForm((prev) => ({ ...prev, feedback_text: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                rows={4}
                placeholder="Share what helped"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={closeMenteeFeedbackForm} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold">
                Submit Feedback
              </button>
            </div>
          </form>
        </div>
      )}

      <MessageBox
        isOpen={msgBox.isOpen}
        onClose={() => setMsgBox((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={msgBox.onConfirm}
        type={msgBox.type}
        title={msgBox.title}
        message={msgBox.message}
        confirmText={msgBox.confirmText}
        cancelText={msgBox.cancelText}
      />
    </div>
  );
}
