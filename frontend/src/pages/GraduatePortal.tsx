import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Briefcase,
  Building2,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Flag,
  Heart,
  Home,
  ImagePlus,
  Loader2,
  LogOut,
  MapPin,
  Maximize2,
  Menu,
  MessageCircle,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  User,
  Users,
  Video,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { API_BASE_URL, API_ENDPOINTS } from '../config/api';
import MessageBox from '../components/MessageBox';
import NotificationBell from '../components/NotificationBell';
import { useGraduateAuth } from '../contexts/GraduateAuthContext';
import type { GraduateUser } from '../contexts/GraduateAuthContext';

type PortalTab = 'dashboard' | 'community_forum' | 'messages' | 'group_chats' | 'jobs' | 'job_posting' | 'my_profile';
type ForumStatus = 'approved' | 'pending' | 'hidden';
type ApprovalStatus = 'pending' | 'approved' | 'declined';

interface AlumniBadge {
  code: string;
  name: string;
  description: string;
}

interface AlumniRating {
  score: number;
  badges: AlumniBadge[];
  status_flags: {
    is_employed: boolean;
    is_aligned: boolean;
    is_survey_complete?: boolean;
  };
  permissions: {
    can_post_jobs: boolean;
  };
}

interface ForumMedia {
  id: number;
  post_id: number;
  media_type: 'image' | 'video';
  file_path: string;
  original_name?: string | null;
  mime_type?: string | null;
  file_size_bytes?: number | null;
  sort_order?: number;
  created_at?: string | null;
}

interface ForumPost {
  id: number;
  graduate_id: number;
  title: string;
  content: string;
  category: string;
  status: ForumStatus;
  image_path?: string | null;
  image_original_name?: string | null;
  image_mime_type?: string | null;
  image_file_size_bytes?: number | null;
  media?: ForumMedia[];
  media_count?: number;
  created_at: string;
  updated_at: string;
  author_name: string;
  author_program_name?: string | null;
  author_program_code?: string | null;
  author_profile_image_path?: string | null;
  comment_count: number;
  like_count: number;
  report_count?: number;
  is_liked: boolean;
}

interface ForumComment {
  id: number;
  post_id: number;
  graduate_id: number;
  comment: string;
  created_at: string;
  commenter_name: string;
  commenter_program_name?: string | null;
  commenter_program_code?: string | null;
  commenter_profile_image_path?: string | null;
}

interface ForumFormState {
  id: number | null;
  title: string;
  content: string;
  category: string;
  media: ForumMedia[];
  remove_media: boolean;
}

interface ForumActivityLog {
  id: number;
  action: string;
  post_id?: number | null;
  comment_id?: number | null;
  post_title?: string | null;
  created_at: string;
}

interface ReportTarget {
  target_type: 'post' | 'comment';
  target_id: number;
  label: string;
}

interface ChatParticipant {
  graduate_id: number;
  full_name: string;
  program_code?: string | null;
  profile_image_path?: string | null;
}

interface ChatRoom {
  id: number;
  created_by: number;
  name?: string | null;
  is_group: boolean;
  created_at: string;
  updated_at: string;
  last_message?: string | null;
  last_message_at?: string | null;
  last_message_sender_id?: number | null;
  participants: ChatParticipant[];
  participant_count: number;
}

interface ChatMessage {
  id: number;
  room_id: number;
  graduate_id: number;
  message: string;
  created_at: string;
  sender_name: string;
  sender_program_code?: string | null;
  sender_profile_image_path?: string | null;
  is_mine: boolean;
}

interface JobPost {
  id: number;
  title: string;
  company: string;
  location?: string | null;
  salary_range?: string | null;
  job_type: string;
  industry?: string | null;
  description?: string | null;
  required_skills?: string | null;
  course_program_fit?: string | null;
  application_deadline?: string | null;
  contact_email?: string | null;
  application_link?: string | null;
  application_method?: string | null;
  poster_program_name?: string | null;
  poster_program_code?: string | null;
  poster_email?: string | null;
  approval_status?: ApprovalStatus | null;
  approval_notes?: string | null;
  is_active: number;
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

interface ProfileFormState {
  first_name: string;
  middle_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  current_password: string;
  password: string;
  confirm_password: string;
}

interface MessageBoxState {
  isOpen: boolean;
  type: 'success' | 'error' | 'warning' | 'info' | 'confirm';
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
}

const portalTabs: PortalTab[] = ['dashboard', 'community_forum', 'messages', 'group_chats', 'jobs', 'job_posting', 'my_profile'];
const forumCategoryFallback = [
  'Career Advice',
  'Work Experience',
  'Course-Related Discussion',
  'Graduate Concerns',
  'General Discussion',
];
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const passwordRequirementMessage =
  'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.';

function getPortalTab(rawValue: string | null): PortalTab {
  if (rawValue && portalTabs.includes(rawValue as PortalTab)) {
    return rawValue as PortalTab;
  }
  return 'community_forum';
}

function resolveAssetUrl(path?: string | null) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE_URL}/${path.replace(/^\/+/, '')}`;
}

function getInitials(value?: string | null) {
  const text = (value || '').trim();
  if (!text) return 'G';

  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTime(value?: string | null) {
  const parsed = parseDate(value);
  if (!parsed) return 'Unknown date';

  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRelativeTime(value?: string | null) {
  const parsed = parseDate(value);
  if (!parsed) return 'Just now';

  const seconds = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 1000));
  if (seconds < 60) return 'Just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: parsed.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

function previewText(value: string, maxLength = 220) {
  const clean = value.trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength).trimEnd()}...`;
}

const forumMediaAccept = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/ogg,video/quicktime';
const maxForumMediaFiles = 10;
const maxForumImageBytes = 5 * 1024 * 1024;
const maxForumVideoBytes = 50 * 1024 * 1024;

function isVideoMedia(media: Pick<ForumMedia, 'media_type' | 'mime_type'>) {
  return media.media_type === 'video' || !!media.mime_type?.startsWith('video/');
}

function isVideoFile(file: File) {
  return file.type.startsWith('video/');
}

function getPostMedia(post?: ForumPost | null): ForumMedia[] {
  if (!post) return [];
  if (Array.isArray(post.media) && post.media.length > 0) return post.media;
  if (!post.image_path) return [];

  return [
    {
      id: 0,
      post_id: post.id,
      media_type: post.image_mime_type?.startsWith('video/') ? 'video' : 'image',
      file_path: post.image_path,
      original_name: post.image_original_name || post.title,
      mime_type: post.image_mime_type || null,
      file_size_bytes: post.image_file_size_bytes ?? null,
      sort_order: 0,
      created_at: post.created_at,
    },
  ];
}

function formatBytes(value?: number | null) {
  if (!value || value <= 0) return '';
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function forumStatusClass(status: ForumStatus) {
  if (status === 'approved') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'hidden') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function approvalStatusClass(status?: ApprovalStatus | null) {
  if (status === 'approved') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'declined') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function formatApprovalStatus(status?: ApprovalStatus | null) {
  if (!status) return 'Pending';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatEmploymentType(value?: string | null) {
  return (value || 'full_time')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeApplicationLink(value?: string | null) {
  const link = (value || '').trim();
  if (!link) return '';
  return /^https?:\/\//i.test(link) ? link : `https://${link}`;
}

function normalizeDateInput(value?: string | null) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function createDefaultJobForm(user: GraduateUser | null): JobForm {
  return {
    title: '',
    company: '',
    location: '',
    job_type: 'full_time',
    industry: '',
    salary_range: '',
    description: '',
    required_skills: '',
    course_program_fit: user?.program_code || user?.program_name || '',
    application_deadline: '',
    contact_email: user?.email || '',
    application_link: '',
    application_method: '',
    is_active: true,
  };
}

function getRoomOtherParticipants(room: ChatRoom, currentGraduateId: number) {
  return room.participants.filter((participant) => participant.graduate_id !== currentGraduateId);
}

function getRoomLabel(room: ChatRoom, currentGraduateId: number) {
  if (room.is_group) {
    return room.name?.trim() || 'Group Chat';
  }

  const other = getRoomOtherParticipants(room, currentGraduateId)[0];
  return other?.full_name || 'Direct Chat';
}

function getRoomSubtitle(room: ChatRoom, currentGraduateId: number) {
  if (room.is_group) {
    const others = getRoomOtherParticipants(room, currentGraduateId);
    if (others.length === 0) return 'Only you';
    return others.map((participant) => participant.full_name).join(', ');
  }

  const other = getRoomOtherParticipants(room, currentGraduateId)[0];
  return other?.program_code || 'Graduate';
}

function getPortalHeading(tab: PortalTab) {
  if (tab === 'dashboard') {
    return {
      title: 'Graduate Dashboard',
      subtitle: 'A quick view of your community, career, and account activity.',
    };
  }

  if (tab === 'community_forum') {
    return {
      title: 'Community Forum',
      subtitle: 'A social feed for graduate conversations, reactions, and chats.',
    };
  }

  if (tab === 'messages') {
    return {
      title: 'Messages',
      subtitle: 'Open direct chats with fellow graduates.',
    };
  }

  if (tab === 'group_chats') {
    return {
      title: 'Group Chats',
      subtitle: 'Coordinate group conversations with multiple graduates.',
    };
  }

  if (tab === 'jobs') {
    return {
      title: 'Browse Jobs',
      subtitle: 'Explore approved opportunities shared inside GradTrack.',
    };
  }

  if (tab === 'job_posting') {
    return {
      title: 'Job Posting',
      subtitle: 'Create and manage job opportunities without mixing them into the forum.',
    };
  }

  return {
    title: 'My Profile',
    subtitle: 'Update your personal details, password, and profile photo.',
  };
}

function formatActivityLabel(activity: ForumActivityLog) {
  const title = activity.post_title ? `"${activity.post_title}"` : 'a forum post';

  if (activity.action === 'post_liked') return `Reacted to ${title}`;
  if (activity.action === 'post_unliked') return `Removed reaction from ${title}`;
  if (activity.action === 'comment_created') return `Commented on ${title}`;
  if (activity.action === 'comment_deleted') return `Deleted a comment from ${title}`;

  return `Updated ${title}`;
}

export default function GraduatePortal() {
  const { user, logout, checkAuth } = useGraduateAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState<PortalTab>(() => getPortalTab(searchParams.get('tab')));
  const [loading, setLoading] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileIsEditing, setProfileIsEditing] = useState(false);
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState('');
  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    first_name: '',
    middle_name: '',
    last_name: '',
    email: '',
    phone: '',
    address: '',
    current_password: '',
    password: '',
    confirm_password: '',
  });
  const [ratingSummary, setRatingSummary] = useState<AlumniRating | null>(null);

  const [forumPosts, setForumPosts] = useState<ForumPost[]>([]);
  const [myForumPosts, setMyForumPosts] = useState<ForumPost[]>([]);
  const [forumCategories, setForumCategories] = useState<string[]>(forumCategoryFallback);
  const [forumSearch, setForumSearch] = useState('');
  const [forumCategory, setForumCategory] = useState('all');
  const [forumComposerOpen, setForumComposerOpen] = useState(false);
  const [managePostsOpen, setManagePostsOpen] = useState(false);
  const [forumSubmitting, setForumSubmitting] = useState(false);
  const [forumActionKey, setForumActionKey] = useState('');
  const [forumForm, setForumForm] = useState<ForumFormState>({
    id: null,
    title: '',
    content: '',
    category: forumCategoryFallback[0],
    media: [],
    remove_media: false,
  });
  const [forumMediaFiles, setForumMediaFiles] = useState<File[]>([]);
  const [aiModerating, setAiModerating] = useState(false);
  const [programFilter, setProgramFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('');
  const [selectedPostOpen, setSelectedPostOpen] = useState(false);
  const [selectedPostLoading, setSelectedPostLoading] = useState(false);
  const [selectedPost, setSelectedPost] = useState<ForumPost | null>(null);
  const [mediaViewer, setMediaViewer] = useState<{ post: ForumPost; mediaIndex: number } | null>(null);
  const [mediaViewerZoom, setMediaViewerZoom] = useState(1);
  const [mediaViewerComments, setMediaViewerComments] = useState<ForumComment[]>([]);
  const [mediaViewerCommentsLoading, setMediaViewerCommentsLoading] = useState(false);
  const [mediaViewerCommentDraft, setMediaViewerCommentDraft] = useState('');
  const [mediaViewerCommentSubmitting, setMediaViewerCommentSubmitting] = useState(false);
  const [postComments, setPostComments] = useState<ForumComment[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [activityLogs, setActivityLogs] = useState<ForumActivityLog[]>([]);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [myPostedJobs, setMyPostedJobs] = useState<JobPost[]>([]);
  const [jobSearch, setJobSearch] = useState('');
  const [showJobPostForm, setShowJobPostForm] = useState(false);
  const [jobSubmitting, setJobSubmitting] = useState(false);
  const [myJobForm, setMyJobForm] = useState<JobForm>(() => createDefaultJobForm(user));

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [directory, setDirectory] = useState<ChatParticipant[]>([]);
  const [chatSearch, setChatSearch] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [activeRoom, setActiveRoom] = useState<ChatRoom | null>(null);
  const [roomMessages, setRoomMessages] = useState<ChatMessage[]>([]);
  const [roomLoading, setRoomLoading] = useState(false);
  const [chatMessageDraft, setChatMessageDraft] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [chatModalMode, setChatModalMode] = useState<'direct' | 'group'>('direct');
  const [chatModalName, setChatModalName] = useState('');
  const [chatModalSelectedIds, setChatModalSelectedIds] = useState<number[]>([]);
  const [chatModalSearch, setChatModalSearch] = useState('');
  const [chatCreating, setChatCreating] = useState(false);

  const [msgBox, setMsgBox] = useState<MessageBoxState>({
    isOpen: false,
    type: 'info',
    message: '',
  });

  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const profileImageInputRef = useRef<HTMLInputElement | null>(null);
  const forumMediaInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const currentGraduateId = user?.graduate_id ?? 0;
  const currentProfileImageUrl = resolveAssetUrl(user?.profile_image_path);
  const canPostJobs = !!ratingSummary?.permissions?.can_post_jobs;
  const pageHeading = getPortalHeading(activeTab);

  const filteredForumPosts = forumPosts.filter((post) => {
    const matchesCategory = forumCategory === 'all' || post.category === forumCategory;
    if (!matchesCategory) return false;

    const query = forumSearch.trim().toLowerCase();
    if (!query) return true;

    return [post.title, post.content, post.category, post.author_name]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });

  const filteredJobs = jobs.filter((job) => {
    const query = jobSearch.trim().toLowerCase();
    if (!query) return true;

    return [
      job.title,
      job.company,
      job.description,
      job.location,
      job.industry,
      job.required_skills,
      job.course_program_fit,
    ]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });

  const matchesChatSearch = (room: ChatRoom) => {
    const query = chatSearch.trim().toLowerCase();
    if (!query) return true;

    return [getRoomLabel(room, currentGraduateId), getRoomSubtitle(room, currentGraduateId), room.last_message || '']
      .join(' ')
      .toLowerCase()
      .includes(query);
  };

  const directRooms = useMemo(() => rooms.filter((room) => !room.is_group), [rooms]);
  const groupRooms = useMemo(() => rooms.filter((room) => room.is_group), [rooms]);
  const filteredRooms = rooms.filter(matchesChatSearch);
  const filteredDirectRooms = directRooms.filter(matchesChatSearch);
  const filteredGroupRooms = groupRooms.filter(matchesChatSearch);

  const filteredDirectory = directory.filter((participant) => {
    const query = chatModalSearch.trim().toLowerCase();
    if (!query) return true;

    return [participant.full_name, participant.program_code || ''].join(' ').toLowerCase().includes(query);
  });

  const pendingForumPostsCount = myForumPosts.filter((post) => post.status === 'pending').length;
  const approvedForumPostsCount = myForumPosts.filter((post) => post.status === 'approved').length;
  const hiddenForumPostsCount = myForumPosts.filter((post) => post.status === 'hidden').length;
  const directChatCount = directRooms.length;
  const groupChatCount = groupRooms.length;

  const notify = useCallback((type: MessageBoxState['type'], message: string, title?: string) => {
    setMsgBox({
      isOpen: true,
      type,
      title,
      message,
    });
  }, []);

  const authenticatedFetch = useCallback(async (url: string, options?: RequestInit) => {
    const headers = new Headers(options?.headers || {});
    const hasFormData = options?.body instanceof FormData;

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
  }, []);

  const selectTab = useCallback(
    (tab: PortalTab) => {
      setActiveTab(tab);
      setSearchParams({ tab });
    },
    [setSearchParams],
  );

  const resetForumForm = useCallback(() => {
    setForumForm({
      id: null,
      title: '',
      content: '',
      category: forumCategories[0] || forumCategoryFallback[0],
      media: [],
      remove_media: false,
    });
    setForumMediaFiles([]);
  }, [forumCategories]);

  const resetJobForm = useCallback(() => {
    setMyJobForm(createDefaultJobForm(user));
  }, [user]);

  const loadRatingSummary = useCallback(async () => {
    const response = await authenticatedFetch(API_ENDPOINTS.ALUMNI_RATING.SUMMARY);
    setRatingSummary((response.data?.rating as AlumniRating | undefined) || null);
  }, [authenticatedFetch]);

  const loadForumFeed = useCallback(async () => {
    const response = await authenticatedFetch(API_ENDPOINTS.FORUM.POSTS);
    setForumPosts(Array.isArray(response.data) ? (response.data as ForumPost[]) : []);
    if (Array.isArray(response.categories) && response.categories.length > 0) {
      setForumCategories(response.categories as string[]);
    }
  }, [authenticatedFetch]);

  const loadMyForumPosts = useCallback(async () => {
    const response = await authenticatedFetch(`${API_ENDPOINTS.FORUM.POSTS}?mine=1`);
    setMyForumPosts(Array.isArray(response.data) ? (response.data as ForumPost[]) : []);
  }, [authenticatedFetch]);

  const loadJobs = useCallback(async () => {
    const response = await authenticatedFetch(API_ENDPOINTS.JOBS.POSTS);
    setJobs(Array.isArray(response.data) ? (response.data as JobPost[]) : []);
  }, [authenticatedFetch]);

  const loadMyJobs = useCallback(async () => {
    const response = await authenticatedFetch(`${API_ENDPOINTS.JOBS.POSTS}?mine=1&include_inactive=1`);
    setMyPostedJobs(Array.isArray(response.data) ? (response.data as JobPost[]) : []);
  }, [authenticatedFetch]);

  const loadChats = useCallback(async () => {
    const response = await authenticatedFetch(API_ENDPOINTS.FORUM.CHATS);
    const roomList = Array.isArray(response.data?.rooms) ? (response.data.rooms as ChatRoom[]) : [];
    const directoryList = Array.isArray(response.data?.directory) ? (response.data.directory as ChatParticipant[]) : [];

    setRooms(roomList);
    setDirectory(directoryList);

    if (roomList.length === 0) {
      setSelectedRoomId(null);
      setActiveRoom(null);
      setRoomMessages([]);
      return;
    }

    setSelectedRoomId((current) => {
      if (current && roomList.some((room) => room.id === current)) {
        return current;
      }
      return roomList[0].id;
    });
  }, [authenticatedFetch]);

  const loadActivityLogs = useCallback(async () => {
    const response = await authenticatedFetch(`${API_ENDPOINTS.FORUM.ACTIVITY}?limit=12`);
    setActivityLogs(Array.isArray(response.data) ? (response.data as ForumActivityLog[]) : []);
  }, [authenticatedFetch]);

  const loadForumComments = useCallback(
    async (postId: number) => {
      const response = await authenticatedFetch(`${API_ENDPOINTS.FORUM.COMMENTS}?post_id=${postId}`);
      return Array.isArray(response.data) ? (response.data as ForumComment[]) : [];
    },
    [authenticatedFetch],
  );

  const loadMediaViewerComments = useCallback(
    async (postId: number) => {
      setMediaViewerCommentsLoading(true);

      try {
        const comments = await loadForumComments(postId);
        setMediaViewerComments(comments);
      } catch (error) {
        setMediaViewerComments([]);
        notify('error', error instanceof Error ? error.message : 'Unable to load comments', 'Community Forum');
      } finally {
        setMediaViewerCommentsLoading(false);
      }
    },
    [loadForumComments, notify],
  );

  const loadRoomMessages = useCallback(
    async (roomId: number, silent = false) => {
      if (!silent) {
        setRoomLoading(true);
      }

      try {
        const response = await authenticatedFetch(`${API_ENDPOINTS.FORUM.CHAT_MESSAGES}?room_id=${roomId}`);
        setActiveRoom((response.data?.room as ChatRoom | undefined) || null);
        setRoomMessages(Array.isArray(response.data?.messages) ? (response.data.messages as ChatMessage[]) : []);
      } finally {
        if (!silent) {
          setRoomLoading(false);
        }
      }
    },
    [authenticatedFetch],
  );

  const loadBootData = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }

      const results = await Promise.allSettled([
        loadRatingSummary(),
        loadForumFeed(),
        loadMyForumPosts(),
        loadJobs(),
        loadMyJobs(),
        loadChats(),
        loadActivityLogs(),
      ]);

      if (!silent) {
        setLoading(false);
      }

      const failed = [
        results[0].status === 'rejected' ? 'rating summary' : null,
        results[1].status === 'rejected' ? 'forum feed' : null,
        results[2].status === 'rejected' ? 'my forum posts' : null,
        results[3].status === 'rejected' ? 'jobs' : null,
        results[4].status === 'rejected' ? 'my job posts' : null,
        results[5].status === 'rejected' ? 'chats' : null,
        results[6].status === 'rejected' ? 'activity logs' : null,
      ].filter(Boolean);

      if (failed.length > 0 && !silent) {
        notify('warning', `Some data could not be loaded: ${failed.join(', ')}.`);
      }
    },
    [loadActivityLogs, loadChats, loadForumFeed, loadJobs, loadMyForumPosts, loadMyJobs, loadRatingSummary, notify],
  );

  const loadPostDetail = useCallback(
    async (postId: number) => {
      setSelectedPostLoading(true);
      setSelectedPostOpen(true);
      setCommentDraft('');

      try {
        const [postResponse, comments] = await Promise.all([
          authenticatedFetch(`${API_ENDPOINTS.FORUM.POSTS}?id=${postId}`),
          loadForumComments(postId),
        ]);

        setSelectedPost((postResponse.data as ForumPost | undefined) || null);
        setPostComments(comments);
      } catch (error) {
        setSelectedPostOpen(false);
        notify('error', error instanceof Error ? error.message : 'Unable to load this forum post');
      } finally {
        setSelectedPostLoading(false);
      }
    },
    [authenticatedFetch, loadForumComments, notify],
  );

  useEffect(() => {
    void loadBootData();
  }, [loadBootData]);

  useEffect(() => {
    setActiveTab(getPortalTab(searchParams.get('tab')));
  }, [searchParams]);

  useEffect(() => {
    const scopedRooms =
      activeTab === 'messages'
        ? directRooms
        : activeTab === 'group_chats'
          ? groupRooms
          : null;

    if (!scopedRooms) return;

    if (scopedRooms.length === 0) {
      setSelectedRoomId(null);
      setActiveRoom(null);
      setRoomMessages([]);
      return;
    }

    setSelectedRoomId((current) => {
      if (current && scopedRooms.some((room) => room.id === current)) {
        return current;
      }

      return scopedRooms[0].id;
    });
  }, [activeTab, directRooms, groupRooms]);

  useEffect(() => {
    setProfileForm({
      first_name: user?.first_name || '',
      middle_name: user?.middle_name || '',
      last_name: user?.last_name || '',
      email: user?.email || '',
      phone: user?.phone || '',
      address: user?.address || '',
      current_password: '',
      password: '',
      confirm_password: '',
    });
  }, [user]);

  useEffect(() => {
    if (!profileImageFile) {
      setProfileImagePreview(currentProfileImageUrl);
    }
  }, [currentProfileImageUrl, profileImageFile]);

  useEffect(() => {
    setMyJobForm((current) => {
      if (current.id) return current;
      return {
        ...current,
        contact_email: current.contact_email || user?.email || '',
        course_program_fit: current.course_program_fit || user?.program_code || user?.program_name || '',
      };
    });
  }, [user?.email, user?.program_code, user?.program_name]);

  useEffect(() => {
    if (!forumForm.category) {
      setForumForm((current) => ({
        ...current,
        category: forumCategories[0] || forumCategoryFallback[0],
      }));
    }
  }, [forumCategories, forumForm.category]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!profileMenuRef.current) return;
      if (!profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!selectedRoomId) return;
    void loadRoomMessages(selectedRoomId);
  }, [loadRoomMessages, selectedRoomId]);

  useEffect(() => {
    if (!['community_forum', 'messages', 'group_chats'].includes(activeTab)) return undefined;

    const roomInterval = window.setInterval(() => {
      void loadChats();
    }, 15000);

    const messageInterval = window.setInterval(() => {
      if (selectedRoomId) {
        void loadRoomMessages(selectedRoomId, true);
      }
    }, 7000);

    return () => {
      window.clearInterval(roomInterval);
      window.clearInterval(messageInterval);
    };
  }, [activeTab, loadChats, loadRoomMessages, selectedRoomId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [roomMessages]);

  useEffect(() => {
    const handleNotificationUpdate = () => {
      void loadBootData(true);
      if (selectedRoomId) {
        void loadRoomMessages(selectedRoomId, true);
      }
    };

    window.addEventListener('gradtrack:notifications-updated', handleNotificationUpdate);
    return () => window.removeEventListener('gradtrack:notifications-updated', handleNotificationUpdate);
  }, [loadBootData, loadRoomMessages, selectedRoomId]);

  useEffect(() => {
    if (!mediaViewer) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMediaViewer();
      }
      if (event.key === 'ArrowRight') {
        moveMediaViewer(1);
      }
      if (event.key === 'ArrowLeft') {
        moveMediaViewer(-1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mediaViewer]);

  const openForumComposer = (post?: ForumPost) => {
    setManagePostsOpen(false);
    setSelectedPostOpen(false);

    if (post) {
      setForumForm({
        id: post.id,
        title: post.title,
        content: post.content,
        category: post.category,
        media: getPostMedia(post),
        remove_media: false,
      });
      setForumMediaFiles([]);
    } else {
      resetForumForm();
    }

    setForumComposerOpen(true);
  };

  const closeForumComposer = () => {
    setForumComposerOpen(false);
    resetForumForm();
  };

  const handleForumMediaSelection = (files: FileList | null) => {
    const selectedFiles = Array.from(files || []);

    if (selectedFiles.length === 0) {
      setForumMediaFiles([]);
      return;
    }

    if (selectedFiles.length > maxForumMediaFiles) {
      notify('warning', `You can attach up to ${maxForumMediaFiles} photos or videos.`, 'Community Forum');
      if (forumMediaInputRef.current) {
        forumMediaInputRef.current.value = '';
      }
      return;
    }

    for (const file of selectedFiles) {
      const isImage = file.type.startsWith('image/');
      const isVideo = isVideoFile(file);

      if (!isImage && !isVideo) {
        notify('warning', 'Only JPG, PNG, WEBP, GIF, MP4, WEBM, OGG, or MOV files are supported.', 'Community Forum');
        if (forumMediaInputRef.current) {
          forumMediaInputRef.current.value = '';
        }
        return;
      }

      const maxBytes = isVideo ? maxForumVideoBytes : maxForumImageBytes;
      if (file.size > maxBytes) {
        notify('warning', `${file.name} is too large. Images can be 5 MB and videos can be 50 MB.`, 'Community Forum');
        if (forumMediaInputRef.current) {
          forumMediaInputRef.current.value = '';
        }
        return;
      }
    }

    setForumMediaFiles(selectedFiles);
    setForumForm((current) => ({ ...current, remove_media: false }));
  };

  const openMediaViewer = (post: ForumPost, mediaIndex = 0) => {
    setMediaViewer({ post, mediaIndex });
    setMediaViewerZoom(1);
    setMediaViewerComments(selectedPost?.id === post.id ? postComments : []);
    setMediaViewerCommentDraft('');
    void loadMediaViewerComments(post.id);
  };

  const closeMediaViewer = () => {
    setMediaViewer(null);
    setMediaViewerZoom(1);
    setMediaViewerComments([]);
    setMediaViewerCommentDraft('');
  };

  const moveMediaViewer = (direction: 1 | -1) => {
    setMediaViewer((current) => {
      if (!current) return current;
      const media = getPostMedia(current.post);
      if (media.length <= 1) return current;

      const nextIndex = (current.mediaIndex + direction + media.length) % media.length;
      return { ...current, mediaIndex: nextIndex };
    });
    setMediaViewerZoom(1);
  };

  const handleForumSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const title = forumForm.title.trim();
    const content = forumForm.content.trim();
    const category = forumForm.category.trim();

    if (!title || !content || !category) {
      notify('warning', 'Title, content, and category are required.', 'Community Forum');
      return;
    }

    // AI Moderation Check
    if (!forumForm.id) {
      setAiModerating(true);
      try {
        const moderationResponse = await authenticatedFetch(API_ENDPOINTS.FORUM_AI_MODERATE, {
          method: 'POST',
          body: JSON.stringify({ title, content, category }),
        });

        if (moderationResponse.is_appropriate === false) {
          const reason = moderationResponse.moderation?.reason || 'Content violates community guidelines.';
          const categories = moderationResponse.moderation?.categories || [];
          setAiModerating(false);
          setMsgBox({
            isOpen: true,
            type: 'warning',
            title: 'Post Blocked by AI Moderation',
            message: `Your post was flagged as inappropriate.\n\nReason: ${reason}\n\nCategories: ${categories.join(', ')}\n\nPlease revise your content and try again.`,
            confirmText: 'OK',
          });
          return;
        }
      } catch {
        // If AI moderation fails, allow post to proceed (fail open)
      } finally {
        setAiModerating(false);
      }
    }

    setForumSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('content', content);
      formData.append('category', category);
      forumMediaFiles.forEach((file) => {
        formData.append('media[]', file);
      });
      if (forumForm.remove_media) {
        formData.append('remove_media', '1');
      }

      if (forumForm.id) {
        formData.append('id', String(forumForm.id));
        formData.append('_method', 'PUT');
        await authenticatedFetch(API_ENDPOINTS.FORUM.POSTS, {
          method: 'POST',
          body: formData,
        });
        notify('success', 'Forum post updated and submitted for moderation.', 'Community Forum');
      } else {
        await authenticatedFetch(API_ENDPOINTS.FORUM.POSTS, {
          method: 'POST',
          body: formData,
        });
        notify('success', 'Forum post published and visible in the feed.', 'Community Forum');
      }

      closeForumComposer();
      await Promise.all([loadForumFeed(), loadMyForumPosts()]);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to save forum post', 'Community Forum');
    } finally {
      setForumSubmitting(false);
    }
  };

  const handleForumDelete = (post: ForumPost) => {
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: 'Delete Forum Post',
      message: `Delete "${post.title}" from the Community Forum?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setForumActionKey(`delete-${post.id}`);

        try {
          await authenticatedFetch(API_ENDPOINTS.FORUM.POSTS, {
            method: 'DELETE',
            body: JSON.stringify({ id: post.id }),
          });

          if (selectedPost?.id === post.id) {
            setSelectedPostOpen(false);
            setSelectedPost(null);
            setPostComments([]);
          }

          notify('success', 'Forum post deleted successfully.', 'Community Forum');
          await Promise.all([loadForumFeed(), loadMyForumPosts()]);
        } catch (error) {
          notify('error', error instanceof Error ? error.message : 'Unable to delete forum post', 'Community Forum');
        } finally {
          setForumActionKey('');
        }
      },
    });
  };

  const toggleLike = async (postId: number) => {
    setForumActionKey(`like-${postId}`);

    try {
      const response = await authenticatedFetch(API_ENDPOINTS.FORUM.LIKES, {
        method: 'POST',
        body: JSON.stringify({ post_id: postId }),
      });

      const liked = !!response.liked;
      const likeCount = Number(response.like_count || 0);

      setForumPosts((current) =>
        current.map((post) => (post.id === postId ? { ...post, is_liked: liked, like_count: likeCount } : post)),
      );
      setMyForumPosts((current) =>
        current.map((post) => (post.id === postId ? { ...post, is_liked: liked, like_count: likeCount } : post)),
      );
      setSelectedPost((current) =>
        current && current.id === postId ? { ...current, is_liked: liked, like_count: likeCount } : current,
      );
      await loadActivityLogs();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to update reaction', 'Community Forum');
    } finally {
      setForumActionKey('');
    }
  };

  const handleCommentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedPost) return;

    const comment = commentDraft.trim();
    if (!comment) {
      notify('warning', 'Write a comment before posting.', 'Community Forum');
      return;
    }

    setCommentSubmitting(true);

    try {
      await authenticatedFetch(API_ENDPOINTS.FORUM.COMMENTS, {
        method: 'POST',
        body: JSON.stringify({
          post_id: selectedPost.id,
          comment,
        }),
      });

      setCommentDraft('');
      await loadPostDetail(selectedPost.id);
      await Promise.all([loadForumFeed(), loadMyForumPosts(), loadActivityLogs()]);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to post comment', 'Community Forum');
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleMediaViewerCommentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!mediaViewer) return;

    const comment = mediaViewerCommentDraft.trim();
    if (!comment) {
      notify('warning', 'Write a comment before posting.', 'Community Forum');
      return;
    }

    setMediaViewerCommentSubmitting(true);

    try {
      await authenticatedFetch(API_ENDPOINTS.FORUM.COMMENTS, {
        method: 'POST',
        body: JSON.stringify({
          post_id: mediaViewer.post.id,
          comment,
        }),
      });

      setMediaViewerCommentDraft('');
      const comments = await loadForumComments(mediaViewer.post.id);
      setMediaViewerComments(comments);
      setMediaViewer((current) =>
        current && current.post.id === mediaViewer.post.id
          ? { ...current, post: { ...current.post, comment_count: comments.length } }
          : current,
      );

      if (selectedPost?.id === mediaViewer.post.id) {
        setPostComments(comments);
        setSelectedPost((current) => (current ? { ...current, comment_count: comments.length } : current));
      }

      await Promise.all([loadForumFeed(), loadMyForumPosts(), loadActivityLogs()]);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to post comment', 'Community Forum');
    } finally {
      setMediaViewerCommentSubmitting(false);
    }
  };

  const handleDeleteComment = (comment: ForumComment) => {
    if (!selectedPost) return;

    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: 'Delete Comment',
      message: 'Delete this comment from the discussion?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          await authenticatedFetch(API_ENDPOINTS.FORUM.COMMENTS, {
            method: 'DELETE',
            body: JSON.stringify({ id: comment.id }),
          });

          await loadPostDetail(selectedPost.id);
          await Promise.all([loadForumFeed(), loadMyForumPosts(), loadActivityLogs()]);
          notify('success', 'Comment deleted successfully.', 'Community Forum');
        } catch (error) {
          notify('error', error instanceof Error ? error.message : 'Unable to delete comment', 'Community Forum');
        }
      },
    });
  };

  const openReportModal = (target: ReportTarget) => {
    setReportTarget(target);
    setReportReason('');
  };

  const closeReportModal = () => {
    setReportTarget(null);
    setReportReason('');
  };

  const handleSubmitReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reportTarget) return;

    setReportSubmitting(true);

    try {
      await authenticatedFetch(API_ENDPOINTS.FORUM.REPORTS, {
        method: 'POST',
        body: JSON.stringify({
          target_type: reportTarget.target_type,
          target_id: reportTarget.target_id,
          reason: reportReason.trim(),
        }),
      });

      notify('success', 'Report submitted for moderator review.', 'Community Forum');
      closeReportModal();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to submit report', 'Community Forum');
    } finally {
      setReportSubmitting(false);
    }
  };

  const openChatModal = (mode: 'direct' | 'group') => {
    setChatModalMode(mode);
    setChatModalName('');
    setChatModalSelectedIds([]);
    setChatModalSearch('');
    setChatModalOpen(true);
  };

  const createDirectChat = async (graduateId: number) => {
    try {
      const response = await authenticatedFetch(API_ENDPOINTS.FORUM.CHATS, {
        method: 'POST',
        body: JSON.stringify({
          is_group: false,
          participant_ids: [graduateId],
        }),
      });

      const roomId = Number(response.room_id || 0);
      await loadChats();
      if (roomId > 0) {
        setSelectedRoomId(roomId);
        await loadRoomMessages(roomId);
      }
      setSelectedPostOpen(false);
      selectTab('messages');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to start direct chat', 'Chats');
    }
  };

  const handleCreateChat = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (chatModalMode === 'group') {
      if (!chatModalName.trim()) {
        notify('warning', 'Group chat name is required.', 'Chats');
        return;
      }

      if (chatModalSelectedIds.length < 2) {
        notify('warning', 'Select at least two graduates for a group chat.', 'Chats');
        return;
      }
    } else if (chatModalSelectedIds.length !== 1) {
      notify('warning', 'Select exactly one graduate for a direct chat.', 'Chats');
      return;
    }

    setChatCreating(true);

    try {
      const response = await authenticatedFetch(API_ENDPOINTS.FORUM.CHATS, {
        method: 'POST',
        body: JSON.stringify({
          is_group: chatModalMode === 'group',
          name: chatModalMode === 'group' ? chatModalName.trim() : '',
          participant_ids: chatModalSelectedIds,
        }),
      });

      const roomId = Number(response.room_id || 0);
      setChatModalOpen(false);
      await loadChats();

      if (roomId > 0) {
        setSelectedRoomId(roomId);
        await loadRoomMessages(roomId);
      }
      selectTab(chatModalMode === 'group' ? 'group_chats' : 'messages');

      notify(
        'success',
        chatModalMode === 'group' ? 'Group chat created successfully.' : 'Direct chat opened successfully.',
        'Chats',
      );
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to create chat', 'Chats');
    } finally {
      setChatCreating(false);
    }
  };

  const handleSendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedRoomId) {
      notify('warning', 'Select a chat room first.', 'Chats');
      return;
    }

    const message = chatMessageDraft.trim();
    if (!message) return;

    setChatSending(true);

    try {
      await authenticatedFetch(API_ENDPOINTS.FORUM.CHAT_MESSAGES, {
        method: 'POST',
        body: JSON.stringify({
          room_id: selectedRoomId,
          message,
        }),
      });

      setChatMessageDraft('');
      await Promise.all([loadChats(), loadRoomMessages(selectedRoomId, true)]);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to send message', 'Chats');
    } finally {
      setChatSending(false);
    }
  };

  const beginCreateJob = () => {
    resetJobForm();
    setShowJobPostForm(true);
  };

  const closeJobForm = () => {
    setShowJobPostForm(false);
    resetJobForm();
  };

  const beginEditJob = async (id: number) => {
    try {
      const response = await authenticatedFetch(`${API_ENDPOINTS.JOBS.POSTS}?id=${id}`);
      const job = response.data as JobPost | undefined;

      if (!job) {
        throw new Error('Unable to load job details');
      }

      setMyJobForm({
        id: job.id,
        title: job.title || '',
        company: job.company || '',
        location: job.location || '',
        job_type: job.job_type || 'full_time',
        industry: job.industry || '',
        salary_range: job.salary_range || '',
        description: job.description || '',
        required_skills: job.required_skills || '',
        course_program_fit: job.course_program_fit || job.poster_program_code || job.poster_program_name || '',
        application_deadline: normalizeDateInput(job.application_deadline),
        contact_email: job.contact_email || job.poster_email || user?.email || '',
        application_link: job.application_link || '',
        application_method: job.application_method || '',
        is_active: !!job.is_active,
      });

      setShowJobPostForm(true);
      selectTab('job_posting');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to load job details', 'Job Posting');
    }
  };

  const handleJobSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canPostJobs) {
      notify('warning', 'Job posting is locked until your employment status is set to employed.', 'Job Posting');
      return;
    }

    const title = myJobForm.title.trim();
    const company = myJobForm.company.trim();
    const description = myJobForm.description.trim();
    const contactEmail = myJobForm.contact_email.trim();
    const applicationLink = myJobForm.application_link.trim();
    const applicationMethod = myJobForm.application_method.trim();

    if (!title || !company || !description) {
      notify('warning', 'Title, company, and description are required.', 'Job Posting');
      return;
    }

    if (!contactEmail && !applicationLink && !applicationMethod) {
      notify('warning', 'Add a contact email, application link, or contact details.', 'Job Posting');
      return;
    }

    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      notify('warning', 'Please provide a valid contact email.', 'Job Posting');
      return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('company', company);
    formData.append('location', myJobForm.location.trim());
    formData.append('job_type', myJobForm.job_type);
    formData.append('industry', myJobForm.industry.trim());
    formData.append('salary_range', myJobForm.salary_range.trim());
    formData.append('description', description);
    formData.append('required_skills', myJobForm.required_skills.trim());
    formData.append('course_program_fit', myJobForm.course_program_fit.trim());
    formData.append('application_deadline', myJobForm.application_deadline || '');
    formData.append('contact_email', contactEmail);
    formData.append('application_link', applicationLink);
    formData.append('application_method', applicationMethod);
    formData.append('is_active', myJobForm.is_active ? '1' : '0');

    setJobSubmitting(true);

    try {
      if (myJobForm.id) {
        formData.append('id', String(myJobForm.id));
        formData.append('_method', 'PUT');
      }

      await authenticatedFetch(API_ENDPOINTS.JOBS.POSTS, {
        method: 'POST',
        body: formData,
      });

      notify('success', 'Job post submitted for approval.', 'Job Posting');
      closeJobForm();
      await Promise.all([loadJobs(), loadMyJobs(), loadRatingSummary()]);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to save job post', 'Job Posting');
    } finally {
      setJobSubmitting(false);
    }
  };

  const handleDeleteJob = (job: JobPost) => {
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: 'Delete Job Post',
      message: `Delete "${job.title}" from Job Posting?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          await authenticatedFetch(API_ENDPOINTS.JOBS.POSTS, {
            method: 'DELETE',
            body: JSON.stringify({ id: job.id }),
          });

          if (myJobForm.id === job.id) {
            closeJobForm();
          }

          notify('success', 'Job post deleted successfully.', 'Job Posting');
          await Promise.all([loadJobs(), loadMyJobs()]);
        } catch (error) {
          notify('error', error instanceof Error ? error.message : 'Unable to delete job post', 'Job Posting');
        }
      },
    });
  };

  const cancelProfileEditing = () => {
    setProfileIsEditing(false);
    setProfileImageFile(null);
    setProfileImagePreview(currentProfileImageUrl);
    setProfileForm({
      first_name: user?.first_name || '',
      middle_name: user?.middle_name || '',
      last_name: user?.last_name || '',
      email: user?.email || '',
      phone: user?.phone || '',
      address: user?.address || '',
      current_password: '',
      password: '',
      confirm_password: '',
    });
  };

  const handleProfileSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!profileIsEditing) return;

    const changingPassword = profileForm.password.trim() !== '' || profileForm.confirm_password.trim() !== '';

    if (changingPassword && !profileForm.current_password) {
      notify('warning', 'Current password is required before changing your password.', 'My Profile');
      return;
    }

    if (changingPassword && !passwordPattern.test(profileForm.password)) {
      notify('warning', passwordRequirementMessage, 'My Profile');
      return;
    }

    if (profileForm.password !== profileForm.confirm_password) {
      notify('warning', 'Password and confirm password do not match.', 'My Profile');
      return;
    }

    const formData = new FormData();
    formData.append('first_name', profileForm.first_name.trim());
    formData.append('middle_name', profileForm.middle_name.trim());
    formData.append('last_name', profileForm.last_name.trim());
    formData.append('email', profileForm.email.trim());
    formData.append('phone', profileForm.phone.trim());
    formData.append('address', profileForm.address.trim());

    if (changingPassword) {
      formData.append('current_password', profileForm.current_password);
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
      setProfileIsEditing(false);
      setProfileForm((current) => ({
        ...current,
        current_password: '',
        password: '',
        confirm_password: '',
      }));
      notify('success', 'Profile updated successfully.', 'My Profile');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to update profile', 'My Profile');
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

  const navItems: Array<{ key: PortalTab; label: string; shortLabel: string; icon: LucideIcon; badge?: number }> = [
    { key: 'dashboard', label: 'Dashboard', shortLabel: 'Home', icon: Home },
    { key: 'community_forum', label: 'Community Forum', shortLabel: 'Forum', icon: MessageSquare, badge: forumPosts.length },
    { key: 'messages', label: 'Messages', shortLabel: 'Chats', icon: MessageCircle, badge: directChatCount },
    { key: 'group_chats', label: 'Group Chats', shortLabel: 'Groups', icon: Users, badge: groupChatCount },
    { key: 'jobs', label: 'Browse Jobs', shortLabel: 'Jobs', icon: Briefcase, badge: jobs.length },
    { key: 'job_posting', label: 'Job Posting', shortLabel: 'Post Job', icon: Pencil, badge: myPostedJobs.length },
    { key: 'my_profile', label: 'My Profile', shortLabel: 'Profile', icon: User },
  ];
  const primaryNavItems = navItems.filter((item) => item.key !== 'my_profile');
  const activeNavItem = navItems.find((item) => item.key === activeTab);

  const profileInputClass = `w-full rounded-2xl border px-4 py-3 text-sm outline-none transition ${
    profileIsEditing
      ? 'border-slate-300 bg-white focus:border-blue-500'
      : 'border-slate-200 bg-slate-50 text-slate-500'
  }`;

  const renderChatWorkspace = (mode: 'direct' | 'group') => {
    const isGroupMode = mode === 'group';
    const scopedRooms = isGroupMode ? filteredGroupRooms : filteredDirectRooms;
    const allScopedRooms = isGroupMode ? groupRooms : directRooms;
    const visibleActiveRoom = activeRoom && activeRoom.is_group === isGroupMode ? activeRoom : null;
    const title = isGroupMode ? 'Group Chats' : 'Messages';
    const description = isGroupMode
      ? 'Create and follow group conversations with fellow graduates.'
      : 'Start and continue private graduate conversations.';
    const createLabel = isGroupMode ? 'New Group Chat' : 'New Message';
    const searchPlaceholder = isGroupMode ? 'Search group chats' : 'Search messages';
    const emptyMessage =
      allScopedRooms.length === 0
        ? isGroupMode
          ? 'No group chats yet. Create a group chat to get everyone in one place.'
          : 'No direct messages yet. Start a new message with a fellow graduate.'
        : 'No chats match your search.';

    return (
      <section className="space-y-5">
        <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
              <p className="text-sm text-slate-500">{description}</p>
            </div>
            <button type="button" onClick={() => openChatModal(mode)} className="inline-flex items-center gap-2 rounded-full bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800">
              <Plus className="h-4 w-4" />
              {createLabel}
            </button>
          </div>

          <label className="relative mt-4 block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={chatSearch} onChange={(event) => setChatSearch(event.target.value)} placeholder={searchPlaceholder} className="w-full rounded-2xl border border-slate-200 bg-[#fafbff] px-11 py-3 text-sm outline-none transition focus:border-blue-500" />
          </label>
        </div>

        <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="rounded-[32px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <p className="text-sm font-bold text-slate-900">{isGroupMode ? 'Groups' : 'Conversations'}</p>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {allScopedRooms.length}
              </span>
            </div>

            <div className="max-h-[640px] space-y-2 overflow-y-auto pr-1">
              {scopedRooms.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-[#fafbff] px-4 py-8 text-center text-sm text-slate-500">
                  {emptyMessage}
                </div>
              ) : (
                scopedRooms.map((room) => {
                  const active = selectedRoomId === room.id;

                  return (
                    <button key={room.id} type="button" onClick={() => setSelectedRoomId(room.id)} className={`flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition ${active ? 'border-blue-200 bg-blue-50' : 'border-transparent bg-[#fafbff] hover:border-slate-200 hover:bg-slate-50'}`}>
                      <Avatar src={resolveAssetUrl(getRoomOtherParticipants(room, currentGraduateId)[0]?.profile_image_path || room.participants[0]?.profile_image_path)} label={getRoomLabel(room, currentGraduateId)} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="truncate text-sm font-semibold text-slate-900">{getRoomLabel(room, currentGraduateId)}</p>
                          <span className="shrink-0 text-[11px] text-slate-400">{formatRelativeTime(room.last_message_at || room.updated_at)}</span>
                        </div>
                        <p className="truncate text-xs text-slate-500">{getRoomSubtitle(room, currentGraduateId)}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{room.last_message || 'No messages yet'}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex min-h-[640px] flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              {visibleActiveRoom ? (
                <div className="flex items-center gap-3">
                  <Avatar src={resolveAssetUrl(getRoomOtherParticipants(visibleActiveRoom, currentGraduateId)[0]?.profile_image_path || visibleActiveRoom.participants[0]?.profile_image_path)} label={getRoomLabel(visibleActiveRoom, currentGraduateId)} size="md" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-900">{getRoomLabel(visibleActiveRoom, currentGraduateId)}</p>
                    <p className="truncate text-xs text-slate-500">{getRoomSubtitle(visibleActiveRoom, currentGraduateId)}</p>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="font-semibold text-slate-900">Select a chat</p>
                  <p className="text-xs text-slate-500">Your messages will appear here.</p>
                </div>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col bg-[#fcfcfe]">
              {roomLoading ? (
                <div className="flex flex-1 items-center justify-center text-sm text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading conversation...
                </div>
              ) : visibleActiveRoom ? (
                <>
                  <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
                    {roomMessages.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                        No messages yet. Say hello and start the conversation.
                      </div>
                    ) : (
                      roomMessages.map((message) => (
                        <div key={message.id} className={`flex ${message.is_mine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[78%] rounded-3xl px-4 py-3 text-sm shadow-sm ${message.is_mine ? 'bg-blue-700 text-white' : 'border border-slate-200 bg-white text-slate-800'}`}>
                            {!message.is_mine && <p className="mb-1 text-xs font-semibold text-slate-500">{message.sender_name}</p>}
                            <p className="whitespace-pre-line leading-6">{message.message}</p>
                            <p className={`mt-2 text-[11px] ${message.is_mine ? 'text-blue-100' : 'text-slate-400'}`}>{formatRelativeTime(message.created_at)}</p>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  <form onSubmit={handleSendMessage} className="border-t border-slate-100 bg-white p-4">
                    <div className="flex items-end gap-2">
                      <textarea value={chatMessageDraft} onChange={(event) => setChatMessageDraft(event.target.value)} rows={2} placeholder="Type a message..." className="min-h-[52px] flex-1 resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500" />
                      <button type="submit" disabled={chatSending || !chatMessageDraft.trim()} className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-700 text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60" aria-label="Send message">
                        {chatSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-slate-500">
                  Pick a room from the list to read and send messages.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  };

  const ActiveNavIcon = activeNavItem?.icon || MessageSquare;

  return (
    <div className="min-h-screen bg-[#f4f6fb] text-slate-900">
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
          <button
            type="button"
            onClick={() => selectTab('dashboard')}
            className="flex shrink-0 items-center gap-3 text-left"
            title="GradTrack Community"
            aria-label="Open GradTrack Community"
          >
            <img src="/Gradtrack_small.png" alt="GradTrack" className="h-9 w-9 object-contain" />
            <div className="hidden sm:block">
              <p className="text-base font-bold leading-tight text-gray-900">GradTrack</p>
              <p className="text-[11px] leading-tight text-slate-500">Community</p>
            </div>
          </button>

          <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Graduate portal navigation">
            {primaryNavItems.map((item) => {
              const isActive = activeTab === item.key;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => selectTab(item.key)}
                  title={item.label}
                  aria-label={item.label}
                  className={`relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-blue-700 text-white shadow-sm'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="hidden xl:inline">{item.label}</span>
                  <span className="xl:hidden">{item.shortLabel}</span>
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span
                      className={`absolute -right-1 -top-1 min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold leading-none ${
                        isActive ? 'bg-[#f8c331] text-blue-950' : 'bg-rose-500 text-white'
                      }`}
                    >
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-3">
            <NotificationBell audience="graduate" />

            <div className="relative min-w-0" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => setProfileMenuOpen((current) => !current)}
                className={`flex items-center gap-2 rounded-full border bg-white px-2 py-1.5 shadow-sm transition hover:border-gray-300 ${
                  activeTab === 'my_profile' ? 'border-blue-200 ring-2 ring-blue-100' : 'border-gray-200'
                }`}
                aria-haspopup="menu"
                aria-expanded={profileMenuOpen}
              >
                <Avatar src={profileImagePreview || currentProfileImageUrl} label={user?.full_name} size="sm" />
                <div className="hidden min-w-0 flex-1 text-left md:block">
                  <p className="max-w-[150px] truncate text-sm font-semibold text-gray-800">{user?.full_name || 'Graduate User'}</p>
                  <p className="max-w-[150px] truncate text-xs text-gray-500">{user?.program_code || 'Graduate'}</p>
                </div>
                <ChevronDown className={`hidden h-4 w-4 text-gray-500 transition md:block ${profileMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {profileMenuOpen && (
                <div className="absolute right-0 z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border bg-white py-2 shadow-xl sm:w-80">
                  <div className="flex items-center gap-3 border-b px-4 py-3">
                    <Avatar src={profileImagePreview || currentProfileImageUrl} label={user?.full_name} size="lg" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-800">{user?.full_name || 'Graduate User'}</p>
                      <p className="truncate text-xs text-gray-500">{user?.email || 'No email set'}</p>
                      <p className="text-xs text-gray-500">{user?.program_name || user?.program_code || 'Graduate'}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      selectTab('my_profile');
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    <User className="h-4 w-4" />
                    My Profile
                  </button>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Logout
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setMobileNavOpen((current) => !current)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 lg:hidden"
              aria-label="Toggle mobile navigation"
              aria-expanded={mobileNavOpen}
            >
              {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileNavOpen && (
          <div className="border-t border-gray-200 lg:hidden">
            <div className="grid gap-1 px-4 py-3">
              {navItems.map((item) => {
                const isActive = activeTab === item.key;

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      selectTab(item.key);
                      setMobileNavOpen(false);
                    }}
                    className={`relative flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
                      isActive ? 'bg-blue-700 text-white' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                    title={item.label}
                    aria-label={item.label}
                  >
                    <item.icon className="h-5 w-5" />
                    <span>{item.label}</span>
                    {typeof item.badge === 'number' && item.badge > 0 && (
                      <span className={`ml-auto min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold leading-none ${isActive ? 'bg-[#f8c331] text-blue-950' : 'bg-rose-500 text-white'}`}>
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-screen-2xl px-3 py-4 pb-10 sm:px-6 sm:py-6">
        <section className="mb-5 flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-700 text-white shadow-sm">
              <ActiveNavIcon className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">GradTrack Community</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">{pageHeading.title}</h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{pageHeading.subtitle}</p>
            </div>
          </div>

        </section>

          {loading ? (
            <div className="flex min-h-[300px] items-center justify-center rounded-[32px] border border-slate-200 bg-white">
              <div className="flex items-center gap-3 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading your graduate portal...
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <section className="space-y-6">
                  <div className="grid gap-4 lg:grid-cols-4">
                    <DashboardCard label="Approved Forum Posts" value={forumPosts.length} caption="Visible in the social feed" tone="blue" />
                    <DashboardCard label="Pending My Posts" value={pendingForumPostsCount} caption="Waiting for moderator review" tone="amber" />
                    <DashboardCard label="Messages" value={directChatCount} caption={`${groupChatCount} group chat${groupChatCount === 1 ? '' : 's'}`} tone="pink" />
                    <DashboardCard label="Approved Jobs" value={jobs.length} caption={`${myPostedJobs.length} post${myPostedJobs.length === 1 ? '' : 's'} created by you`} tone="emerald" />
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-slate-500">Access Snapshot</p>
                          <h2 className="mt-1 text-2xl font-bold text-slate-900">Your GradTrack activity</h2>
                        </div>
                        <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
                          Alumni score: {Math.round(Number(ratingSummary?.score || 0))}
                        </div>
                      </div>

                      <div className="mt-6 grid gap-4 md:grid-cols-2">
                        <InfoTile title="Community Forum" description="Post, react, comment, and message fellow graduates." actionLabel="Open Forum" onAction={() => selectTab('community_forum')} />
                        <InfoTile title="Messages" description="Continue one-on-one conversations with fellow graduates." actionLabel="Open Messages" onAction={() => selectTab('messages')} />
                        <InfoTile title="Group Chats" description="Create or revisit group conversations for alumni coordination." actionLabel="Open Group Chats" onAction={() => selectTab('group_chats')} />
                        <InfoTile title="Job Posting" description={canPostJobs ? 'Your account can submit new job opportunities.' : 'Locked until employment status is marked as employed.'} actionLabel="Open Job Posting" onAction={() => selectTab('job_posting')} />
                        <InfoTile title="Browse Jobs" description="Review approved job openings shared in GradTrack." actionLabel="Browse Jobs" onAction={() => selectTab('jobs')} />
                        <InfoTile title="My Profile" description="Keep your account details and photo up to date." actionLabel="Edit Profile" onAction={() => selectTab('my_profile')} />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                        <h3 className="text-lg font-bold text-slate-900">Eligibility</h3>
                        <div className="mt-4 space-y-3 text-sm">
                          <StatusRow label="Employment status" value={ratingSummary?.status_flags.is_employed ? 'Employed' : 'Not employed'} positive={!!ratingSummary?.status_flags.is_employed} />
                          <StatusRow label="Course alignment" value={ratingSummary?.status_flags.is_aligned ? 'Aligned' : 'Not aligned'} positive={!!ratingSummary?.status_flags.is_aligned} />
                          <StatusRow label="Job posting access" value={canPostJobs ? 'Unlocked' : 'Locked'} positive={canPostJobs} />
                        </div>
                      </div>

                      <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                        <h3 className="text-lg font-bold text-slate-900">Recognition</h3>
                        {ratingSummary?.badges?.length ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {ratingSummary.badges.map((badge) => (
                              <span key={badge.code} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                                {badge.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-4 text-sm text-slate-500">Badges will appear here as your graduate activity grows.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {activeTab === 'community_forum' && (
                <section className="space-y-6">
                  <div className="rounded-[32px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <Avatar src={currentProfileImageUrl} label={user?.full_name} size="lg" />
                      <button type="button" onClick={() => openForumComposer()} className="flex-1 rounded-full bg-[#f5f7fb] px-5 py-3 text-left text-sm text-slate-500 transition hover:bg-[#edf1f8]">
                        Share a career tip, experience, or question with fellow graduates...
                      </button>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => openForumComposer()} className="inline-flex items-center gap-2 rounded-full bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
                          <Plus className="h-4 w-4" />
                          Create Post
                        </button>
                        <button type="button" onClick={() => setManagePostsOpen(true)} className="rounded-full border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                          Manage My Posts
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
                    <div className="space-y-5">
                      <div className="rounded-[32px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_160px_160px]">
                          <label className="relative block">
                            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input value={forumSearch} onChange={(event) => setForumSearch(event.target.value)} placeholder="Search by title, topic, or author" className="w-full rounded-2xl border border-slate-200 bg-[#fafbff] px-11 py-3 text-sm outline-none transition focus:border-blue-500" />
                          </label>

                          <select value={forumCategory} onChange={(event) => setForumCategory(event.target.value)} className="rounded-2xl border border-slate-200 bg-[#fafbff] px-4 py-3 text-sm outline-none transition focus:border-blue-500">
                            <option value="all">All Categories</option>
                            {forumCategories.map((category) => (
                              <option key={category} value={category}>
                                {category}
                              </option>
                            ))}
                          </select>

                          <select value={programFilter} onChange={(event) => { setProgramFilter(event.target.value); }} className="rounded-2xl border border-slate-200 bg-[#fafbff] px-4 py-3 text-sm outline-none transition focus:border-blue-500">
                            <option value="all">All Programs</option>
                            <option value="BSCS">BSCS</option>
                            <option value="ACT">ACT</option>
                            <option value="BSHM">BSHM</option>
                            <option value="BSED">BSED</option>
                            <option value="BEED">BEED</option>
                          </select>

                          <select value={yearFilter} onChange={(event) => { setYearFilter(event.target.value); }} className="rounded-2xl border border-slate-200 bg-[#fafbff] px-4 py-3 text-sm outline-none transition focus:border-blue-500">
                            <option value="">All Years</option>
                            <option value="2021">2021</option>
                            <option value="2022">2022</option>
                            <option value="2023">2023</option>
                            <option value="2024">2024</option>
                            <option value="2025">2025</option>
                          </select>
                        </div>
                      </div>

                      {filteredForumPosts.length === 0 ? (
                        <div className="rounded-[32px] border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
                          No approved discussions match this view yet.
                        </div>
                      ) : (
                        filteredForumPosts.map((post) => (
                          <article key={post.id} className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
                            <div className="flex items-start justify-between gap-4 px-5 py-5 sm:px-6">
                              <div className="flex min-w-0 items-center gap-3">
                                <Avatar src={resolveAssetUrl(post.author_profile_image_path)} label={post.author_name} size="md" />
                                <div className="min-w-0">
                                  <button type="button" onClick={() => void loadPostDetail(post.id)} className="truncate text-left text-sm font-semibold text-slate-900 hover:text-blue-700">
                                    {post.author_name}
                                  </button>
                                  <p className="truncate text-xs text-slate-500">
                                    {post.author_program_code || post.author_program_name || 'Graduate'} - {formatRelativeTime(post.created_at)}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-700">{post.category}</span>
                                {post.graduate_id !== currentGraduateId && (
                                  <button type="button" onClick={() => void createDirectChat(post.graduate_id)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                    Message
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="px-5 pb-5 sm:px-6">
                              <button type="button" onClick={() => void loadPostDetail(post.id)} className="w-full text-left">
                                <h3 className="text-xl font-bold text-slate-900">{post.title}</h3>
                                <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-700">{previewText(post.content)}</p>
                              </button>
                              <ForumMediaGrid post={post} onOpen={(index) => openMediaViewer(post, index)} />
                            </div>

                            <div className="flex flex-wrap items-center gap-5 border-t border-slate-100 px-5 py-4 sm:px-6">
                              <button type="button" onClick={() => void toggleLike(post.id)} disabled={forumActionKey === `like-${post.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 transition hover:text-rose-500 disabled:opacity-60">
                                <Heart className={`h-5 w-5 ${post.is_liked ? 'fill-current text-rose-500' : 'text-slate-500'}`} />
                                {post.like_count}
                              </button>

                              <button type="button" onClick={() => void loadPostDetail(post.id)} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 transition hover:text-blue-700">
                                <MessageCircle className="h-5 w-5 text-slate-500" />
                                {post.comment_count} comment{post.comment_count === 1 ? '' : 's'}
                              </button>

                              {post.graduate_id !== currentGraduateId && (
                                <button type="button" onClick={() => openReportModal({ target_type: 'post', target_id: post.id, label: post.title })} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 transition hover:text-amber-700">
                                  <Flag className="h-5 w-5 text-slate-500" />
                                  Report
                                </button>
                              )}

                              <span className="text-xs text-slate-400">Posted {formatDateTime(post.created_at)}</span>
                            </div>
                          </article>
                        ))
                      )}
                    </div>

                    <div className="space-y-5">
                      <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-24">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h2 className="text-xl font-bold text-slate-900">Chats</h2>
                            <p className="text-sm text-slate-500">Direct and group conversations inside the forum.</p>
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => openChatModal('direct')} className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                              New Chat
                            </button>
                            <button type="button" onClick={() => openChatModal('group')} className="rounded-full bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800">
                              Group Chat
                            </button>
                          </div>
                        </div>

                        <div className="mt-4 rounded-3xl bg-[#fafbff] p-3">
                          <label className="relative block">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input value={chatSearch} onChange={(event) => setChatSearch(event.target.value)} placeholder="Search chats" className="w-full rounded-2xl border border-slate-200 bg-white px-10 py-2.5 text-sm outline-none transition focus:border-blue-500" />
                          </label>

                          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                            {filteredRooms.length === 0 ? (
                              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                                No chat rooms yet. Start a direct message or create a group chat.
                              </div>
                            ) : (
                              filteredRooms.map((room) => {
                                const active = selectedRoomId === room.id;

                                return (
                                  <button key={room.id} type="button" onClick={() => setSelectedRoomId(room.id)} className={`flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition ${active ? 'border-blue-200 bg-blue-50' : 'border-transparent bg-white hover:border-slate-200 hover:bg-slate-50'}`}>
                                    <Avatar src={resolveAssetUrl(getRoomOtherParticipants(room, currentGraduateId)[0]?.profile_image_path || room.participants[0]?.profile_image_path)} label={getRoomLabel(room, currentGraduateId)} size="sm" />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-start justify-between gap-3">
                                        <p className="truncate text-sm font-semibold text-slate-900">{getRoomLabel(room, currentGraduateId)}</p>
                                        <span className="shrink-0 text-[11px] text-slate-400">{formatRelativeTime(room.last_message_at || room.updated_at)}</span>
                                      </div>
                                      <p className="truncate text-xs text-slate-500">{getRoomSubtitle(room, currentGraduateId)}</p>
                                      <p className="mt-1 truncate text-xs text-slate-500">{room.last_message || 'No messages yet'}</p>
                                    </div>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>

                        <div className="mt-5 overflow-hidden rounded-[28px] border border-slate-200">
                          <div className="border-b border-slate-100 bg-white px-4 py-4">
                            {activeRoom ? (
                              <div className="flex items-center gap-3">
                                <Avatar src={resolveAssetUrl(getRoomOtherParticipants(activeRoom, currentGraduateId)[0]?.profile_image_path || activeRoom.participants[0]?.profile_image_path)} label={getRoomLabel(activeRoom, currentGraduateId)} size="md" />
                                <div className="min-w-0">
                                  <p className="truncate font-semibold text-slate-900">{getRoomLabel(activeRoom, currentGraduateId)}</p>
                                  <p className="truncate text-xs text-slate-500">{getRoomSubtitle(activeRoom, currentGraduateId)}</p>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <p className="font-semibold text-slate-900">Select a chat</p>
                                <p className="text-xs text-slate-500">Your messages will appear here.</p>
                              </div>
                            )}
                          </div>

                          <div className="h-[320px] bg-[#fcfcfe]">
                            {roomLoading ? (
                              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Loading conversation...
                              </div>
                            ) : activeRoom ? (
                              <div className="flex h-full flex-col">
                                <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                                  {roomMessages.length === 0 ? (
                                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                                      No messages yet. Say hello and start the conversation.
                                    </div>
                                  ) : (
                                    roomMessages.map((message) => (
                                      <div key={message.id} className={`flex ${message.is_mine ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[82%] rounded-3xl px-4 py-3 text-sm shadow-sm ${message.is_mine ? 'bg-blue-700 text-white' : 'border border-slate-200 bg-white text-slate-800'}`}>
                                          {!message.is_mine && <p className="mb-1 text-xs font-semibold text-slate-500">{message.sender_name}</p>}
                                          <p className="whitespace-pre-line leading-6">{message.message}</p>
                                          <p className={`mt-2 text-[11px] ${message.is_mine ? 'text-blue-100' : 'text-slate-400'}`}>{formatRelativeTime(message.created_at)}</p>
                                        </div>
                                      </div>
                                    ))
                                  )}
                                  <div ref={chatEndRef} />
                                </div>

                                <form onSubmit={handleSendMessage} className="border-t border-slate-100 bg-white p-3">
                                  <div className="flex items-end gap-2">
                                    <textarea value={chatMessageDraft} onChange={(event) => setChatMessageDraft(event.target.value)} rows={2} placeholder="Type a message..." className="min-h-[52px] flex-1 resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500" />
                                    <button type="submit" disabled={chatSending || !chatMessageDraft.trim()} className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-700 text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60" aria-label="Send message">
                                      {chatSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                    </button>
                                  </div>
                                </form>
                              </div>
                            ) : (
                              <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
                                Pick a room from your chats list to read and send messages.
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <h3 className="text-sm font-bold text-slate-900">Activity Logs</h3>
                              <p className="text-xs text-slate-500">Your recent reactions and comments.</p>
                            </div>
                          </div>

                          {activityLogs.length === 0 ? (
                            <p className="mt-4 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500">
                              No forum activity yet.
                            </p>
                          ) : (
                            <div className="mt-4 space-y-3">
                              {activityLogs.map((activity) => (
                                <div key={activity.id} className="rounded-lg bg-slate-50 px-3 py-2">
                                  <p className="text-sm font-medium text-slate-700">{formatActivityLabel(activity)}</p>
                                  <p className="mt-1 text-xs text-slate-400">{formatRelativeTime(activity.created_at)}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {activeTab === 'messages' && renderChatWorkspace('direct')}

              {activeTab === 'group_chats' && renderChatWorkspace('group')}

              {activeTab === 'jobs' && (
                <section className="space-y-5">
                  <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h2 className="text-2xl font-bold text-slate-900">Browse Jobs</h2>
                        <p className="text-sm text-slate-500">Approved job opportunities stay separate from Community Forum discussions.</p>
                      </div>
                      <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
                        {filteredJobs.length} job{filteredJobs.length === 1 ? '' : 's'}
                      </div>
                    </div>

                    <label className="relative mt-4 block">
                      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input value={jobSearch} onChange={(event) => setJobSearch(event.target.value)} placeholder="Search jobs by title, company, skills, location, or program fit" className="w-full rounded-2xl border border-slate-200 bg-[#fafbff] px-11 py-3 text-sm outline-none transition focus:border-blue-500" />
                    </label>
                  </div>

                  {filteredJobs.length === 0 ? (
                    <div className="rounded-[32px] border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
                      No approved jobs match your search right now.
                    </div>
                  ) : (
                    <div className="grid gap-5 xl:grid-cols-2">
                      {filteredJobs.map((job) => {
                        const applicationLink = normalizeApplicationLink(job.application_link);

                        return (
                          <article key={job.id} className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <h3 className="text-xl font-bold text-slate-900">{job.title}</h3>
                                <p className="mt-1 text-sm text-slate-500">{job.company}</p>
                              </div>
                              <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                {formatEmploymentType(job.job_type)}
                              </span>
                            </div>

                            <p className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-700">{job.description || 'No description provided yet.'}</p>

                            <div className="mt-5 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                              <MetaRow icon={MapPin} label="Location" value={job.location || 'Not specified'} />
                              <MetaRow icon={Building2} label="Industry" value={job.industry || 'Not specified'} />
                              <MetaRow icon={Calendar} label="Deadline" value={job.application_deadline || 'Open until filled'} />
                              <MetaRow icon={Briefcase} label="Program Fit" value={job.course_program_fit || job.poster_program_code || job.poster_program_name || 'Open to eligible graduates'} />
                            </div>

                            <div className="mt-5 rounded-[24px] border border-slate-100 bg-slate-50 p-4 text-sm">
                              <p className="font-semibold text-slate-900">How to apply</p>
                              <div className="mt-2 space-y-2 text-slate-600">
                                {job.contact_email && (
                                  <a href={`mailto:${job.contact_email}`} className="block text-blue-700 hover:underline">
                                    Email: {job.contact_email}
                                  </a>
                                )}
                                {applicationLink && (
                                  <a href={applicationLink} target="_blank" rel="noreferrer" className="block text-blue-700 hover:underline">
                                    Open application link
                                  </a>
                                )}
                                {job.application_method && <p className="whitespace-pre-line">{job.application_method}</p>}
                                {!job.contact_email && !applicationLink && !job.application_method && <p>No application contact details were provided.</p>}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {activeTab === 'job_posting' && (
                <section className="space-y-6">
                  {!showJobPostForm && (
                    <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <h2 className="text-2xl font-bold text-slate-900">Job Posting</h2>
                          <p className="text-sm text-slate-500">This stays as a separate module from the Community Forum.</p>
                        </div>
                        <button type="button" onClick={beginCreateJob} disabled={!canPostJobs} className="inline-flex items-center gap-2 rounded-full bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
                          <Plus className="h-4 w-4" />
                          Create Job Post
                        </button>
                      </div>

                      {!canPostJobs && (
                        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                          Job posting requires your employment status to be set as employed.
                        </div>
                      )}
                    </div>
                  )}

                  {showJobPostForm && (
                    <form onSubmit={handleJobSubmit} className="space-y-5 rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <h2 className="text-2xl font-bold text-slate-900">{myJobForm.id ? 'Edit Job Post' : 'Create Job Post'}</h2>
                          <p className="text-sm text-slate-500">Approved active job posts appear in Browse Jobs after review.</p>
                        </div>
                        <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                          Posted as {user?.program_code || user?.program_name || 'Graduate'}
                        </span>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Job Title" required>
                          <input value={myJobForm.title} onChange={(event) => setMyJobForm((current) => ({ ...current, title: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500" />
                        </Field>
                        <Field label="Company Name" required>
                          <input value={myJobForm.company} onChange={(event) => setMyJobForm((current) => ({ ...current, company: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500" />
                        </Field>
                      </div>

                      <div className="grid gap-4 md:grid-cols-3">
                        <Field label="Location">
                          <input value={myJobForm.location} onChange={(event) => setMyJobForm((current) => ({ ...current, location: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500" />
                        </Field>
                        <Field label="Salary Range">
                          <input value={myJobForm.salary_range} onChange={(event) => setMyJobForm((current) => ({ ...current, salary_range: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500" />
                        </Field>
                        <Field label="Employment Type">
                          <select value={myJobForm.job_type} onChange={(event) => setMyJobForm((current) => ({ ...current, job_type: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500">
                            <option value="full_time">Full time</option>
                            <option value="part_time">Part time</option>
                            <option value="contract">Contract</option>
                            <option value="internship">Internship</option>
                            <option value="remote">Remote</option>
                          </select>
                        </Field>
                      </div>

                      <Field label="Description" required>
                        <textarea value={myJobForm.description} onChange={(event) => setMyJobForm((current) => ({ ...current, description: event.target.value }))} rows={5} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500" />
                      </Field>

                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Required Skills">
                          <textarea value={myJobForm.required_skills} onChange={(event) => setMyJobForm((current) => ({ ...current, required_skills: event.target.value }))} rows={3} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500" />
                        </Field>
                        <Field label="Course / Program Fit">
                          <textarea value={myJobForm.course_program_fit} onChange={(event) => setMyJobForm((current) => ({ ...current, course_program_fit: event.target.value }))} rows={3} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500" />
                        </Field>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Application Deadline">
                          <input type="date" value={myJobForm.application_deadline} onChange={(event) => setMyJobForm((current) => ({ ...current, application_deadline: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500" />
                        </Field>
                        <Field label="Contact Email">
                          <input type="email" value={myJobForm.contact_email} onChange={(event) => setMyJobForm((current) => ({ ...current, contact_email: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500" />
                        </Field>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <Field label="Application Link">
                          <input value={myJobForm.application_link} onChange={(event) => setMyJobForm((current) => ({ ...current, application_link: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500" />
                        </Field>
                        <Field label="Other Contact Details">
                          <input value={myJobForm.application_method} onChange={(event) => setMyJobForm((current) => ({ ...current, application_method: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500" />
                        </Field>
                      </div>

                      <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        <input type="checkbox" checked={myJobForm.is_active} onChange={(event) => setMyJobForm((current) => ({ ...current, is_active: event.target.checked }))} />
                        Job remains active after approval
                      </label>

                      <div className="flex flex-wrap gap-3">
                        <button type="submit" disabled={jobSubmitting} className="inline-flex items-center gap-2 rounded-full bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
                          {jobSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                          {myJobForm.id ? 'Submit Updated Job' : 'Submit Job Post'}
                        </button>

                        <button type="button" onClick={closeJobForm} className="rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h2 className="text-2xl font-bold text-slate-900">My Job Posts</h2>
                        <p className="text-sm text-slate-500">Manage your existing Job Posting submissions here.</p>
                      </div>
                      <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
                        {myPostedJobs.length} post{myPostedJobs.length === 1 ? '' : 's'}
                      </div>
                    </div>

                    {myPostedJobs.length === 0 ? (
                      <div className="mt-5 rounded-3xl border border-dashed border-slate-300 px-6 py-10 text-center text-sm text-slate-500">
                        You have not created any job posts yet.
                      </div>
                    ) : (
                      <div className="mt-5 grid gap-4 xl:grid-cols-2">
                        {myPostedJobs.map((job) => (
                          <article key={job.id} className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <h3 className="text-lg font-bold text-slate-900">{job.title}</h3>
                                <p className="text-sm text-slate-500">{job.company}</p>
                              </div>
                              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${approvalStatusClass(job.approval_status)}`}>
                                {formatApprovalStatus(job.approval_status)}
                              </span>
                            </div>

                            <div className="mt-4 space-y-2 text-sm text-slate-600">
                              <p>
                                {job.location || 'No location set'} - {formatEmploymentType(job.job_type)}
                              </p>
                              <p>Salary: {job.salary_range || 'Not specified'}</p>
                              <p>
                                Program fit: {job.course_program_fit || job.poster_program_code || job.poster_program_name || 'Not specified'}
                              </p>
                              <p>Active: {job.is_active ? 'Yes' : 'No'}</p>
                              {job.approval_notes && <p className="whitespace-pre-line text-rose-600">Review notes: {job.approval_notes}</p>}
                            </div>

                            <div className="mt-5 flex flex-wrap gap-2">
                              <button type="button" onClick={() => void beginEditJob(job.id)} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                                <Pencil className="h-4 w-4" />
                                Edit
                              </button>
                              <button type="button" onClick={() => handleDeleteJob(job)} className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100">
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {activeTab === 'my_profile' && (
                <section className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900">My Profile</h2>
                      <p className="text-sm text-slate-500">Manage your graduate account information and password.</p>
                    </div>
                    {!profileIsEditing ? (
                      <button type="button" onClick={() => setProfileIsEditing(true)} className="inline-flex items-center gap-2 rounded-full bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800">
                        <Pencil className="h-4 w-4" />
                        Edit Profile
                      </button>
                    ) : (
                      <button type="button" onClick={cancelProfileEditing} className="rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        Cancel Editing
                      </button>
                    )}
                  </div>

                  <form onSubmit={handleProfileSave} className="space-y-5">
                    <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
                      <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                        <div className="flex flex-col items-center text-center">
                          <Avatar src={profileImagePreview || currentProfileImageUrl} label={user?.full_name} size="xl" />
                          <h3 className="mt-4 text-xl font-bold text-slate-900">{user?.full_name || 'Graduate User'}</h3>
                          <p className="text-sm text-slate-500">{user?.program_name || user?.program_code || 'Graduate'}</p>
                          <p className="mt-1 text-xs text-slate-400">Class of {user?.year_graduated || 'N/A'}</p>
                        </div>

                        <input
                          ref={profileImageInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0] || null;
                            if (!file) {
                              setProfileImageFile(null);
                              setProfileImagePreview(currentProfileImageUrl);
                              return;
                            }

                            setProfileImageFile(file);
                            setProfileImagePreview(URL.createObjectURL(file));
                          }}
                        />

                        <button type="button" onClick={() => profileIsEditing && profileImageInputRef.current?.click()} disabled={!profileIsEditing} className="mt-5 w-full rounded-full border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
                          {profileImageFile ? 'Change Selected Photo' : 'Upload Profile Photo'}
                        </button>
                        <p className="mt-2 text-center text-xs text-slate-400">PNG, JPG, WEBP, or GIF up to 5 MB</p>
                      </div>

                      <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                        <div className="grid gap-4 md:grid-cols-3">
                          <Field label="First Name">
                            <input value={profileForm.first_name} readOnly={!profileIsEditing} onChange={(event) => setProfileForm((current) => ({ ...current, first_name: event.target.value }))} className={profileInputClass} />
                          </Field>
                          <Field label="Middle Name">
                            <input value={profileForm.middle_name} readOnly={!profileIsEditing} onChange={(event) => setProfileForm((current) => ({ ...current, middle_name: event.target.value }))} className={profileInputClass} />
                          </Field>
                          <Field label="Last Name">
                            <input value={profileForm.last_name} readOnly={!profileIsEditing} onChange={(event) => setProfileForm((current) => ({ ...current, last_name: event.target.value }))} className={profileInputClass} />
                          </Field>
                        </div>

                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <Field label="Email Address">
                            <input type="email" value={profileForm.email} readOnly={!profileIsEditing} onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))} className={profileInputClass} />
                          </Field>
                          <Field label="Phone Number">
                            <input value={profileForm.phone} readOnly={!profileIsEditing} onChange={(event) => setProfileForm((current) => ({ ...current, phone: event.target.value }))} className={profileInputClass} />
                          </Field>
                        </div>

                        <div className="mt-4">
                          <Field label="Address">
                            <textarea value={profileForm.address} readOnly={!profileIsEditing} onChange={(event) => setProfileForm((current) => ({ ...current, address: event.target.value }))} rows={4} className={profileInputClass} />
                          </Field>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
                      <h3 className="text-lg font-bold text-slate-900">Password Settings</h3>
                      <p className="mt-1 text-sm text-slate-500">Leave these blank if you are not changing your password.</p>

                      <div className="mt-5 grid gap-4 md:grid-cols-3">
                        <ProfilePasswordInput label="Current Password" value={profileForm.current_password} readOnly={!profileIsEditing} inputClassName={profileInputClass} onChange={(value) => setProfileForm((current) => ({ ...current, current_password: value }))} />
                        <ProfilePasswordInput label="New Password" value={profileForm.password} readOnly={!profileIsEditing} inputClassName={profileInputClass} onChange={(value) => setProfileForm((current) => ({ ...current, password: value }))} />
                        <ProfilePasswordInput label="Confirm Password" value={profileForm.confirm_password} readOnly={!profileIsEditing} inputClassName={profileInputClass} onChange={(value) => setProfileForm((current) => ({ ...current, confirm_password: value }))} />
                      </div>

                      <div className="mt-6 flex flex-wrap gap-3">
                        <button type="submit" disabled={!profileIsEditing} className="rounded-full bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
                          Save Changes
                        </button>
                        {profileIsEditing && (
                          <button type="button" onClick={cancelProfileEditing} className="rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                  </form>
                </section>
              )}
            </>
          )}
      </main>

      {forumComposerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6">
          <form onSubmit={handleForumSubmit} className="max-h-[92vh] w-full max-w-2xl space-y-5 overflow-y-auto rounded-[32px] border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{forumForm.id ? 'Edit Forum Post' : 'Create Forum Post'}</h2>
                <p className="text-sm text-slate-500">Posts are reviewed before they appear in the public Community Forum feed.</p>
              </div>
              <button type="button" onClick={closeForumComposer} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100" aria-label="Close post composer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <Field label="Title" required>
              <input value={forumForm.title} onChange={(event) => setForumForm((current) => ({ ...current, title: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500" />
            </Field>

            <Field label="Category" required>
              <select value={forumForm.category} onChange={(event) => setForumForm((current) => ({ ...current, category: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500">
                {forumCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Content" required>
              <textarea value={forumForm.content} onChange={(event) => setForumForm((current) => ({ ...current, content: event.target.value }))} rows={8} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500" />
            </Field>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <input
                ref={forumMediaInputRef}
                type="file"
                accept={forumMediaAccept}
                multiple
                className="hidden"
                onChange={(event) => handleForumMediaSelection(event.target.files)}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Post Media</p>
                  <p className="text-xs text-slate-500">Up to 10 photos/videos. Images up to 5 MB, videos up to 50 MB.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => forumMediaInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                    <ImagePlus className="h-4 w-4" />
                    {forumMediaFiles.length > 0 || forumForm.media.length > 0 ? 'Replace Media' : 'Add Media'}
                  </button>
                  {(forumMediaFiles.length > 0 || (forumForm.media.length > 0 && !forumForm.remove_media)) && (
                    <button
                      type="button"
                      onClick={() => {
                        setForumMediaFiles([]);
                        setForumForm((current) => ({ ...current, remove_media: current.media.length > 0 }));
                        if (forumMediaInputRef.current) {
                          forumMediaInputRef.current.value = '';
                        }
                      }}
                      className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              {forumMediaFiles.length > 0 && (
                <SelectedMediaPreview files={forumMediaFiles} />
              )}
              {forumMediaFiles.length === 0 && forumForm.media.length > 0 && !forumForm.remove_media && (
                <StaticMediaPreview media={forumForm.media} />
              )}
              {forumForm.remove_media && <p className="mt-3 text-sm text-rose-600">The current attachments will be removed after saving.</p>}
            </div>

            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={forumSubmitting || aiModerating} className="inline-flex items-center gap-2 rounded-full bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
                {(forumSubmitting || aiModerating) && <Loader2 className="h-4 w-4 animate-spin" />}
                {aiModerating ? 'Checking Post...' : forumForm.id ? 'Update Post' : 'Submit Post'}
              </button>
              <button type="button" onClick={closeForumComposer} className="rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {managePostsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-[32px] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Manage My Posts</h2>
                <p className="text-sm text-slate-500">Edit or delete only the forum posts you created.</p>
              </div>
              <button type="button" onClick={() => setManagePostsOpen(false)} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100" aria-label="Close manage posts">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-3 border-b border-slate-100 px-6 py-5 md:grid-cols-3">
              <SummaryPill label="Pending" value={pendingForumPostsCount} className="border-amber-200 bg-amber-50 text-amber-700" />
              <SummaryPill label="Approved" value={approvedForumPostsCount} className="border-emerald-200 bg-emerald-50 text-emerald-700" />
              <SummaryPill label="Hidden" value={hiddenForumPostsCount} className="border-rose-200 bg-rose-50 text-rose-700" />
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {myForumPosts.length === 0 ? (
                <div className="rounded-[28px] border border-dashed border-slate-300 px-6 py-10 text-center text-sm text-slate-500">
                  You have not created any forum posts yet.
                </div>
              ) : (
                myForumPosts.map((post) => (
                  <article key={post.id} className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-bold text-slate-900">{post.title}</h3>
                          <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${forumStatusClass(post.status)}`}>{post.status.toUpperCase()}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {post.category} - Updated {formatRelativeTime(post.updated_at)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => { setManagePostsOpen(false); void loadPostDetail(post.id); }} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                          View
                        </button>
                        <button type="button" onClick={() => openForumComposer(post)} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                          <Pencil className="h-4 w-4" />
                          Edit
                        </button>
                        <button type="button" onClick={() => handleForumDelete(post)} disabled={forumActionKey === `delete-${post.id}`} className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60">
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    </div>

                    <p className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-700">{previewText(post.content, 260)}</p>
                    <ForumMediaGrid post={post} compact onOpen={(index) => openMediaViewer(post, index)} />
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {mediaViewer && (
        <ForumMediaViewer
          viewer={mediaViewer}
          zoom={mediaViewerZoom}
          comments={mediaViewerComments}
          commentsLoading={mediaViewerCommentsLoading}
          commentDraft={mediaViewerCommentDraft}
          commentSubmitting={mediaViewerCommentSubmitting}
          onClose={closeMediaViewer}
          onMove={moveMediaViewer}
          onZoomIn={() => setMediaViewerZoom((current) => Math.min(3, current + 0.25))}
          onZoomOut={() => setMediaViewerZoom((current) => Math.max(0.5, current - 0.25))}
          onZoomReset={() => setMediaViewerZoom(1)}
          onCommentDraftChange={setMediaViewerCommentDraft}
          onCommentSubmit={handleMediaViewerCommentSubmit}
        />
      )}

      {selectedPostOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div className="min-w-0">
                <h2 className="truncate text-2xl font-bold text-slate-900">{selectedPost?.title || 'Forum Post'}</h2>
                {selectedPost && (
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedPost.author_name} - {selectedPost.author_program_code || selectedPost.author_program_name || 'Graduate'} - {formatDateTime(selectedPost.created_at)}
                  </p>
                )}
              </div>
              <button type="button" onClick={() => setSelectedPostOpen(false)} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100" aria-label="Close post details">
                <X className="h-5 w-5" />
              </button>
            </div>

            {selectedPostLoading ? (
              <div className="flex min-h-[260px] items-center justify-center text-sm text-slate-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading post details...
              </div>
            ) : selectedPost ? (
              <div className="grid flex-1 gap-0 overflow-hidden xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="overflow-y-auto px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Avatar src={resolveAssetUrl(selectedPost.author_profile_image_path)} label={selectedPost.author_name} size="md" />
                      <div>
                        <p className="font-semibold text-slate-900">{selectedPost.author_name}</p>
                        <p className="text-xs text-slate-500">{selectedPost.category}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {selectedPost.graduate_id !== currentGraduateId && (
                        <>
                          <button type="button" onClick={() => void createDirectChat(selectedPost.graduate_id)} className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                            Message Author
                          </button>
                          <button type="button" onClick={() => openReportModal({ target_type: 'post', target_id: selectedPost.id, label: selectedPost.title })} className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100">
                            <Flag className="h-3.5 w-3.5" />
                            Report
                          </button>
                        </>
                      )}
                      {selectedPost.graduate_id === currentGraduateId && (
                        <>
                          <button type="button" onClick={() => openForumComposer(selectedPost)} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                            <Pencil className="h-4 w-4" />
                            Edit
                          </button>
                          <button type="button" onClick={() => handleForumDelete(selectedPost)} className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100">
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <p className="mt-6 whitespace-pre-line text-sm leading-8 text-slate-700">{selectedPost.content}</p>
                  <ForumMediaGrid post={selectedPost} detail onOpen={(index) => openMediaViewer(selectedPost, index)} />

                  <div className="mt-6 flex flex-wrap items-center gap-5 border-t border-slate-100 pt-5">
                    <button type="button" onClick={() => void toggleLike(selectedPost.id)} disabled={forumActionKey === `like-${selectedPost.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-rose-500 disabled:opacity-60">
                      <Heart className={`h-5 w-5 ${selectedPost.is_liked ? 'fill-current text-rose-500' : 'text-slate-500'}`} />
                      {selectedPost.like_count} reaction{selectedPost.like_count === 1 ? '' : 's'}
                    </button>
                    <span className="text-sm text-slate-500">
                      {postComments.length} comment{postComments.length === 1 ? '' : 's'}
                    </span>
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${forumStatusClass(selectedPost.status)}`}>{selectedPost.status.toUpperCase()}</span>
                  </div>
                </div>

                <div className="border-l border-slate-100 bg-[#fafbff]">
                  <div className="border-b border-slate-100 px-5 py-4">
                    <h3 className="text-lg font-bold text-slate-900">Comments</h3>
                    <p className="text-sm text-slate-500">Join the discussion on this post.</p>
                  </div>

                  <div className="max-h-[360px] space-y-4 overflow-y-auto px-5 py-5">
                    {postComments.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
                        No comments yet. Be the first to reply.
                      </div>
                    ) : (
                      postComments.map((comment) => (
                        <article key={comment.id} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex items-start gap-3">
                            <Avatar src={resolveAssetUrl(comment.commenter_profile_image_path)} label={comment.commenter_name} size="sm" />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-slate-900">{comment.commenter_name}</p>
                                <span className="text-xs text-slate-400">{formatRelativeTime(comment.created_at)}</span>
                              </div>
                              <p className="text-xs text-slate-500">{comment.commenter_program_code || comment.commenter_program_name || 'Graduate'}</p>
                              <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-700">{comment.comment}</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {comment.graduate_id !== currentGraduateId && (
                                  <>
                                    <button type="button" onClick={() => void createDirectChat(comment.graduate_id)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                      Message
                                    </button>
                                    <button type="button" onClick={() => openReportModal({ target_type: 'comment', target_id: comment.id, label: 'this comment' })} className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100">
                                      <Flag className="h-3.5 w-3.5" />
                                      Report
                                    </button>
                                  </>
                                )}
                                {comment.graduate_id === currentGraduateId && (
                                  <button type="button" onClick={() => handleDeleteComment(comment)} className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100">
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Delete
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </article>
                      ))
                    )}
                  </div>

                  <form onSubmit={handleCommentSubmit} className="border-t border-slate-100 bg-white p-4">
                    <textarea value={commentDraft} onChange={(event) => setCommentDraft(event.target.value)} rows={4} placeholder="Write a comment..." className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500" />
                    <div className="mt-3 flex justify-end">
                      <button type="submit" disabled={commentSubmitting || !commentDraft.trim()} className="inline-flex items-center gap-2 rounded-full bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
                        {commentSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                        Post Comment
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[260px] items-center justify-center text-sm text-slate-500">Post not found.</div>
            )}
          </div>
        </div>
      )}

      {chatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6">
          <form onSubmit={handleCreateChat} className="w-full max-w-2xl rounded-[32px] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{chatModalMode === 'group' ? 'Create Group Chat' : 'Start Direct Chat'}</h2>
                <p className="text-sm text-slate-500">
                  {chatModalMode === 'group'
                    ? 'Choose multiple graduates and give your chat a name.'
                    : 'Pick one graduate to start a private conversation.'}
                </p>
              </div>
              <button type="button" onClick={() => setChatModalOpen(false)} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100" aria-label="Close chat creator">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 px-6 py-5">
              <div className="flex gap-2">
                <button type="button" onClick={() => { setChatModalMode('direct'); setChatModalName(''); setChatModalSelectedIds([]); }} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${chatModalMode === 'direct' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700'}`}>
                  Direct
                </button>
                <button type="button" onClick={() => { setChatModalMode('group'); setChatModalSelectedIds([]); }} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${chatModalMode === 'group' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700'}`}>
                  Group
                </button>
              </div>

              {chatModalMode === 'group' && (
                <Field label="Group Chat Name" required>
                  <input value={chatModalName} onChange={(event) => setChatModalName(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500" />
                </Field>
              )}

              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={chatModalSearch} onChange={(event) => setChatModalSearch(event.target.value)} placeholder="Search graduates" className="w-full rounded-2xl border border-slate-200 bg-[#fafbff] px-11 py-3 text-sm outline-none transition focus:border-blue-500" />
              </label>

              <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {filteredDirectory.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                    No graduates match your search.
                  </div>
                ) : (
                  filteredDirectory.map((participant) => {
                    const selected = chatModalSelectedIds.includes(participant.graduate_id);

                    return (
                      <label key={participant.graduate_id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition ${selected ? 'border-blue-200 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                        <input
                          type={chatModalMode === 'group' ? 'checkbox' : 'radio'}
                          name="chat_participant"
                          checked={selected}
                          onChange={() => {
                            if (chatModalMode === 'group') {
                              setChatModalSelectedIds((current) =>
                                current.includes(participant.graduate_id)
                                  ? current.filter((id) => id !== participant.graduate_id)
                                  : [...current, participant.graduate_id],
                              );
                            } else {
                              setChatModalSelectedIds([participant.graduate_id]);
                            }
                          }}
                        />
                        <Avatar src={resolveAssetUrl(participant.profile_image_path)} label={participant.full_name} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">{participant.full_name}</p>
                          <p className="text-xs text-slate-500">{participant.program_code || 'Graduate'}</p>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 px-6 py-5">
              <button type="button" onClick={() => setChatModalOpen(false)} className="rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={chatCreating} className="inline-flex items-center gap-2 rounded-full bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
                {chatCreating && <Loader2 className="h-4 w-4 animate-spin" />}
                {chatModalMode === 'group' ? 'Create Group Chat' : 'Open Direct Chat'}
              </button>
            </div>
          </form>
        </div>
      )}

      {reportTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6">
          <form onSubmit={handleSubmitReport} className="w-full max-w-lg rounded-[32px] border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Report Content</h2>
                <p className="text-sm text-slate-500">Send {reportTarget.label} to moderators for review.</p>
              </div>
              <button type="button" onClick={closeReportModal} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100" aria-label="Close report form">
                <X className="h-5 w-5" />
              </button>
            </div>

            <Field label="Reason">
              <textarea
                value={reportReason}
                onChange={(event) => setReportReason(event.target.value)}
                rows={5}
                maxLength={1000}
                placeholder="Optional details for the moderator"
                className="mt-4 w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500"
              />
            </Field>

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button type="button" onClick={closeReportModal} className="rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={reportSubmitting} className="inline-flex items-center gap-2 rounded-full bg-amber-600 px-5 py-3 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60">
                {reportSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Submit Report
              </button>
            </div>
          </form>
        </div>
      )}

      <MessageBox
        isOpen={msgBox.isOpen}
        onClose={() => setMsgBox((current) => ({ ...current, isOpen: false }))}
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

function Avatar({
  src,
  label,
  size,
}: {
  src?: string | null;
  label?: string | null;
  size: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const sizeClass =
    size === 'sm' ? 'h-10 w-10 text-sm' : size === 'md' ? 'h-12 w-12 text-base' : size === 'lg' ? 'h-14 w-14 text-lg' : 'h-28 w-28 text-3xl';

  if (src) {
    return <img src={src} alt={label || 'Avatar'} className={`${sizeClass} rounded-full object-cover`} />;
  }

  return (
    <div className={`${sizeClass} flex items-center justify-center rounded-full bg-blue-100 font-bold text-blue-800`}>
      {getInitials(label)}
    </div>
  );
}

function DashboardCard({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: number;
  caption: string;
  tone: 'blue' | 'amber' | 'pink' | 'emerald';
}) {
  const toneClass =
    tone === 'amber'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : tone === 'pink'
        ? 'border-pink-200 bg-pink-50 text-pink-800'
        : tone === 'emerald'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-blue-200 bg-blue-50 text-blue-800';

  return (
    <div className={`rounded-[28px] border p-5 shadow-sm ${toneClass}`}>
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      <p className="mt-2 text-xs opacity-80">{caption}</p>
    </div>
  );
}

function InfoTile({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
      <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-7 text-slate-600">{description}</p>
      <button type="button" onClick={onAction} className="mt-4 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">
        {actionLabel}
      </button>
    </div>
  );
}

function StatusRow({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="text-slate-600">{label}</span>
      <span className={`font-semibold ${positive ? 'text-emerald-700' : 'text-amber-700'}`}>{value}</span>
    </div>
  );
}

function SummaryPill({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className={`rounded-[24px] border px-4 py-4 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  );
}

function MetaRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <Icon className="mt-0.5 h-4 w-4 text-slate-400" />
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-1 text-sm text-slate-700">{value}</p>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
        {required ? ' *' : ''}
      </span>
      {children}
    </label>
  );
}

function ForumMediaGrid({
  post,
  compact,
  detail,
  onOpen,
}: {
  post: ForumPost;
  compact?: boolean;
  detail?: boolean;
  onOpen: (index: number) => void;
}) {
  const media = getPostMedia(post);
  if (media.length === 0) return null;

  const visibleMedia = media.slice(0, 4);
  const single = media.length === 1;
  const wrapperClass = single
    ? `${detail ? 'mt-6' : 'mt-4'} overflow-hidden rounded-lg border border-slate-200 bg-black`
    : `${detail ? 'mt-6' : 'mt-4'} grid grid-cols-2 gap-1 overflow-hidden rounded-lg border border-slate-200 bg-slate-200`;

  return (
    <div className={wrapperClass}>
      {visibleMedia.map((item, index) => (
        <button
          key={`${item.file_path}-${index}`}
          type="button"
          onClick={() => onOpen(index)}
          className={`group relative block w-full overflow-hidden bg-black text-left ${single ? '' : 'aspect-square'} ${compact && single ? 'max-h-56' : ''}`}
          aria-label={`Open ${item.original_name || post.title}`}
        >
          {isVideoMedia(item) ? (
            <>
              <video src={resolveAssetUrl(item.file_path)} muted playsInline preload="metadata" className={`${single ? 'max-h-[620px]' : 'h-full'} w-full object-cover`} />
              <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-black/55">
                  <Video className="h-5 w-5" />
                </span>
              </span>
            </>
          ) : (
            <img src={resolveAssetUrl(item.file_path)} alt={item.original_name || post.title} className={`${single ? 'max-h-[620px]' : 'h-full'} w-full object-cover transition duration-200 group-hover:scale-[1.02]`} />
          )}
          {index === 3 && media.length > visibleMedia.length && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-3xl font-bold text-white">
              +{media.length - visibleMedia.length}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function SelectedMediaPreview({ files }: { files: File[] }) {
  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files]
  );

  useEffect(() => {
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [previews]);

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {previews.map((preview) => (
        <div key={`${preview.file.name}-${preview.file.size}-${preview.file.lastModified}`} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="aspect-video bg-black">
            {isVideoFile(preview.file) ? (
              <video src={preview.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
            ) : (
              <img src={preview.url} alt={preview.file.name} className="h-full w-full object-cover" />
            )}
          </div>
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-slate-800">{preview.file.name}</p>
            <p className="text-xs text-slate-500">{isVideoFile(preview.file) ? 'Video' : 'Photo'} {formatBytes(preview.file.size)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function StaticMediaPreview({ media }: { media: ForumMedia[] }) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {media.slice(0, 6).map((item, index) => (
        <div key={`${item.file_path}-${index}`} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="aspect-video bg-black">
            {isVideoMedia(item) ? (
              <video src={resolveAssetUrl(item.file_path)} muted playsInline preload="metadata" className="h-full w-full object-cover" />
            ) : (
              <img src={resolveAssetUrl(item.file_path)} alt={item.original_name || 'Forum attachment'} className="h-full w-full object-cover" />
            )}
          </div>
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-slate-800">{item.original_name || 'Forum attachment'}</p>
            <p className="text-xs text-slate-500">{isVideoMedia(item) ? 'Video' : 'Photo'} {formatBytes(item.file_size_bytes)}</p>
          </div>
        </div>
      ))}
      {media.length > 6 && (
        <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-sm font-semibold text-slate-500">
          +{media.length - 6} more
        </div>
      )}
    </div>
  );
}

function ForumMediaViewer({
  viewer,
  zoom,
  comments,
  commentsLoading,
  commentDraft,
  commentSubmitting,
  onClose,
  onMove,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onCommentDraftChange,
  onCommentSubmit,
}: {
  viewer: { post: ForumPost; mediaIndex: number };
  zoom: number;
  comments: ForumComment[];
  commentsLoading: boolean;
  commentDraft: string;
  commentSubmitting: boolean;
  onClose: () => void;
  onMove: (direction: 1 | -1) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onCommentDraftChange: (value: string) => void;
  onCommentSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const media = getPostMedia(viewer.post);
  const current = media[viewer.mediaIndex] || media[0];
  if (!current) return null;

  const isVideo = isVideoMedia(current);
  const canMove = media.length > 1;

  return (
    <div className="fixed inset-0 z-[70] bg-black text-white">
      <div className="absolute left-4 top-4 z-20 flex items-center gap-3">
        <button type="button" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20" aria-label="Close media viewer">
          <X className="h-6 w-6" />
        </button>
        <div className="hidden text-sm font-semibold text-white/80 sm:block">
          {viewer.mediaIndex + 1} of {media.length}
        </div>
      </div>

      {!isVideo && (
        <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
          <button type="button" onClick={onZoomOut} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 backdrop-blur transition hover:bg-white/20" aria-label="Zoom out">
            <ZoomOut className="h-5 w-5" />
          </button>
          <button type="button" onClick={onZoomReset} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 backdrop-blur transition hover:bg-white/20" aria-label="Reset zoom">
            <Maximize2 className="h-5 w-5" />
          </button>
          <button type="button" onClick={onZoomIn} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 backdrop-blur transition hover:bg-white/20" aria-label="Zoom in">
            <ZoomIn className="h-5 w-5" />
          </button>
        </div>
      )}

      <div className="grid h-full lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative flex min-h-0 items-center justify-center overflow-hidden px-4 py-20">
          {canMove && (
            <>
              <button type="button" onClick={() => onMove(-1)} className="absolute left-4 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 backdrop-blur transition hover:bg-white/20" aria-label="Previous media">
                <ChevronLeft className="h-7 w-7" />
              </button>
              <button type="button" onClick={() => onMove(1)} className="absolute right-4 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 backdrop-blur transition hover:bg-white/20" aria-label="Next media">
                <ChevronRight className="h-7 w-7" />
              </button>
            </>
          )}

          {isVideo ? (
            <video src={resolveAssetUrl(current.file_path)} controls autoPlay className="max-h-full max-w-full rounded-lg bg-black" />
          ) : (
            <img
              src={resolveAssetUrl(current.file_path)}
              alt={current.original_name || viewer.post.title}
              className="max-h-full max-w-full select-none rounded-lg object-contain transition-transform duration-150"
              style={{ transform: `scale(${zoom})` }}
            />
          )}
        </div>

        <aside className="hidden min-h-0 border-l border-white/10 bg-white text-slate-900 lg:flex lg:flex-col">
          <div className="border-b border-slate-200 px-5 py-5">
            <p className="text-sm font-semibold text-slate-900">{viewer.post.author_name}</p>
            <p className="mt-1 text-xs text-slate-500">{viewer.post.author_program_code || viewer.post.author_program_name || 'Graduate'} - {formatDateTime(viewer.post.created_at)}</p>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            <h2 className="text-lg font-bold text-slate-900">{viewer.post.title}</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-700">{viewer.post.content}</p>
            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="truncate text-sm font-semibold text-slate-800">{current.original_name || 'Forum attachment'}</p>
              <p className="mt-1 text-xs text-slate-500">{isVideo ? 'Video' : 'Photo'} {formatBytes(current.file_size_bytes)}</p>
            </div>
            {media.length > 1 && (
              <div className="mt-5 grid grid-cols-4 gap-2">
                {media.map((item, index) => (
                  <button
                    key={`${item.file_path}-viewer-${index}`}
                    type="button"
                    onClick={() => {
                      const direction = index > viewer.mediaIndex ? 1 : -1;
                      for (let count = 0; count < Math.abs(index - viewer.mediaIndex); count += 1) {
                        onMove(direction);
                      }
                    }}
                    className={`aspect-square overflow-hidden rounded-lg border ${index === viewer.mediaIndex ? 'border-blue-600 ring-2 ring-blue-200' : 'border-slate-200'}`}
                    aria-label={`Open attachment ${index + 1}`}
                  >
                    {isVideoMedia(item) ? (
                      <div className="flex h-full w-full items-center justify-center bg-slate-900 text-white">
                        <Video className="h-5 w-5" />
                      </div>
                    ) : (
                      <img src={resolveAssetUrl(item.file_path)} alt={item.original_name || `Attachment ${index + 1}`} className="h-full w-full object-cover" />
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-6 border-t border-slate-200 pt-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Comments</h3>
                <span className="text-xs text-slate-500">{comments.length}</span>
              </div>

              <div className="mt-4 space-y-3">
                {commentsLoading ? (
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading comments...
                  </div>
                ) : comments.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
                    No comments yet.
                  </div>
                ) : (
                  comments.map((comment) => (
                    <article key={comment.id} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex items-start gap-3">
                        <Avatar src={resolveAssetUrl(comment.commenter_profile_image_path)} label={comment.commenter_name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">{comment.commenter_name}</p>
                            <span className="text-xs text-slate-400">{formatRelativeTime(comment.created_at)}</span>
                          </div>
                          <p className="text-xs text-slate-500">{comment.commenter_program_code || comment.commenter_program_name || 'Graduate'}</p>
                          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{comment.comment}</p>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          </div>

          <form onSubmit={onCommentSubmit} className="border-t border-slate-200 bg-white px-5 py-4">
            <textarea
              value={commentDraft}
              onChange={(event) => onCommentDraftChange(event.target.value)}
              rows={3}
              placeholder="Write a comment..."
              className="w-full resize-none rounded-lg border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500"
            />
            <div className="mt-3 flex justify-end">
              <button type="submit" disabled={commentSubmitting || !commentDraft.trim()} className="inline-flex items-center gap-2 rounded-full bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
                {commentSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Post Comment
              </button>
            </div>
          </form>
        </aside>
      </div>
    </div>
  );
}

function ProfilePasswordInput({
  label,
  value,
  readOnly,
  inputClassName,
  onChange,
}: {
  label: string;
  value: string;
  readOnly: boolean;
  inputClassName: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <div className="relative">
        <input type={visible ? 'text' : 'password'} value={value} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} className={`${inputClassName} pr-12`} />
        <button type="button" onClick={() => setVisible((current) => !current)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100">
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
    </label>
  );
}
