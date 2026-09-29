import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, Dispatch, ImgHTMLAttributes, SetStateAction } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Award,
  BadgeCheck,
  Banknote,
  Bookmark,
  Briefcase,
  Building2,
  CalendarDays,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Contact,
  FileText,
  Filter,
  Flag,
  GraduationCap,
  Heart,
  Home,
  ImagePlus,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Maximize2,
  Megaphone,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Search,
  Share2,
  SlidersHorizontal,
  Settings,
  ShieldCheck,
  Trash2,
  User,
  Video,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Socket } from 'socket.io-client';
import { API_BASE_URL, API_ENDPOINTS } from '../config/api';
import { obtainApiCsrfToken } from '../lib/installApiSecurity';
import RealtimeMessagingWorkspace from '../components/messaging/RealtimeMessagingWorkspace';
import FloatingChatWindow from '../components/messaging/FloatingChatWindow';
import AddGroupMembersModal from '../components/messaging/AddGroupMembersModal';
import GraduateMiniProfile from '../components/messaging/GraduateMiniProfile';
import type { GraduateMiniProfileData } from '../components/messaging/GraduateMiniProfile';
import type {
  ConversationInformation,
  MessageAttachment,
  MessagePagination,
  MessagingMessage,
  MessagingParticipant,
  MessagingRoom,
  SelectedAttachment,
} from '../components/messaging/types';
import MessageBox from '../components/MessageBox';
import FeatureUnavailable from '../components/FeatureUnavailable';
import JobLocationCombobox from '../components/JobLocationCombobox';
import type { JobLocationOption } from '../components/JobLocationCombobox';
import JobProgramFitPicker from '../components/JobProgramFitPicker';
import type { JobProgramOption } from '../components/JobProgramFitPicker';
import MobileBottomNav from '../components/MobileBottomNav';
import NotificationBell from '../components/NotificationBell';
import type { NotificationSnapshot } from '../components/NotificationBell';
import ProfileAvatar from '../components/ProfileAvatar';
import ThemeToggle from '../components/ThemeToggle';
import GraduateAnnouncements from '../components/graduate/GraduateAnnouncements';
import { useGraduateAuth } from '../contexts/GraduateAuthContext';
import type { GraduateUser } from '../contexts/GraduateAuthContext';
import { useSystemSettings } from '../contexts/SystemSettingsContext';
import { destroyRealtimeChatSocket, emitWithAck, getRealtimeChatSocket } from '../services/realtimeChat';
import type { RealtimeChatStatus } from '../services/realtimeChat';
import { normalizeGraduationYears } from '../utils/graduationYears';

type PortalTab = 'announcements' | 'dashboard' | 'community_forum' | 'messages' | 'jobs' | 'saved_jobs' | 'job_posting' | 'my_profile' | 'settings';
type ForumStatus = 'approved' | 'hidden';
type ApprovalStatus = 'pending' | 'approved' | 'declined';
type JobSortOption = 'recent' | 'oldest' | 'deadline';
const JOBS_PER_PAGE = 10;

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
  author_year_graduated?: number | null;
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
  content: string;
  media: ForumMedia[];
  remove_media: boolean;
}

interface ReportTarget {
  target_type: 'post' | 'comment';
  target_id: number;
  label: string;
}

interface ForumReportDetail {
  id: number;
  target_type: 'post' | 'comment';
  post_id: number;
  comment_id: number | null;
  reason: string;
  description?: string | null;
  status: 'pending' | 'resolved' | 'dismissed';
  created_at: string;
  reviewed_at?: string | null;
  reviewed_by_name?: string | null;
  viewer_relation: 'reporter' | 'reported_user';
  post_title: string;
  content: string;
  content_status: ForumStatus;
}

type ChatParticipant = MessagingParticipant;
type ChatRoom = MessagingRoom;
type ChatMessage = MessagingMessage;

interface ChatPresenceStatus {
  graduate_id: number;
  is_online: boolean;
  last_active_at?: string | null;
}

function mergeKnownPresenceIntoParticipant(
  participant: ChatParticipant,
  presenceByGraduate: Map<number, ChatPresenceStatus>,
): ChatParticipant {
  const status = presenceByGraduate.get(participant.graduate_id);
  if (!status) return participant;

  return {
    ...participant,
    is_online: status.is_online,
    last_active_at: status.is_online
      ? (participant.last_active_at ?? status.last_active_at ?? null)
      : (status.last_active_at ?? participant.last_active_at ?? null),
  };
}

function mergeKnownPresenceIntoRoom(
  room: ChatRoom,
  presenceByGraduate: Map<number, ChatPresenceStatus>,
): ChatRoom {
  return {
    ...room,
    participants: room.participants.map((participant) => (
      mergeKnownPresenceIntoParticipant(participant, presenceByGraduate)
    )),
  };
}

interface JobPost {
  id: number;
  posted_by_account_id?: number;
  created_by_admin_id?: number;
  title: string;
  company: string;
  location?: string | null;
  salary_range?: string | null;
  job_type: string;
  industry?: string | null;
  description?: string | null;
  qualifications?: string | null;
  required_skills?: string | null;
  course_program_fit?: string | null;
  application_deadline?: string | null;
  contact_email?: string | null;
  application_link?: string | null;
  application_method?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  poster_account_id?: number;
  poster_graduate_id?: number;
  poster_full_name?: string | null;
  poster_program_name?: string | null;
  poster_program_code?: string | null;
  poster_email?: string | null;
  poster_profile_image_path?: string | null;
  requirements_file_path?: string | null;
  requirements_file_name?: string | null;
  requirements_mime_type?: string | null;
  requirements_file_size_bytes?: number | null;
  approval_status?: ApprovalStatus | null;
  approval_notes?: string | null;
  approval_reviewed_at?: string | null;
  is_active: number;
  created_at?: string | null;
  updated_at?: string | null;
  creator_role?: string | null;
  saved_at?: string | null;
}

interface JobFilterOptions {
  locations: string[];
  jobTypes: string[];
  programFits: string[];
  industries: string[];
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
  phone_number: string;
  birthday: string;
  civil_status: string;
  sex_gender: string;
  program_course: string;
  graduation_year: string;
  current_location: string;
  job_title: string;
  company_name: string;
  employment_location: string;
  professional_status: string;
  start_date: string;
  current_password: string;
  password: string;
  confirm_password: string;
}

interface RealtimeMutationEnvelope {
  event_id: string;
  occurred_at?: string;
}

interface RealtimeProfileSummary {
  graduate_id: number;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  full_name: string;
  program_name?: string | null;
  program_code?: string | null;
  year_graduated?: number | null;
  job_title?: string | null;
  company_name?: string | null;
  professional_status?: string | null;
  profile_image_path?: string | null;
  cover_image_path?: string | null;
  updated_at?: string | null;
}

type ProfileEditSection = 'basic' | 'employment' | 'education' | 'photo' | 'cover' | 'security';

interface GraduateEditableProfile {
  id: number;
  graduate_account_id: number;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  phone_number?: string | null;
  birthday?: string | null;
  civil_status?: string | null;
  sex_gender?: string | null;
  program_course?: string | null;
  graduation_year?: number | null;
  current_location?: string | null;
  job_title?: string | null;
  company_name?: string | null;
  employment_location?: string | null;
  professional_status?: string | null;
  start_date?: string | null;
  initialized_from_survey_response_id?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface GraduateProfileField {
  key: string;
  label: string;
  value: string;
  question_id?: number;
  question_text?: string;
}

interface GraduateTrainingEntry {
  id: number;
  title?: string;
  organizer?: string;
  date?: string;
  duration?: string;
  location?: string;
  description?: string;
  certificate?: string;
}

interface GraduateSurveyProfile {
  response?: {
    id: number;
    survey_id: number;
    survey_title?: string | null;
    submitted_at?: string | null;
  };
  personal?: {
    fields?: GraduateProfileField[];
  };
  work?: {
    is_employed?: boolean | null;
    summary?: {
      employment_status?: string | null;
      employment_type?: string | null;
      current_job_title?: string | null;
      company?: string | null;
      industry?: string | null;
      location?: string | null;
      start_date?: string | null;
      job_related_to_program?: string | null;
      skills_used?: string | null;
    };
    fields?: GraduateProfileField[];
  };
  education?: {
    fields?: GraduateProfileField[];
    graduate_studies?: GraduateProfileField[];
  };
  trainings?: GraduateTrainingEntry[];
}

interface GraduateProfilePayload {
  user?: GraduateUser | null;
  profile?: GraduateEditableProfile | null;
  survey_profile?: GraduateSurveyProfile | null;
  is_self?: boolean;
  viewer_graduate_id?: number;
}

interface MessageBoxState {
  isOpen: boolean;
  type: 'success' | 'error' | 'warning' | 'info' | 'confirm';
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  onConfirm?: () => void;
}

const portalTabs: PortalTab[] = ['announcements', 'dashboard', 'community_forum', 'messages', 'jobs', 'saved_jobs', 'job_posting', 'my_profile', 'settings'];
const graduatePortalLayoutStyle = {
  '--graduate-portal-header-height': '4rem',
  '--graduate-portal-sticky-gap': '1rem',
} as CSSProperties;

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
const profileImageAccept = 'image/png,image/jpeg,image/webp,image/gif';
const supportedProfileImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const profileEditSections: Array<{ key: ProfileEditSection; label: string; description: string; icon: LucideIcon }> = [
  { key: 'basic', label: 'Personal details', description: 'Name, contact, and location', icon: Contact },
  { key: 'employment', label: 'Employment', description: 'Role, company, and status', icon: Briefcase },
  { key: 'education', label: 'Education', description: 'Program and graduation year', icon: GraduationCap },
  { key: 'photo', label: 'Profile photo', description: 'Your account picture', icon: Camera },
  { key: 'cover', label: 'Cover photo', description: 'Your profile background', icon: ImagePlus },
  { key: 'security', label: 'Password and security', description: 'Update your password', icon: ShieldCheck },
];

function getPortalTab(rawValue: string | null): PortalTab {
  if (rawValue === 'group_chats') {
    return 'messages';
  }
  if (rawValue && portalTabs.includes(rawValue as PortalTab)) {
    return rawValue as PortalTab;
  }
  return 'community_forum';
}

function getProfileEditSection(rawValue: string | null): ProfileEditSection {
  const sections: ProfileEditSection[] = ['basic', 'employment', 'education', 'photo', 'cover', 'security'];
  return rawValue && sections.includes(rawValue as ProfileEditSection)
    ? rawValue as ProfileEditSection
    : 'basic';
}

function parsePositiveIntParam(rawValue: string | null) {
  const value = Number(rawValue);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function resolveAssetUrl(path?: string | null) {
  if (!path) return '';
  if (/^(https?:|blob:|data:)/i.test(path)) return path;
  return `${API_BASE_URL}/${path.replace(/^\/+/, '')}`;
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

function formatDate(value?: string | null) {
  const parsed = parseDate(value);
  if (!parsed) return 'Not specified';

  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
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

function hasDisplayValue(value?: string | number | null) {
  return String(value ?? '').trim() !== '';
}

function getProfileField(fields: GraduateProfileField[] | undefined, key: string) {
  return fields?.find((field) => field.key === key && hasDisplayValue(field.value));
}

function getProfileFieldValue(fields: GraduateProfileField[] | undefined, key: string) {
  return getProfileField(fields, key)?.value || '';
}

function getBatchLabel(year?: number | null) {
  return year ? `Batch ${year}` : '';
}

function formatProfileLocationForDisplay(value?: string | null) {
  const location = String(value ?? '').trim();
  if (!location) return '';

  const segments = location.split(',').map((segment) => segment.trim()).filter(Boolean);
  const trailingSegment = segments[segments.length - 1] || '';

  if (segments.length > 2 && /^region\s+(?:[ivxlcdm]+|\d+)$/i.test(trailingSegment)) {
    return segments.slice(0, -1).join(', ');
  }

  return location;
}

function buildProfileLocation(
  profile?: GraduateEditableProfile | null,
  user?: GraduateUser | null,
  survey?: GraduateSurveyProfile | null,
) {
  const location = profile
    ? (profile.current_location || '')
    : (user?.address || getProfileFieldValue(survey?.personal?.fields, 'current_location') || '');

  return formatProfileLocationForDisplay(location);
}

function getGraduateFullName(user?: GraduateUser | null) {
  return [
    user?.first_name,
    user?.middle_name,
    user?.last_name,
  ].filter((part) => hasDisplayValue(part)).join(' ') || user?.full_name || 'Graduate User';
}

function createProfileForm(
  profile?: GraduateEditableProfile | null,
  user?: GraduateUser | null,
): ProfileFormState {
  return {
    first_name: profile?.first_name || user?.first_name || '',
    middle_name: profile?.middle_name || user?.middle_name || '',
    last_name: profile?.last_name || user?.last_name || '',
    email: user?.email || '',
    phone_number: profile?.phone_number || '',
    birthday: profile?.birthday || '',
    civil_status: profile?.civil_status || '',
    sex_gender: profile?.sex_gender || '',
    program_course: profile?.program_course || '',
    graduation_year: profile?.graduation_year ? String(profile.graduation_year) : '',
    current_location: profile?.current_location || '',
    job_title: profile?.job_title || '',
    company_name: profile?.company_name || '',
    employment_location: profile?.employment_location || '',
    professional_status: profile?.professional_status || '',
    start_date: profile?.start_date || '',
    current_password: '',
    password: '',
    confirm_password: '',
  };
}

function getPortalNavOpenWidth(label: string) {
  if (label.length >= 15) return '11.25rem';
  if (label.length >= 11) return '10rem';
  return '8.75rem';
}

function getPortalNavLabelWidth(label: string) {
  if (label.length >= 15) return '8.25rem';
  if (label.length >= 11) return '7rem';
  return '5.75rem';
}

const forumMediaAccept = 'image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/ogg,video/quicktime';
const maxForumMediaFiles = 10;
const maxForumRequestBytes = 256 * 1024 * 1024;
const maxForumImageBytes = 5 * 1024 * 1024;
const maxForumVideoBytes = 50 * 1024 * 1024;
const supportedForumImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const supportedForumVideoTypes = new Set(['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']);

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
      original_name: post.image_original_name || post.title || 'Forum media',
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

const chatAttachmentAccept = '.jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv';
const chatImageMaxBytes = 10 * 1024 * 1024;
const chatDocumentMaxBytes = 25 * 1024 * 1024;
const chatImageExtensions = ['jpg', 'jpeg', 'png', 'webp'];
const chatDocumentExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'];
const chatDangerousExtensions = ['exe', 'bat', 'cmd', 'sh', 'js', 'mjs', 'cjs', 'php', 'php3', 'php4', 'php5', 'php7', 'php8', 'phtml', 'phar', 'jar', 'msi', 'com', 'scr', 'vbs', 'ps1', 'html', 'htm', 'svg', 'xhtml'];
const chatAllowedMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
];

function getFileExtension(name: string) {
  return name.split('.').pop()?.toLowerCase() || '';
}

function validateChatAttachmentFile(file: File): string | null {
  const extension = getFileExtension(file.name);

  if (!extension || chatDangerousExtensions.includes(extension)) {
    return 'This file type is not allowed.';
  }

  const isImage = chatImageExtensions.includes(extension);
  const isDocument = chatDocumentExtensions.includes(extension);
  if (!isImage && !isDocument) {
    return `Unsupported file type. Allowed: ${chatAttachmentAccept}.`;
  }

  if (file.type && !chatAllowedMimeTypes.includes(file.type)) {
    return 'Unsupported file content type.';
  }

  const maxBytes = isImage ? chatImageMaxBytes : chatDocumentMaxBytes;
  if (file.size > maxBytes) {
    return `${isImage ? 'Images' : 'Documents'} must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.`;
  }

  return null;
}

function createClientMessageId(currentGraduateId: number) {
  const randomPart = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `grad-${currentGraduateId}-${randomPart}`;
}

function normalizeChatMessage(message: ChatMessage, currentGraduateId: number): ChatMessage {
  const isMine = message.graduate_id === currentGraduateId;

  return {
    ...message,
    message: message.message || '',
    is_mine: isMine,
    attachments: Array.isArray(message.attachments) ? message.attachments : [],
    status: isMine
      ? (message.read_at ? 'read' : message.delivered_at ? 'delivered' : message.status || 'sent')
      : 'received',
  };
}

function mergeChatMessages(currentMessages: ChatMessage[], incomingMessages: ChatMessage[]) {
  const byKey = new Map<string, ChatMessage>();

  [...currentMessages, ...incomingMessages].forEach((message) => {
    const key = message.client_message_id
      ? `client-${message.room_id}-${message.graduate_id}-${message.client_message_id}`
      : `id-${message.id}`;
    const existing = byKey.get(key);
    if (!existing || existing.id < 0 || message.id > 0) {
      byKey.set(key, {
        ...existing,
        ...message,
        attachments: message.attachments || existing?.attachments || [],
      });
    }
  });

  return Array.from(byKey.values()).sort((a, b) => {
    const timeDifference = (parseDate(a.created_at)?.getTime() ?? 0) - (parseDate(b.created_at)?.getTime() ?? 0);
    if (timeDifference !== 0) return timeDifference;
    if (a.id > 0 && b.id > 0) return a.id - b.id;
    if (a.id > 0) return -1;
    if (b.id > 0) return 1;
    return a.id - b.id;
  });
}

function sortChatRooms(roomList: ChatRoom[]) {
  return [...roomList].sort((a, b) => {
    const first = parseDate(a.last_message_at || a.updated_at || a.created_at)?.getTime() || 0;
    const second = parseDate(b.last_message_at || b.updated_at || b.created_at)?.getTime() || 0;
    return second - first || b.id - a.id;
  });
}

function getChatMessagePreview(message: ChatMessage) {
  if (message.message_type === 'job_share') return 'Shared a job opportunity';
  const text = message.message.trim();
  if (text) return text;
  if (message.message_type === 'image') return 'Photo';
  if (message.message_type === 'file') return 'Attachment';
  if (message.message_type === 'mixed') return 'Message with attachment';
  return 'Message';
}

function getNewestMessageId(messages: ChatMessage[]) {
  return messages.reduce((max, message) => (message.id > max ? message.id : max), 0);
}

function forumStatusClass(status: ForumStatus) {
  if (status === 'approved') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'hidden') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function sortForumPosts(postList: ForumPost[]) {
  return [...postList].sort((left, right) => {
    const timeDifference = (parseDate(right.created_at)?.getTime() || 0) - (parseDate(left.created_at)?.getTime() || 0);
    return timeDifference !== 0 ? timeDifference : right.id - left.id;
  });
}

function upsertForumPost(postList: ForumPost[], incoming: ForumPost) {
  const existing = postList.find((post) => post.id === incoming.id);
  const merged = existing
    ? { ...incoming, is_liked: existing.is_liked }
    : incoming;
  return sortForumPosts([...postList.filter((post) => post.id !== incoming.id), merged]);
}

function sortJobPosts(jobList: JobPost[]) {
  return [...jobList].sort((left, right) => {
    const timeDifference = (parseDate(right.created_at)?.getTime() || 0) - (parseDate(left.created_at)?.getTime() || 0);
    return timeDifference !== 0 ? timeDifference : right.id - left.id;
  });
}

function upsertJobPost(jobList: JobPost[], incoming: JobPost) {
  return sortJobPosts([...jobList.filter((job) => job.id !== incoming.id), incoming]);
}

function formatForumStatus(status: ForumStatus) {
  return status === 'hidden' ? 'HIDDEN' : 'PUBLISHED';
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

function getJobPosterName(job: JobPost) {
  const fallbackName = [job.first_name, job.middle_name, job.last_name]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ');
  return (job.poster_full_name || fallbackName || 'Graduate Alumni').trim();
}

function getJobPosterProgram(job: JobPost) {
  if (job.poster_program_code || job.poster_program_name) return job.poster_program_code || job.poster_program_name || 'Graduate';
  if (job.creator_role) {
    const roleLabels: Record<string, string> = {
      research_coordinator: 'Research Coordinator',
      alumni_president: 'Alumni President',
      dean_cs: 'Dean · Computer Studies',
      dean_coed: 'Dean · Education',
      dean_hm: 'Dean · Hospitality Management',
      admin: 'GradTrack Administrator',
    };
    return roleLabels[job.creator_role] || job.creator_role.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  return job.created_by_admin_id ? 'GradTrack Personnel' : 'Graduate';
}

function getJobProgramFit(job: JobPost) {
  return job.course_program_fit || 'Not specified';
}

function getJobPostedLabel(job: JobPost) {
  return job.created_at ? `Posted ${formatRelativeTime(job.created_at)}` : 'Recently posted';
}

function getJobProgramFitValues(value?: string | null) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return [];
  return rawValue
    .split(/[,;|&/\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeJobLocation(value?: string | null) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/\bcity of\b/g, ' ')
    .replace(/\b(?:city|municipality|province)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function uniqueJobValues(values: Array<string | null | undefined>) {
  const entries = new Map<string, string>();
  values.forEach((value) => {
    const cleanValue = String(value || '').trim();
    if (!cleanValue) return;
    const key = cleanValue.toLocaleLowerCase();
    if (!entries.has(key)) entries.set(key, cleanValue);
  });
  return Array.from(entries.values()).sort((left, right) => left.localeCompare(right));
}

function getPaginationItems(currentPage: number, pageCount: number): Array<number | 'ellipsis'> {
  if (pageCount <= 5) return Array.from({ length: pageCount }, (_, index) => index + 1);

  const visiblePages = Array.from(new Set([1, currentPage - 1, currentPage, currentPage + 1, pageCount]))
    .filter((page) => page >= 1 && page <= pageCount)
    .sort((left, right) => left - right);
  const items: Array<number | 'ellipsis'> = [];

  visiblePages.forEach((page, index) => {
    if (index > 0 && page - visiblePages[index - 1] > 1) items.push('ellipsis');
    items.push(page);
  });

  return items;
}

function isJobDeadlinePast(value?: string | null) {
  if (!value) return false;
  const deadline = new Date(`${String(value).slice(0, 10)}T23:59:59`);
  return !Number.isNaN(deadline.getTime()) && deadline.getTime() < Date.now();
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

function getPortalHeading(tab: PortalTab) {
  if (tab === 'announcements') {
    return {
      title: 'Announcements',
      subtitle: 'Read and share updates, alumni opportunities, events, and college activities.',
    };
  }

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
      subtitle: 'Continue direct and group conversations with fellow graduates.',
    };
  }

  if (tab === 'jobs') {
    return {
      title: 'Browse Jobs',
      subtitle: 'Explore approved opportunities shared inside GradTrack.',
    };
  }

  if (tab === 'saved_jobs') {
    return {
      title: 'Saved Jobs',
      subtitle: 'Review the active opportunities you bookmarked for later.',
    };
  }

  if (tab === 'job_posting') {
    return {
      title: 'Job Posting',
      subtitle: 'Create and manage job opportunities without mixing them into the forum.',
    };
  }

  if (tab === 'settings') {
    return {
      title: 'Settings',
      subtitle: 'Manage your profile information, career details, photos, and account security.',
    };
  }

  return {
    title: 'My Profile',
    subtitle: 'Review your personal, contact, education, and career details.',
  };
}

export default function GraduatePortal() {
  const { user, logout, checkAuth } = useGraduateAuth();
  const { getSetting, isEnabled, resolveAssetUrl: resolveSystemAssetUrl } = useSystemSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ graduateId?: string; announcementId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const routeProfileGraduateId = parsePositiveIntParam(params.graduateId || null);
  const routeAnnouncementId = parsePositiveIntParam(params.announcementId || null);
  const isCommunityProfileRoute = routeProfileGraduateId > 0;
  const isAnnouncementRoute = location.pathname.startsWith('/graduate/announcements');

  const [activeTab, setActiveTab] = useState<PortalTab>(() => (
    isAnnouncementRoute ? 'announcements' : (isCommunityProfileRoute ? 'my_profile' : getPortalTab(searchParams.get('tab')))
  ));
  const [loading, setLoading] = useState(true);
  const [isDesktopMessagingLayout, setIsDesktopMessagingLayout] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  ));
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [viewedProfileDetails, setViewedProfileDetails] = useState<GraduateProfilePayload | null>(null);
  const [viewedProfileLoaded, setViewedProfileLoaded] = useState(false);
  const [viewedProfileLoading, setViewedProfileLoading] = useState(false);
  const [profileEditSection, setProfileEditSection] = useState<ProfileEditSection>(() => (
    getProfileEditSection(searchParams.get('section'))
  ));
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [authenticatedProfileImagePreview, setAuthenticatedProfileImagePreview] = useState('');
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);
  const [coverImagePreview, setCoverImagePreview] = useState('');
  const [coverRemoveRequested, setCoverRemoveRequested] = useState(false);
  const [profileForm, setProfileForm] = useState<ProfileFormState>(() => createProfileForm(null, user));
  const [ratingSummary, setRatingSummary] = useState<AlumniRating | null>(null);

  const [forumPosts, setForumPosts] = useState<ForumPost[]>([]);
  const [myForumPosts, setMyForumPosts] = useState<ForumPost[]>([]);
  const [profileForumPosts, setProfileForumPosts] = useState<ForumPost[]>([]);
  const [forumCategories, setForumCategories] = useState<string[]>(forumCategoryFallback);
  const [forumSearch, setForumSearch] = useState('');
  const [forumCategory, setForumCategory] = useState('all');
  const [forumComposerOpen, setForumComposerOpen] = useState(false);
  const [managePostsOpen, setManagePostsOpen] = useState(false);
  const [forumSubmitting, setForumSubmitting] = useState(false);
  const [forumActionKey, setForumActionKey] = useState('');
  const [forumForm, setForumForm] = useState<ForumFormState>({
    id: null,
    content: '',
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
  const [highlightedCommentId, setHighlightedCommentId] = useState<number | null>(null);
  const [mediaViewer, setMediaViewer] = useState<{ post: ForumPost; mediaIndex: number } | null>(null);
  const [mediaViewerZoom, setMediaViewerZoom] = useState(1);
  const [mediaViewerComments, setMediaViewerComments] = useState<ForumComment[]>([]);
  const [mediaViewerCommentsLoading, setMediaViewerCommentsLoading] = useState(false);
  const [mediaViewerCommentDraft, setMediaViewerCommentDraft] = useState('');
  const [mediaViewerCommentSubmitting, setMediaViewerCommentSubmitting] = useState(false);
  const [newMediaViewerCommentId, setNewMediaViewerCommentId] = useState<number | null>(null);
  const [profileImageViewer, setProfileImageViewer] = useState<{
    src: string;
    alt: string;
    kind: 'profile' | 'cover';
  } | null>(null);
  const [postComments, setPostComments] = useState<ForumComment[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [newPostCommentId, setNewPostCommentId] = useState<number | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [reportReason, setReportReason] = useState('Inappropriate content');
  const [reportDescription, setReportDescription] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportDetail, setReportDetail] = useState<ForumReportDetail | null>(null);
  const [reportDetailLoading, setReportDetailLoading] = useState(false);
  const [reportDetailError, setReportDetailError] = useState('');

  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState('');
  const [jobPrograms, setJobPrograms] = useState<JobProgramOption[]>([]);
  const [jobLocationOptions, setJobLocationOptions] = useState<JobLocationOption[]>([]);
  const [jobLocationsLoading, setJobLocationsLoading] = useState(false);
  const [savedJobs, setSavedJobs] = useState<JobPost[]>([]);
  const [savingJobIds, setSavingJobIds] = useState<number[]>([]);
  const [myPostedJobs, setMyPostedJobs] = useState<JobPost[]>([]);
  const [jobSearch, setJobSearch] = useState('');
  const [jobLocationFilter, setJobLocationFilter] = useState('');
  const [jobTypeFilters, setJobTypeFilters] = useState<string[]>([]);
  const [jobProgramFitFilters, setJobProgramFitFilters] = useState<string[]>([]);
  const [jobIndustryFilters, setJobIndustryFilters] = useState<string[]>([]);
  const [jobSort, setJobSort] = useState<JobSortOption>('recent');
  const [jobPage, setJobPage] = useState(1);
  const [mobileJobFiltersOpen, setMobileJobFiltersOpen] = useState(false);
  const [highlightedJobId, setHighlightedJobId] = useState<number | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobPost | null>(null);
  const [selectedJobLoading, setSelectedJobLoading] = useState(false);
  const [showJobPostForm, setShowJobPostForm] = useState(false);
  const [jobSubmitting, setJobSubmitting] = useState(false);
  const [myJobForm, setMyJobForm] = useState<JobForm>(() => createDefaultJobForm(user));
  const [shareJob, setShareJob] = useState<JobPost | null>(null);
  const [shareSearch, setShareSearch] = useState('');
  const [shareRecipientId, setShareRecipientId] = useState<number | null>(null);
  const [shareMessage, setShareMessage] = useState('Check out this job opportunity!');
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const [notificationCategoryCounts, setNotificationCategoryCounts] = useState({
    browse_jobs: 0,
    job_posting: 0,
  });

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [directory, setDirectory] = useState<ChatParticipant[]>([]);
  const [chatSearch, setChatSearch] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [activeRoom, setActiveRoom] = useState<ChatRoom | null>(null);
  const [temporaryChatRecipient, setTemporaryChatRecipient] = useState<ChatParticipant | null>(null);
  const [chatProfileIntro, setChatProfileIntro] = useState<GraduateMiniProfileData | null>(null);
  const [chatProfileIntroLoading, setChatProfileIntroLoading] = useState(false);
  const [roomMessages, setRoomMessages] = useState<ChatMessage[]>([]);
  const [messagePagination, setMessagePagination] = useState<MessagePagination | null>(null);
  const [roomLoading, setRoomLoading] = useState(false);
  const [olderMessagesLoading, setOlderMessagesLoading] = useState(false);
  const [chatMessageDraft, setChatMessageDraft] = useState('');
  const [chatConnectionStatus, setChatConnectionStatus] = useState<RealtimeChatStatus>('disconnected');
  const [chatSelectedAttachment, setChatSelectedAttachment] = useState<SelectedAttachment | null>(null);
  const [chatTypingUsers, setChatTypingUsers] = useState<Record<number, Record<number, { name: string; expiresAt: number }>>>({});
  const [chatNewMessageAvailable, setChatNewMessageAvailable] = useState(false);
  const [chatMobileConversationOpen, setChatMobileConversationOpen] = useState(false);
  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [chatModalMode, setChatModalMode] = useState<'direct' | 'group'>('direct');
  const [chatModalName, setChatModalName] = useState('');
  const [chatModalSelectedIds, setChatModalSelectedIds] = useState<number[]>([]);
  const [chatModalSearch, setChatModalSearch] = useState('');
  const [chatModalProgramFilter, setChatModalProgramFilter] = useState('all');
  const [chatModalBatchFilter, setChatModalBatchFilter] = useState('all');
  const [chatCreating, setChatCreating] = useState(false);
  const [floatingChatOpen, setFloatingChatOpen] = useState(false);
  const [floatingChatMinimized, setFloatingChatMinimized] = useState(false);
  const [conversationInfoOpen, setConversationInfoOpen] = useState(false);
  const [conversationInfo, setConversationInfo] = useState<ConversationInformation | null>(null);
  const [conversationInfoLoading, setConversationInfoLoading] = useState(false);
  const [conversationActionLoading, setConversationActionLoading] = useState(false);
  const [miniProfileGraduateId, setMiniProfileGraduateId] = useState<number | null>(null);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [addMemberCandidates, setAddMemberCandidates] = useState<ChatParticipant[]>([]);
  const [addMemberSelectedIds, setAddMemberSelectedIds] = useState<number[]>([]);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [addMembersLoading, setAddMembersLoading] = useState(false);
  const [addMembersSubmitting, setAddMembersSubmitting] = useState(false);

  const [msgBox, setMsgBox] = useState<MessageBoxState>({
    isOpen: false,
    type: 'info',
    message: '',
  });

  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const profileImageInputRef = useRef<HTMLInputElement | null>(null);
  const coverImageInputRef = useRef<HTMLInputElement | null>(null);
  const forumMediaInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatSocketRef = useRef<Socket | null>(null);
  const chatNearBottomRef = useRef(true);
  const chatTypingStopTimeoutRef = useRef<number | null>(null);
  const chatTypingRoomIdRef = useRef<number | null>(null);
  const chatTypingLastEmittedAtRef = useRef(0);
  const chatConversationSurfaceOpenRef = useRef(false);
  const conversationInfoOpenRef = useRef(false);
  const chatJoinedRoomIdRef = useRef<number | null>(null);
  const selectedRoomIdRef = useRef<number | null>(null);
  const temporaryChatRecipientRef = useRef<ChatParticipant | null>(null);
  const directChatOpeningRef = useRef(false);
  const previousSelectedRoomIdRef = useRef<number | null>(null);
  const roomMessagesRef = useRef<ChatMessage[]>([]);
  const chatPresenceByGraduateRef = useRef<Map<number, ChatPresenceStatus>>(new Map());
  const retryAttachmentsRef = useRef<Record<string, SelectedAttachment>>({});
  const chatSelectedAttachmentRef = useRef<SelectedAttachment | null>(null);
  const chatTypingExpiryTimeoutsRef = useRef<Map<string, number>>(new Map());
  const roomLoadRequestRef = useRef(0);
  const conversationInfoRequestRef = useRef(0);
  const chatProfileIntroRequestRef = useRef(0);
  const loadMissedRoomMessagesRef = useRef<(roomId: number) => Promise<void>>(async () => undefined);
  const markVisibleMessagesAsReadRef = useRef<(roomId?: number, messages?: ChatMessage[]) => Promise<void>>(async () => undefined);
  const lastMarkedReadIdByRoomRef = useRef<Map<number, number>>(new Map());
  const seenRealtimeMessageIdsRef = useRef<Set<number>>(new Set());
  const seenPortalEventIdsRef = useRef<Set<string>>(new Set());
  const reactionRealtimeSequenceRef = useRef<Map<number, number>>(new Map());
  const commentRealtimeSequenceRef = useRef<Map<number, number>>(new Map());
  const profileRealtimeVersionsRef = useRef<Map<number, { profileTime: number; eventTime: number }>>(new Map());
  const profileFormDirtyRef = useRef(false);
  const profileSavingRef = useRef(false);
  const activeTabRef = useRef<PortalTab>(activeTab);
  const profileTargetGraduateIdRef = useRef(0);
  const bootStartedRef = useRef(false);
  const routePostTargetRef = useRef('');
  const routeJobTargetRef = useRef('');
  const routeMessageTargetRef = useRef('');
  const viewedProfileRequestRef = useRef(0);
  const viewedProfilePostsRequestRef = useRef(0);
  const commentRefs = useRef<Record<number, HTMLElement | null>>({});
  const selectedPostCommentsContainerRef = useRef<HTMLDivElement | null>(null);
  const jobCardRefs = useRef<Record<number, HTMLElement | null>>({});

  const currentGraduateId = user?.graduate_id ?? 0;
  const profileTargetGraduateId = isCommunityProfileRoute ? routeProfileGraduateId : currentGraduateId;
  const isViewingOwnProfile = profileTargetGraduateId > 0 && profileTargetGraduateId === currentGraduateId;
  const viewedProfileRecord = viewedProfileDetails?.profile || null;
  const viewedProfileBaseUser = viewedProfileDetails?.user || (isViewingOwnProfile ? user : null);
  const viewedProfileUser = useMemo<GraduateUser | null>(() => {
    if (!viewedProfileBaseUser) return null;
    if (!viewedProfileRecord) return viewedProfileBaseUser;

    const fullName = [viewedProfileRecord.first_name, viewedProfileRecord.middle_name, viewedProfileRecord.last_name]
      .filter((part) => hasDisplayValue(part))
      .join(' ');

    return {
      ...viewedProfileBaseUser,
      first_name: viewedProfileRecord.first_name,
      middle_name: viewedProfileRecord.middle_name,
      last_name: viewedProfileRecord.last_name,
      full_name: fullName || viewedProfileBaseUser.full_name,
      phone: viewedProfileRecord.phone_number,
      address: viewedProfileRecord.current_location,
      program_name: viewedProfileRecord.program_course,
      year_graduated: viewedProfileRecord.graduation_year,
    };
  }, [viewedProfileBaseUser, viewedProfileRecord]);
  const profileSurvey = viewedProfileDetails?.survey_profile || null;
  const profilePersonalFields = profileSurvey?.personal?.fields || [];
  const profileWorkFields = profileSurvey?.work?.fields || [];
  const profileEducationFields = profileSurvey?.education?.fields || [];
  const profileGraduateStudyFields = profileSurvey?.education?.graduate_studies || [];
  const profileTrainings = profileSurvey?.trainings || [];
  const authenticatedUserProfileImageUrl = resolveAssetUrl(user?.profile_image_path);
  const profileImageUrl = isViewingOwnProfile
    ? (authenticatedProfileImagePreview || resolveAssetUrl(viewedProfileUser?.profile_image_path) || authenticatedUserProfileImageUrl)
    : resolveAssetUrl(viewedProfileUser?.profile_image_path);
  const navbarProfileImageUrl = isViewingOwnProfile && authenticatedProfileImagePreview
    ? authenticatedProfileImagePreview
    : authenticatedUserProfileImageUrl;
  const viewedProfileCoverImageUrl = resolveAssetUrl(viewedProfileUser?.cover_image_path);
  const profileCoverImageUrl = isViewingOwnProfile
    ? (coverRemoveRequested ? '' : (coverImagePreview || viewedProfileCoverImageUrl))
    : viewedProfileCoverImageUrl;
  const profileJobTitle = viewedProfileRecord?.job_title || '';
  const profilePosts = isViewingOwnProfile ? myForumPosts : profileForumPosts;
  const canPostJobs = !!ratingSummary?.permissions?.can_post_jobs;
  const communityAvailable = isEnabled('community_available', true);
  const jobsAvailable = isEnabled('feature_alumni_job_support_enabled', true);
  const messagingAvailable = communityAvailable && isEnabled('feature_messaging_enabled', true);
  const forumMediaEnabled = isEnabled('community_allow_media_uploads', true);
  const notificationsEnabled = isEnabled('feature_notifications_enabled', true);
  const systemLogoUrl = resolveSystemAssetUrl(getSetting('system_logo_path'), '/Gradtrack_small.png');
  const systemShortName = getSetting('system_short_name', 'GradTrack');
  const pageHeading = activeTab === 'my_profile' && !isViewingOwnProfile
    ? {
        title: 'Community Profile',
        subtitle: 'A professional GradTrack alumni profile with career, tracer, and community activity.',
      }
    : getPortalHeading(activeTab);

  const forumProgramOptions = useMemo(() => Array.from(new Set(
    forumPosts
      .map((post) => post.author_program_code?.trim())
      .filter((code): code is string => Boolean(code)),
  )).sort((left, right) => left.localeCompare(right)), [forumPosts]);
  const forumYearOptions = useMemo(
    () => normalizeGraduationYears(forumPosts.map((post) => post.author_year_graduated)),
    [forumPosts],
  );

  useEffect(() => {
    if (programFilter !== 'all' && !forumProgramOptions.includes(programFilter)) setProgramFilter('all');
    if (yearFilter !== '' && !forumYearOptions.includes(yearFilter)) setYearFilter('');
  }, [forumProgramOptions, forumYearOptions, programFilter, yearFilter]);

  const filteredForumPosts = forumPosts.filter((post) => {
    const matchesCategory = forumCategory === 'all' || post.category === forumCategory;
    const matchesProgram = programFilter === 'all' || post.author_program_code === programFilter;
    const matchesYear = yearFilter === '' || String(post.author_year_graduated ?? '') === yearFilter;
    if (!matchesCategory || !matchesProgram || !matchesYear) return false;

    const query = forumSearch.trim().toLowerCase();
    if (!query) return true;

    return [post.title, post.content, post.category, post.author_name]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });

  const jobFilterOptions = useMemo<JobFilterOptions>(() => ({
    locations: uniqueJobValues(jobs.map((job) => job.location)),
    jobTypes: uniqueJobValues(jobs.map((job) => job.job_type)),
    programFits: uniqueJobValues([
      ...jobPrograms.map((program) => program.code),
      ...jobs.flatMap((job) => getJobProgramFitValues(job.course_program_fit)),
    ]).filter((program) => program.trim().toUpperCase() !== 'BSN'),
    industries: uniqueJobValues(jobs.map((job) => job.industry)),
  }), [jobPrograms, jobs]);

  const searchableJobLocations = useMemo<JobLocationOption[]>(() => {
    const values = new Map<string, JobLocationOption>();
    jobs.forEach((job) => {
      const name = String(job.location || '').trim();
      if (!name) return;
      values.set(name.toLocaleLowerCase(), { code: `job-${job.id}`, name });
    });
    jobLocationOptions.forEach((option) => {
      const key = option.name.toLocaleLowerCase();
      if (!values.has(key)) values.set(key, option);
    });
    return Array.from(values.values());
  }, [jobLocationOptions, jobs]);

  const filteredJobs = useMemo(() => {
    const query = jobSearch.trim().toLocaleLowerCase();
    const selectedJobTypes = new Set(jobTypeFilters.map((value) => value.toLocaleLowerCase()));
    const selectedPrograms = new Set(jobProgramFitFilters.map((value) => value.toLocaleLowerCase()));
    const selectedIndustries = new Set(jobIndustryFilters.map((value) => value.toLocaleLowerCase()));
    const selectedLocationTerms = normalizeJobLocation(jobLocationFilter).split(' ').filter(Boolean);

    const matchingJobs = jobs.filter((job) => {
      const searchableText = [
        job.title,
        job.company,
        job.description,
        job.location,
        job.industry,
        job.required_skills,
        job.qualifications,
        job.course_program_fit,
        job.job_type,
      ].join(' ').toLocaleLowerCase();
      if (query && !searchableText.includes(query)) return false;
      if (selectedLocationTerms.length > 0) {
        const jobLocation = normalizeJobLocation(job.location);
        if (!selectedLocationTerms.every((term) => jobLocation.includes(term))) return false;
      }
      if (selectedJobTypes.size > 0 && !selectedJobTypes.has(String(job.job_type || '').toLocaleLowerCase())) return false;
      if (selectedIndustries.size > 0 && !selectedIndustries.has(String(job.industry || '').trim().toLocaleLowerCase())) return false;
      if (selectedPrograms.size > 0) {
        const rawProgramFit = String(job.course_program_fit || '').toLocaleLowerCase();
        const isOpenToAll = /\b(?:all|any)\s+(?:graduates?|programs?|courses?)\b|\bopen\s+to\s+all\b/.test(rawProgramFit);
        const jobPrograms = getJobProgramFitValues(job.course_program_fit).map((value) => value.toLocaleLowerCase());
        if (!isOpenToAll && !jobPrograms.some((value) => selectedPrograms.has(value))) return false;
      }
      return true;
    });

    return [...matchingJobs].sort((left, right) => {
      if (jobSort === 'oldest') {
        return (parseDate(left.created_at)?.getTime() || 0) - (parseDate(right.created_at)?.getTime() || 0) || left.id - right.id;
      }
      if (jobSort === 'deadline') {
        const leftDeadline = parseDate(left.application_deadline)?.getTime() ?? Number.POSITIVE_INFINITY;
        const rightDeadline = parseDate(right.application_deadline)?.getTime() ?? Number.POSITIVE_INFINITY;
        return leftDeadline - rightDeadline || (parseDate(right.created_at)?.getTime() || 0) - (parseDate(left.created_at)?.getTime() || 0);
      }
      return (parseDate(right.created_at)?.getTime() || 0) - (parseDate(left.created_at)?.getTime() || 0) || right.id - left.id;
    });
  }, [jobIndustryFilters, jobLocationFilter, jobProgramFitFilters, jobSearch, jobSort, jobTypeFilters, jobs]);

  const activeJobFilterCount = (jobSearch.trim() ? 1 : 0)
    + (jobLocationFilter ? 1 : 0)
    + jobTypeFilters.length
    + jobProgramFitFilters.length
    + jobIndustryFilters.length;
  const jobPageCount = Math.max(1, Math.ceil(filteredJobs.length / JOBS_PER_PAGE));
  const paginatedJobs = useMemo(
    () => filteredJobs.slice((jobPage - 1) * JOBS_PER_PAGE, jobPage * JOBS_PER_PAGE),
    [filteredJobs, jobPage],
  );
  const jobPaginationItems = useMemo(() => getPaginationItems(jobPage, jobPageCount), [jobPage, jobPageCount]);

  useEffect(() => {
    setJobPage(1);
  }, [jobIndustryFilters, jobLocationFilter, jobProgramFitFilters, jobSearch, jobSort, jobTypeFilters]);

  useEffect(() => {
    setJobPage((current) => Math.min(current, jobPageCount));
  }, [jobPageCount]);

  const clearJobFilters = useCallback(() => {
    setJobSearch('');
    setJobLocationFilter('');
    setJobTypeFilters([]);
    setJobProgramFitFilters([]);
    setJobIndustryFilters([]);
  }, []);

  const changeJobPage = useCallback((page: number) => {
    setJobPage(Math.max(1, Math.min(page, jobPageCount)));
    window.requestAnimationFrame(() => {
      document.getElementById('job-results-summary')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [jobPageCount]);

  const savedJobIds = useMemo(() => new Set(savedJobs.map((job) => job.id)), [savedJobs]);
  const filteredShareDirectory = useMemo(() => {
    const query = shareSearch.trim().toLowerCase();
    if (!query) return directory;
    return directory.filter((participant) => [
      participant.full_name,
      participant.program_code,
      participant.year_graduated ? `Batch ${participant.year_graduated}` : '',
    ].join(' ').toLowerCase().includes(query));
  }, [directory, shareSearch]);

  useEffect(() => {
    if (!mobileJobFiltersOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileJobFiltersOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobileJobFiltersOpen]);

  const chatModalProgramOptions = useMemo(() => (
    Array.from(new Set(directory.map((participant) => participant.program_code?.trim()).filter(Boolean) as string[]))
      .sort((first, second) => first.localeCompare(second))
  ), [directory]);

  const chatModalBatchOptions = useMemo(() => (
    Array.from(new Set(
      directory
        .map((participant) => participant.year_graduated)
        .filter((year): year is number => typeof year === 'number' && Number.isFinite(year)),
    )).sort((first, second) => second - first)
  ), [directory]);

  const filteredDirectory = directory.filter((participant) => {
    const query = chatModalSearch.trim().toLowerCase();
    const participantProgram = participant.program_code?.trim() || '';
    const participantBatch = participant.year_graduated ? String(participant.year_graduated) : '';
    const matchesProgram = chatModalProgramFilter === 'all' || participantProgram === chatModalProgramFilter;
    const matchesBatch = chatModalBatchFilter === 'all' || participantBatch === chatModalBatchFilter;
    if (!matchesProgram || !matchesBatch) return false;
    if (!query) return true;

    return [participant.full_name, participantProgram, participantBatch ? `Batch ${participantBatch}` : ''].join(' ').toLowerCase().includes(query);
  });

  const publishedForumPostsCount = myForumPosts.filter((post) => post.status === 'approved').length;
  const hiddenForumPostsCount = myForumPosts.filter((post) => post.status === 'hidden').length;
  const unreadMessageCount = useMemo(
    () => rooms.reduce((total, room) => total + Math.max(0, Number(room.unread_count || 0)), 0),
    [rooms],
  );

  const unavailableForTab = useCallback(
    (tab: PortalTab) => {
      if (tab === 'community_forum' && !communityAvailable) {
        return {
          title: 'Community Forum is currently unavailable.',
          message: getSetting('community_default_announcement', 'This feature is currently unavailable.'),
        };
      }

      if (tab === 'messages' && !messagingAvailable) {
        return {
          title: 'Messages are currently unavailable.',
          message: 'This feature is currently unavailable.',
        };
      }

      if (['jobs', 'saved_jobs', 'job_posting'].includes(tab) && !jobsAvailable) {
        return {
          title: 'Alumni Job Support is currently unavailable.',
          message: 'This feature is currently unavailable.',
        };
      }

      return null;
    },
    [communityAvailable, getSetting, jobsAvailable, messagingAvailable],
  );

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

  const applyNotificationSnapshot = useCallback((snapshot: NotificationSnapshot) => {
    setNotificationCategoryCounts({
      browse_jobs: Math.max(0, Number(snapshot.unread_by_category?.browse_jobs || 0)),
      job_posting: Math.max(0, Number(snapshot.unread_by_category?.job_posting || 0)),
    });
  }, []);

  const markNotificationCategoryRead = useCallback(async (category: 'browse_jobs' | 'job_posting') => {
    try {
      const response = await authenticatedFetch(`${API_ENDPOINTS.NOTIFICATIONS}?audience=graduate`, {
        method: 'POST',
        body: JSON.stringify({ action: 'mark_category_read', category }),
      });
      if (response.data) {
        applyNotificationSnapshot(response.data as NotificationSnapshot);
      }
      window.dispatchEvent(new CustomEvent('gradtrack:notifications-updated', {
        detail: { audience: 'graduate' },
      }));
    } catch {
      // Keep the persisted unread value visible and retry when notifications refresh.
    }
  }, [applyNotificationSnapshot, authenticatedFetch]);

  const selectTab = useCallback(
    (tab: PortalTab) => {
      if (tab === 'announcements') {
        navigate('/graduate/announcements');
        return;
      }
      if (isCommunityProfileRoute || isAnnouncementRoute) {
        navigate(`/graduate/portal?tab=${tab}`);
        return;
      }
      setSearchParams({ tab });
    },
    [isAnnouncementRoute, isCommunityProfileRoute, navigate, setSearchParams],
  );

  const resetForumForm = useCallback(() => {
    setForumForm({
      id: null,
      content: '',
      media: [],
      remove_media: false,
    });
    setForumMediaFiles([]);
  }, []);

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
    setJobsLoading(true);
    setJobsError('');
    try {
      const response = await authenticatedFetch(API_ENDPOINTS.JOBS.POSTS);
      setJobs(Array.isArray(response.data) ? (response.data as JobPost[]) : []);
    } catch (error) {
      setJobsError('Unable to load job opportunities.');
      throw error;
    } finally {
      setJobsLoading(false);
    }
  }, [authenticatedFetch]);

  const loadJobPrograms = useCallback(async () => {
    try {
      const response = await authenticatedFetch(API_ENDPOINTS.SURVEY_PROGRAMS);
      const programs = Array.isArray(response.data) ? response.data as Array<Partial<JobProgramOption>> : [];
      setJobPrograms(programs
        .map((program) => ({
          id: Number(program.id || 0),
          code: String(program.code || '').trim(),
          name: String(program.name || '').trim(),
        }))
        .filter((program) => program.code !== '')
        .sort((left, right) => left.code.localeCompare(right.code)));
    } catch {
      setJobPrograms([]);
    }
  }, [authenticatedFetch]);

  const loadJobLocations = useCallback(async () => {
    setJobLocationsLoading(true);
    try {
      const response = await authenticatedFetch(API_ENDPOINTS.JOBS.LOCATIONS);
      const locations = Array.isArray(response.data) ? response.data as Array<Partial<JobLocationOption>> : [];
      setJobLocationOptions(locations
        .map((location) => ({ code: String(location.code || '').trim(), name: String(location.name || '').trim() }))
        .filter((location) => location.code !== '' && location.name !== ''));
    } catch {
      setJobLocationOptions([]);
    } finally {
      setJobLocationsLoading(false);
    }
  }, [authenticatedFetch]);

  const loadSavedJobs = useCallback(async () => {
    const response = await authenticatedFetch(API_ENDPOINTS.JOBS.SAVED);
    setSavedJobs(Array.isArray(response.data) ? (response.data as JobPost[]) : []);
  }, [authenticatedFetch]);

  const loadMyJobs = useCallback(async () => {
    const response = await authenticatedFetch(`${API_ENDPOINTS.JOBS.POSTS}?mine=1&include_inactive=1`);
    setMyPostedJobs(Array.isArray(response.data) ? (response.data as JobPost[]) : []);
  }, [authenticatedFetch]);

  const loadChats = useCallback(async () => {
    const response = await authenticatedFetch(API_ENDPOINTS.FORUM.CHATS);
    const roomList = sortChatRooms(
      (Array.isArray(response.data?.rooms) ? (response.data.rooms as ChatRoom[]) : [])
        .map((room) => mergeKnownPresenceIntoRoom(room, chatPresenceByGraduateRef.current)),
    );
    const directoryList = (Array.isArray(response.data?.directory) ? (response.data.directory as ChatParticipant[]) : [])
      .map((participant) => mergeKnownPresenceIntoParticipant(participant, chatPresenceByGraduateRef.current));

    setRooms(roomList);
    setDirectory(directoryList);

    if (roomList.length === 0 && !temporaryChatRecipientRef.current) {
      setSelectedRoomId(null);
      setActiveRoom(null);
      setRoomMessages([]);
      setMessagePagination(null);
      return;
    }

    setSelectedRoomId((current) => {
      if (current && roomList.some((room) => room.id === current)) {
        return current;
      }
      if (temporaryChatRecipientRef.current) {
        return null;
      }
      return roomList[0].id;
    });
  }, [authenticatedFetch]);

  const loadGraduateProfile = useCallback(async () => {
    if (profileTargetGraduateId <= 0) {
      return;
    }

    const requestId = ++viewedProfileRequestRef.current;
    setViewedProfileLoading(true);

    try {
      const endpoint = isViewingOwnProfile
        ? API_ENDPOINTS.GRADUATE_PROFILE
        : `${API_ENDPOINTS.GRADUATE_PROFILE}?graduate_id=${profileTargetGraduateId}`;
      const response = await authenticatedFetch(endpoint);
      if (requestId === viewedProfileRequestRef.current) {
        setViewedProfileDetails((response.data as GraduateProfilePayload | undefined) || null);
        setViewedProfileLoaded(true);
      }
    } finally {
      if (requestId === viewedProfileRequestRef.current) {
        setViewedProfileLoading(false);
      }
    }
  }, [authenticatedFetch, isViewingOwnProfile, profileTargetGraduateId]);

  const loadMiniProfile = useCallback(async (graduateId: number): Promise<GraduateMiniProfileData> => {
    const response = await authenticatedFetch(`${API_ENDPOINTS.GRADUATE_MINI_PROFILE}?graduate_id=${graduateId}`);
    const profile = response.data?.profile as GraduateMiniProfileData | undefined;
    if (!profile || Number(profile.graduate_id) !== graduateId) {
      throw new Error('Graduate profile not found');
    }
    return profile;
  }, [authenticatedFetch]);

  const loadProfileForumPosts = useCallback(async () => {
    const requestId = ++viewedProfilePostsRequestRef.current;
    if (!communityAvailable || profileTargetGraduateId <= 0) {
      setProfileForumPosts([]);
      return;
    }

    if (isViewingOwnProfile) {
      await loadMyForumPosts();
      return;
    }

    const response = await authenticatedFetch(`${API_ENDPOINTS.FORUM.POSTS}?graduate_id=${profileTargetGraduateId}`);
    if (requestId === viewedProfilePostsRequestRef.current) {
      setProfileForumPosts(Array.isArray(response.data) ? (response.data as ForumPost[]) : []);
    }
  }, [authenticatedFetch, communityAvailable, isViewingOwnProfile, loadMyForumPosts, profileTargetGraduateId]);

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
      const requestId = ++roomLoadRequestRef.current;
      if (!silent) {
        setRoomLoading(true);
      }

      try {
        const response = await authenticatedFetch(`${API_ENDPOINTS.FORUM.CHAT_MESSAGES}?room_id=${roomId}&limit=30`);
        if (requestId !== roomLoadRequestRef.current || selectedRoomIdRef.current !== roomId) return;

        const serverMessages = Array.isArray(response.data?.messages)
          ? (response.data.messages as ChatMessage[]).map((message) => normalizeChatMessage(message, currentGraduateId))
          : [];
        const responseRoom = response.data?.room as ChatRoom | undefined;
        setActiveRoom(responseRoom ? mergeKnownPresenceIntoRoom(responseRoom, chatPresenceByGraduateRef.current) : null);
        setRoomMessages((current) => {
          const pendingForRoom = current.filter((message) => (
            message.room_id === roomId
            && (message.id < 0 || message.status === 'sending' || message.status === 'failed')
          ));
          const next = silent
            ? mergeChatMessages(current.filter((message) => message.room_id === roomId), serverMessages)
            : mergeChatMessages(serverMessages, pendingForRoom);
          roomMessagesRef.current = next;
          return next;
        });
        if (!silent) {
          setMessagePagination((response.data?.pagination as MessagePagination | undefined) || null);
          setChatNewMessageAvailable(false);
        }
      } catch (error) {
        if (!silent && requestId === roomLoadRequestRef.current) {
          notify('error', error instanceof Error ? error.message : 'Unable to load conversation', 'Messages');
        }
      } finally {
        if (!silent && requestId === roomLoadRequestRef.current) {
          setRoomLoading(false);
        }
      }
    },
    [authenticatedFetch, currentGraduateId, notify],
  );

  const loadOlderRoomMessages = useCallback(async () => {
    if (!selectedRoomId || olderMessagesLoading || !messagePagination?.has_more_older) return;

    const beforeId = messagePagination.oldest_id || roomMessages.find((message) => message.id > 0)?.id;
    if (!beforeId) return;

    setOlderMessagesLoading(true);
    try {
      const response = await authenticatedFetch(`${API_ENDPOINTS.FORUM.CHAT_MESSAGES}?room_id=${selectedRoomId}&before_id=${beforeId}&limit=30`);
      const olderMessages = Array.isArray(response.data?.messages)
        ? (response.data.messages as ChatMessage[]).map((message) => normalizeChatMessage(message, currentGraduateId))
        : [];

      setRoomMessages((current) => {
        const next = mergeChatMessages(olderMessages, current);
        roomMessagesRef.current = next;
        return next;
      });
      setMessagePagination((response.data?.pagination as MessagePagination | undefined) || null);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to load older messages', 'Messages');
    } finally {
      setOlderMessagesLoading(false);
    }
  }, [authenticatedFetch, currentGraduateId, messagePagination, notify, olderMessagesLoading, roomMessages, selectedRoomId]);

  const loadMissedRoomMessages = useCallback(
    async (roomId: number) => {
      let newestId = getNewestMessageId(roomMessagesRef.current.filter((message) => message.room_id === roomId));
      if (!newestId) {
        await loadRoomMessages(roomId, true);
        return;
      }

      const missedMessages: ChatMessage[] = [];
      let hasMoreNewer = true;
      let pageCount = 0;

      while (hasMoreNewer && pageCount < 10) {
        pageCount += 1;
        const response = await authenticatedFetch(`${API_ENDPOINTS.FORUM.CHAT_MESSAGES}?room_id=${roomId}&after_id=${newestId}&limit=60`);
        const pageMessages = Array.isArray(response.data?.messages)
          ? (response.data.messages as ChatMessage[]).map((message) => normalizeChatMessage(message, currentGraduateId))
          : [];

        if (pageMessages.length === 0) {
          break;
        }

        missedMessages.push(...pageMessages);
        newestId = getNewestMessageId(pageMessages) || newestId;
        hasMoreNewer = Boolean((response.data?.pagination as MessagePagination | undefined)?.has_more_newer);
      }

      if (missedMessages.length > 0) {
        setRoomMessages((current) => {
          if (selectedRoomIdRef.current !== roomId) return current;
          const next = mergeChatMessages(current, missedMessages);
          roomMessagesRef.current = next;
          return next;
        });
      }
    },
    [authenticatedFetch, currentGraduateId, loadRoomMessages],
  );

  const markVisibleMessagesAsRead = useCallback(
    async (roomId = selectedRoomIdRef.current || 0, messages = roomMessagesRef.current) => {
      if (!roomId || messages.length === 0) return;

      // The read cursor represents how far the user has viewed in the room, not
      // only the newest unread message. Deleted tombstones are still valid
      // positions in the persisted conversation history.
      const newestVisible = [...messages].reverse().find((message) => message.id > 0);
      if (!newestVisible) return;

      const previousMarkedId = lastMarkedReadIdByRoomRef.current.get(roomId) || 0;
      if (previousMarkedId >= newestVisible.id) return;
      lastMarkedReadIdByRoomRef.current.set(roomId, newestVisible.id);

      try {
        const socket = chatSocketRef.current;
        let markedThroughSocket = false;
        if (socket?.connected) {
          try {
            const response = await emitWithAck(socket, 'message:read', {
              room_id: roomId,
              up_to_message_id: newestVisible.id,
            });
            markedThroughSocket = response.success;
          } catch {
            markedThroughSocket = false;
          }
        }

        // The REST read operation is idempotent and keeps unread state usable
        // while the realtime service is reconnecting or running an older build.
        if (!markedThroughSocket) {
          await authenticatedFetch(API_ENDPOINTS.FORUM.CHAT_MESSAGES, {
            method: 'POST',
            body: JSON.stringify({
              action: 'read',
              room_id: roomId,
              up_to_message_id: newestVisible.id,
            }),
          });
        }

        const localReadAt = new Date().toISOString();
        setRoomMessages((current) => {
          if (selectedRoomIdRef.current !== roomId) return current;
          const next = current.map((message) => (
            !message.is_mine && message.id > 0 && message.id <= newestVisible.id
              ? { ...message, read_at: message.read_at || localReadAt }
              : message
          ));
          roomMessagesRef.current = next;
          return next;
        });
        setRooms((current) => current.map((room) => (room.id === roomId ? { ...room, unread_count: 0 } : room)));
      } catch {
        if (lastMarkedReadIdByRoomRef.current.get(roomId) === newestVisible.id) {
          if (previousMarkedId > 0) {
            lastMarkedReadIdByRoomRef.current.set(roomId, previousMarkedId);
          } else {
            lastMarkedReadIdByRoomRef.current.delete(roomId);
          }
        }
        // Read receipts are best effort and will be retried on the next sync.
      }
    },
    [authenticatedFetch],
  );

  useEffect(() => {
    loadMissedRoomMessagesRef.current = loadMissedRoomMessages;
  }, [loadMissedRoomMessages]);

  useEffect(() => {
    markVisibleMessagesAsReadRef.current = markVisibleMessagesAsRead;
  }, [markVisibleMessagesAsRead]);

  const upsertConversation = useCallback((conversation?: ChatRoom | null) => {
    if (!conversation) return;

    conversation.participants.forEach((participant) => {
      if (typeof participant.is_online !== 'boolean') return;
      const previous = chatPresenceByGraduateRef.current.get(participant.graduate_id);
      chatPresenceByGraduateRef.current.set(participant.graduate_id, {
        graduate_id: participant.graduate_id,
        is_online: participant.is_online,
        last_active_at: participant.is_online
          ? (previous?.last_active_at ?? participant.last_active_at ?? null)
          : (participant.last_active_at ?? previous?.last_active_at ?? null),
      });
    });
    const synchronizedConversation = mergeKnownPresenceIntoRoom(conversation, chatPresenceByGraduateRef.current);
    const visibleConversation = synchronizedConversation;

    setRooms((current) => {
      const exists = current.some((room) => room.id === visibleConversation.id);
      const next = exists
        ? current.map((room) => (room.id === visibleConversation.id ? { ...room, ...visibleConversation } : room))
        : [visibleConversation, ...current];
      return sortChatRooms(next);
    });

    setActiveRoom((current) => (
      current?.id === visibleConversation.id ? { ...current, ...visibleConversation } : current
    ));
  }, []);

  const loadConversationInfo = useCallback(async (roomId: number, silent = false) => {
    const requestId = ++conversationInfoRequestRef.current;
    if (!silent) setConversationInfoLoading(true);

    try {
      const response = await authenticatedFetch(`${API_ENDPOINTS.FORUM.CONVERSATION_INFO}?room_id=${roomId}`);
      if (requestId !== conversationInfoRequestRef.current || selectedRoomIdRef.current !== roomId) return null;
      const responseInfo = (response.data as ConversationInformation | undefined) || null;
      const nextInfo = responseInfo
        ? { ...responseInfo, room: mergeKnownPresenceIntoRoom(responseInfo.room, chatPresenceByGraduateRef.current) }
        : null;
      setConversationInfo(nextInfo);
      if (nextInfo?.room) upsertConversation(nextInfo.room);
      return nextInfo;
    } catch (error) {
      if (!silent && requestId === conversationInfoRequestRef.current) {
        notify('error', error instanceof Error ? error.message : 'Unable to load conversation information', 'Conversation Information');
      }
      return null;
    } finally {
      if (!silent && requestId === conversationInfoRequestRef.current) setConversationInfoLoading(false);
    }
  }, [authenticatedFetch, notify, upsertConversation]);

  const applyPresenceStatuses = useCallback((statuses: ChatPresenceStatus[]) => {
    if (!Array.isArray(statuses) || statuses.length === 0) return;

    statuses.forEach((status) => {
      const graduateId = Number(status.graduate_id || 0);
      if (!graduateId) return;
      const previous = chatPresenceByGraduateRef.current.get(graduateId);
      chatPresenceByGraduateRef.current.set(graduateId, {
        graduate_id: graduateId,
        is_online: Boolean(status.is_online),
        last_active_at: status.is_online
          ? (previous?.last_active_at ?? status.last_active_at ?? null)
          : (status.last_active_at ?? previous?.last_active_at ?? null),
      });
    });

    const updateParticipant = (participant: ChatParticipant) => (
      mergeKnownPresenceIntoParticipant(participant, chatPresenceByGraduateRef.current)
    );

    setRooms((current) => current.map((room) => ({ ...room, participants: room.participants.map(updateParticipant) })));
    setDirectory((current) => current.map(updateParticipant));
    setActiveRoom((current) => current ? { ...current, participants: current.participants.map(updateParticipant) } : current);
    setTemporaryChatRecipient((current) => {
      const next = current ? updateParticipant(current) : current;
      temporaryChatRecipientRef.current = next;
      return next;
    });
    setConversationInfo((current) => current ? { ...current, room: { ...current.room, participants: current.room.participants.map(updateParticipant) } } : current);
    setAddMemberCandidates((current) => current.map(updateParticipant));
  }, []);

  const applyPresenceStatus = useCallback((status: ChatPresenceStatus) => {
    applyPresenceStatuses([status]);
  }, [applyPresenceStatuses]);

  const applyMessageDelivery = useCallback((payload: { messages?: Array<{ id: number; delivered_at?: string | null }> }) => {
    const deliveredById = new Map((payload.messages || []).map((message) => [Number(message.id), message.delivered_at || new Date().toISOString()]));
    if (deliveredById.size === 0) return;

    setRoomMessages((current) => {
      const next = current.map((message) => (
        deliveredById.has(message.id)
          ? { ...message, delivered_at: deliveredById.get(message.id) || message.delivered_at, status: message.read_at ? 'read' as const : 'delivered' as const }
          : message
      ));
      roomMessagesRef.current = next;
      return next;
    });
  }, []);

  const applyMessageRead = useCallback((payload: { messages?: Array<{ id: number; read_at?: string | null }> }) => {
    const readById = new Map((payload.messages || []).map((message) => [Number(message.id), message.read_at || new Date().toISOString()]));
    if (readById.size === 0) return;

    setRoomMessages((current) => {
      const next = current.map((message) => (
        readById.has(message.id)
          ? {
              ...message,
              read_at: readById.get(message.id) || message.read_at,
              delivered_at: message.delivered_at || readById.get(message.id) || null,
              status: 'read' as const,
            }
          : message
      ));
      roomMessagesRef.current = next;
      return next;
    });
  }, []);

  const loadBootData = useCallback(
    async (silent = false, tab: PortalTab = 'announcements') => {
      if (!silent) {
        setLoading(true);
      }

      const tasks = [
        { key: 'rating', label: 'rating summary', run: loadRatingSummary },
        ...(communityAvailable ? [
          { key: 'forum', label: 'forum feed', run: loadForumFeed },
          { key: 'my_forum', label: 'my forum posts', run: loadMyForumPosts },
        ] : []),
        ...(jobsAvailable ? [
          { key: 'jobs', label: 'jobs', run: loadJobs },
          { key: 'job_programs', label: 'job programs', run: loadJobPrograms },
          { key: 'job_locations', label: 'job locations', run: loadJobLocations },
          { key: 'saved_jobs', label: 'saved jobs', run: loadSavedJobs },
          { key: 'my_jobs', label: 'my job posts', run: loadMyJobs },
        ] : []),
        ...(messagingAvailable ? [
          { key: 'chats', label: 'chats', run: loadChats },
        ] : []),
      ];

      const blockingKeysByTab: Record<PortalTab, string[]> = {
        announcements: [],
        dashboard: tasks.map((task) => task.key),
        community_forum: communityAvailable ? ['forum', 'my_forum'] : [],
        messages: messagingAvailable ? ['chats'] : [],
        jobs: jobsAvailable ? ['jobs', 'rating'] : [],
        saved_jobs: jobsAvailable ? ['saved_jobs'] : [],
        job_posting: jobsAvailable ? ['my_jobs', 'rating'] : [],
        my_profile: communityAvailable ? ['rating', 'activity'] : ['rating'],
        settings: [],
      };

      const blockingKeys = new Set(silent ? tasks.map((task) => task.key) : blockingKeysByTab[tab]);
      const blockingTasks = tasks.filter((task) => blockingKeys.has(task.key));
      const backgroundTasks = silent ? [] : tasks.filter((task) => !blockingKeys.has(task.key));

      const results = await Promise.allSettled(blockingTasks.map((task) => task.run()));

      if (!silent) {
        setLoading(false);
      }

      const failed = results
        .map((result, index) => (result.status === 'rejected' ? blockingTasks[index].label : null))
        .filter(Boolean);

      if (failed.length > 0 && !silent) {
        notify('warning', `Some data could not be loaded: ${failed.join(', ')}.`);
      }

      if (backgroundTasks.length > 0) {
        void Promise.allSettled(backgroundTasks.map((task) => task.run()));
      }
    },
    [communityAvailable, jobsAvailable, loadChats, loadForumFeed, loadJobLocations, loadJobPrograms, loadJobs, loadMyForumPosts, loadMyJobs, loadRatingSummary, loadSavedJobs, messagingAvailable, notify],
  );

  const closePostDetail = useCallback(() => {
    setSelectedPostOpen(false);
    setHighlightedCommentId(null);

    const nextParams = new URLSearchParams(searchParams);
    if (nextParams.has('post_id') || nextParams.has('comment_id')) {
      nextParams.delete('post_id');
      nextParams.delete('comment_id');
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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
    if (bootStartedRef.current) return;
    bootStartedRef.current = true;
    void loadBootData(false, activeTab);
  }, [activeTab, loadBootData]);

  useEffect(() => {
    if (profileTargetGraduateId <= 0) return;
    viewedProfileRequestRef.current += 1;
    viewedProfilePostsRequestRef.current += 1;
    setViewedProfileDetails(null);
    setViewedProfileLoaded(false);
    setViewedProfileLoading(false);
    setProfileImageFile(null);
    setAuthenticatedProfileImagePreview('');
    setCoverImageFile(null);
    setCoverImagePreview('');
    setCoverRemoveRequested(false);
    setProfileForumPosts([]);
  }, [profileTargetGraduateId]);

  useEffect(() => {
    if (isAnnouncementRoute) {
      setActiveTab('announcements');
      return;
    }

    if (isCommunityProfileRoute) {
      setActiveTab('my_profile');
      return;
    }

    if (!searchParams.get('tab')) {
      setActiveTab('community_forum');
      navigate('/graduate/portal?tab=community_forum', { replace: true });
      return;
    }

    setActiveTab(getPortalTab(searchParams.get('tab')));
  }, [isAnnouncementRoute, isCommunityProfileRoute, navigate, searchParams]);

  useEffect(() => {
    if (!['my_profile', 'settings'].includes(activeTab) || profileTargetGraduateId <= 0 || viewedProfileLoaded || viewedProfileLoading) {
      return;
    }

    void loadGraduateProfile().catch((error) => {
      notify('warning', error instanceof Error ? error.message : 'Unable to load profile details', 'My Profile');
    });
  }, [activeTab, loadGraduateProfile, notify, profileTargetGraduateId, viewedProfileLoaded, viewedProfileLoading]);

  useEffect(() => {
    if (activeTab === 'settings') {
      setProfileEditSection(getProfileEditSection(searchParams.get('section')));
    }
  }, [activeTab, searchParams]);

  useEffect(() => {
    if (activeTab !== 'my_profile' || profileTargetGraduateId <= 0) {
      return;
    }

    void loadProfileForumPosts().catch((error) => {
      notify('warning', error instanceof Error ? error.message : 'Unable to load profile posts', 'Community Profile');
    });
  }, [activeTab, loadProfileForumPosts, notify, profileTargetGraduateId]);

  useEffect(() => {
    if (!communityAvailable) {
      routePostTargetRef.current = '';
      return;
    }

    const postId = parsePositiveIntParam(searchParams.get('post_id'));
    if (postId <= 0) {
      routePostTargetRef.current = '';
      return;
    }

    const commentId = parsePositiveIntParam(searchParams.get('comment_id'));
    const routeKey = `${postId}:${commentId || 0}`;
    if (routePostTargetRef.current === routeKey) {
      return;
    }

    routePostTargetRef.current = routeKey;
    setActiveTab('community_forum');
    setForumSearch('');
    setForumCategory('all');
    setHighlightedCommentId(commentId || null);
    void loadPostDetail(postId);
  }, [communityAvailable, loadPostDetail, searchParams]);

  useEffect(() => {
    const reportId = parsePositiveIntParam(searchParams.get('report_id'));
    if (reportId <= 0) {
      setReportDetail(null);
      setReportDetailError('');
      return;
    }

    let cancelled = false;
    setActiveTab('community_forum');
    setReportDetailLoading(true);
    setReportDetailError('');
    void authenticatedFetch(`${API_ENDPOINTS.FORUM.REPORTS}?id=${reportId}`)
      .then((response) => {
        if (!cancelled) setReportDetail(response.data as ForumReportDetail);
      })
      .catch((error) => {
        if (!cancelled) {
          setReportDetail(null);
          setReportDetailError(error instanceof Error ? error.message : 'Unable to load report details');
        }
      })
      .finally(() => {
        if (!cancelled) setReportDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authenticatedFetch, searchParams]);

  useEffect(() => {
    if (!jobsAvailable) {
      routeJobTargetRef.current = '';
      return;
    }

    const jobId = parsePositiveIntParam(searchParams.get('job_id'));
    if (jobId <= 0) {
      routeJobTargetRef.current = '';
      return;
    }

    const routeKey = String(jobId);
    if (routeJobTargetRef.current !== routeKey) {
      routeJobTargetRef.current = routeKey;
      setActiveTab('jobs');
      clearJobFilters();
    }

    const targetJobIndex = filteredJobs.findIndex((job) => job.id === jobId);
    if (activeTab !== 'jobs' || targetJobIndex < 0) {
      return;
    }

    setJobPage(Math.floor(targetJobIndex / JOBS_PER_PAGE) + 1);
    setHighlightedJobId(jobId);
    const scrollTimer = window.setTimeout(() => {
      jobCardRefs.current[jobId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    const clearTimer = window.setTimeout(() => {
      setHighlightedJobId((current) => (current === jobId ? null : current));
    }, 4500);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [activeTab, clearJobFilters, filteredJobs, jobsAvailable, searchParams]);

  useEffect(() => {
    if (!messagingAvailable) {
      routeMessageTargetRef.current = '';
      return;
    }
    const roomId = parsePositiveIntParam(searchParams.get('room_id'));
    if (roomId <= 0) {
      routeMessageTargetRef.current = '';
      return;
    }
    const routeKey = `${roomId}:${parsePositiveIntParam(searchParams.get('message_id'))}`;
    setActiveTab('messages');
    const room = rooms.find((item) => item.id === roomId);
    if (!room || routeMessageTargetRef.current === routeKey) return;
    routeMessageTargetRef.current = routeKey;
    temporaryChatRecipientRef.current = null;
    setTemporaryChatRecipient(null);
    selectedRoomIdRef.current = roomId;
    setSelectedRoomId(roomId);
    setActiveRoom(mergeKnownPresenceIntoRoom(room, chatPresenceByGraduateRef.current));
    setChatMobileConversationOpen(true);
  }, [messagingAvailable, rooms, searchParams]);

  useEffect(() => {
    if (!selectedPostOpen || !highlightedCommentId || postComments.length === 0) {
      return;
    }

    const scrollTimer = window.setTimeout(() => {
      commentRefs.current[highlightedCommentId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);

    return () => window.clearTimeout(scrollTimer);
  }, [highlightedCommentId, postComments, selectedPostOpen]);

  useEffect(() => {
    if (!selectedPostOpen || !newPostCommentId || !postComments.some((comment) => comment.id === newPostCommentId)) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const container = selectedPostCommentsContainerRef.current;
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }
      setNewPostCommentId(null);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [newPostCommentId, postComments, selectedPostOpen]);

  useEffect(() => {
    if (activeTab !== 'messages') return;

    if (temporaryChatRecipientRef.current) {
      return;
    }

    if (rooms.length === 0) {
      setSelectedRoomId(null);
      setActiveRoom(null);
      setRoomMessages([]);
      setMessagePagination(null);
      setChatMobileConversationOpen(false);
      return;
    }

    setSelectedRoomId((current) => {
      if (current && rooms.some((room) => room.id === current)) {
        return current;
      }

      return rooms[0].id;
    });
  }, [activeTab, rooms, temporaryChatRecipient]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const handleChange = (event: MediaQueryListEvent) => setIsDesktopMessagingLayout(event.matches);
    setIsDesktopMessagingLayout(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    setProfileForm(createProfileForm(viewedProfileRecord, viewedProfileUser));
  }, [viewedProfileRecord, viewedProfileUser]);

  useEffect(() => {
    activeTabRef.current = activeTab;
    profileSavingRef.current = profileSaving;
    profileTargetGraduateIdRef.current = profileTargetGraduateId;
  }, [activeTab, profileSaving, profileTargetGraduateId]);

  useEffect(() => {
    const graduateId = Number(profileTargetGraduateId || 0);
    const profileTime = parseDate(viewedProfileRecord?.updated_at)?.getTime() || 0;
    if (!graduateId || !profileTime) return;
    const previous = profileRealtimeVersionsRef.current.get(graduateId);
    if (!previous || profileTime > previous.profileTime) {
      profileRealtimeVersionsRef.current.set(graduateId, { profileTime, eventTime: 0 });
    }
  }, [profileTargetGraduateId, viewedProfileRecord?.updated_at]);

  useEffect(() => {
    const savedForm = createProfileForm(viewedProfileRecord, viewedProfileUser);
    const editableKeys: Array<keyof ProfileFormState> = [
      'first_name', 'middle_name', 'last_name', 'email', 'phone_number', 'birthday',
      'civil_status', 'sex_gender', 'program_course', 'graduation_year', 'current_location',
      'job_title', 'company_name', 'employment_location', 'professional_status', 'start_date',
      'current_password', 'password', 'confirm_password',
    ];
    profileFormDirtyRef.current = activeTab === 'settings' && (
      editableKeys.some((key) => profileForm[key] !== savedForm[key])
      || profileImageFile !== null
      || coverImageFile !== null
      || coverRemoveRequested
    );
  }, [activeTab, coverImageFile, coverRemoveRequested, profileForm, profileImageFile, viewedProfileRecord, viewedProfileUser]);

  useEffect(() => {
    if (!isViewingOwnProfile) {
      if (!profileImageFile) {
        setAuthenticatedProfileImagePreview('');
      }
      return;
    }
    if (!profileImageFile) {
      setAuthenticatedProfileImagePreview(resolveAssetUrl(viewedProfileUser?.profile_image_path));
    }
  }, [isViewingOwnProfile, profileImageFile, viewedProfileUser?.profile_image_path]);

  useEffect(() => {
    if (!coverImageFile && !coverRemoveRequested) {
      setCoverImagePreview(resolveAssetUrl(viewedProfileUser?.cover_image_path));
    }
  }, [coverImageFile, coverRemoveRequested, viewedProfileUser?.cover_image_path]);

  useEffect(() => {
    return () => {
      if (authenticatedProfileImagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(authenticatedProfileImagePreview);
      }
    };
  }, [authenticatedProfileImagePreview]);

  useEffect(() => {
    return () => {
      if (coverImagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(coverImagePreview);
      }
    };
  }, [coverImagePreview]);

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
    selectedRoomIdRef.current = selectedRoomId;
  }, [selectedRoomId]);

  useEffect(() => {
    temporaryChatRecipientRef.current = temporaryChatRecipient;
  }, [temporaryChatRecipient]);

  // The existing singleton messaging connection also carries authenticated,
  // non-message portal events. Messaging listeners and event names stay intact.
  const chatRealtimeEnabled = currentGraduateId > 0;
  const chatSurfaceOpen = messagingAvailable;
  const floatingConversationSurfaceOpen = messagingAvailable
    && activeTab === 'community_forum'
    && floatingChatOpen
    && !floatingChatMinimized;
  const chatConversationSurfaceOpen = messagingAvailable
    && (
      (activeTab === 'messages' && (isDesktopMessagingLayout || chatMobileConversationOpen))
      || floatingConversationSurfaceOpen
    );

  useEffect(() => {
    chatConversationSurfaceOpenRef.current = chatConversationSurfaceOpen;
  }, [chatConversationSurfaceOpen]);

  useEffect(() => {
    conversationInfoOpenRef.current = conversationInfoOpen;
  }, [conversationInfoOpen]);

  useEffect(() => {
    const socket = chatSocketRef.current;
    const joinedRoomId = chatJoinedRoomIdRef.current;
    const typingRoomId = chatTypingRoomIdRef.current;
    const previousSelectedRoomId = previousSelectedRoomIdRef.current;
    previousSelectedRoomIdRef.current = selectedRoomId;

    if (previousSelectedRoomId && previousSelectedRoomId !== selectedRoomId) {
      setChatMessageDraft('');
      setChatSelectedAttachment((current) => {
        if (current?.preview_url) URL.revokeObjectURL(current.preview_url);
        return null;
      });
      setChatNewMessageAvailable(false);
      setConversationInfo(null);
      setConversationInfoOpen(false);
    }

    if (chatTypingStopTimeoutRef.current) {
      window.clearTimeout(chatTypingStopTimeoutRef.current);
      chatTypingStopTimeoutRef.current = null;
    }
    if (socket?.connected && typingRoomId) {
      socket.emit('typing:stop', { room_id: typingRoomId });
    }
    chatTypingRoomIdRef.current = null;
    chatTypingLastEmittedAtRef.current = 0;

    if (!selectedRoomId || !chatConversationSurfaceOpen) {
      if (socket?.connected && joinedRoomId) {
        socket.emit('conversation:leave', { room_id: joinedRoomId });
      }
      chatJoinedRoomIdRef.current = null;
      return;
    }

    setChatTypingUsers((current) => ({ ...current, [selectedRoomId]: {} }));
    void loadRoomMessages(selectedRoomId);
    void loadConversationInfo(selectedRoomId, true);

    if (socket?.connected) {
      void (async () => {
        if (joinedRoomId && joinedRoomId !== selectedRoomId) {
          await emitWithAck(socket, 'conversation:leave', { room_id: joinedRoomId });
        }
        const response = await emitWithAck(socket, 'conversation:join', { room_id: selectedRoomId });
        if (response.success && selectedRoomIdRef.current === selectedRoomId) {
          chatJoinedRoomIdRef.current = selectedRoomId;
        }
      })();
    }
  }, [chatConversationSurfaceOpen, loadConversationInfo, loadRoomMessages, selectedRoomId]);

  useEffect(() => {
    roomMessagesRef.current = roomMessages;
  }, [roomMessages]);

  useEffect(() => {
    lastMarkedReadIdByRoomRef.current.clear();
  }, [currentGraduateId]);

  useEffect(() => {
    if (!currentGraduateId || !chatRealtimeEnabled) {
      setChatConnectionStatus('disconnected');
      return undefined;
    }

    const socket = getRealtimeChatSocket();
    let hasConnectedOnce = false;
    let manualReconnectTimeout: number | null = null;
    const typingExpiryTimeouts = chatTypingExpiryTimeoutsRef.current;
    chatSocketRef.current = socket;
    setChatConnectionStatus('connecting');
    if (import.meta.env.DEV) console.info('[Realtime] Connecting...');

    const handleConnect = () => {
      if (manualReconnectTimeout !== null) {
        window.clearTimeout(manualReconnectTimeout);
        manualReconnectTimeout = null;
      }
      const isReconnect = hasConnectedOnce;
      hasConnectedOnce = true;
      setChatConnectionStatus('connected');
      if (import.meta.env.DEV) console.info(`[Realtime] Connected: ${socket.id}`);
      void emitWithAck<{ users?: ChatPresenceStatus[] }>(socket, 'presence:sync', {}).then((response) => {
        if (response.success && Array.isArray(response.users)) {
          applyPresenceStatuses(response.users);
        }
      });
      const roomId = selectedRoomIdRef.current;
      if (roomId && chatConversationSurfaceOpenRef.current) {
        void emitWithAck(socket, 'conversation:join', { room_id: roomId }).then(async (response) => {
          if (!response.success || selectedRoomIdRef.current !== roomId) return;
          chatJoinedRoomIdRef.current = roomId;
          if (isReconnect) {
            await loadMissedRoomMessagesRef.current(roomId);
          }
        });
      }
      if (isReconnect && messagingAvailable) {
        if (import.meta.env.DEV) console.info('[Realtime] Reconnected; synchronizing conversations and missed messages.');
        void loadChats();
      }
    };

    const handleDisconnect = (reason: string) => {
      chatJoinedRoomIdRef.current = null;
      chatTypingRoomIdRef.current = null;
      chatTypingLastEmittedAtRef.current = 0;
      setChatTypingUsers({});
      setChatConnectionStatus(socket.active ? 'reconnecting' : 'disconnected');
      if (import.meta.env.DEV) console.info(`[Realtime] Disconnected: ${reason}`);
    };

    const handleConnectError = (error: Error) => {
      setChatConnectionStatus('reconnecting');
      console.warn(`[Realtime] Connection failed: ${error.message}`);
      if (!socket.active && manualReconnectTimeout === null) {
        manualReconnectTimeout = window.setTimeout(() => {
          manualReconnectTimeout = null;
          if (chatSocketRef.current === socket && !socket.connected) {
            if (import.meta.env.DEV) console.info('[Realtime] Retrying rejected connection...');
            socket.connect();
          }
        }, 3000);
      }
    };

    const updateRoomPreview = (message: ChatMessage) => {
      setRooms((current) => sortChatRooms(current.map((room) => (
        room.id === message.room_id
          ? {
              ...room,
              last_message: getChatMessagePreview(message),
              last_message_type: message.message_type || 'text',
              last_message_at: message.created_at,
              last_message_sender_id: message.graduate_id,
              updated_at: message.created_at,
            }
          : room
      ))));
    };

    const removeTypingUser = (roomId: number, graduateId: number) => {
      const timeoutKey = `${roomId}:${graduateId}`;
      const timeoutId = typingExpiryTimeouts.get(timeoutKey);
      if (timeoutId) window.clearTimeout(timeoutId);
      typingExpiryTimeouts.delete(timeoutKey);
      setChatTypingUsers((current) => {
        const roomTyping = { ...(current[roomId] || {}) };
        delete roomTyping[graduateId];
        return { ...current, [roomId]: roomTyping };
      });
    };

    const handleMessageNew = (payload: { message?: ChatMessage }) => {
      if (!payload.message) return;
      const incoming = normalizeChatMessage(payload.message, currentGraduateId);
      if (import.meta.env.DEV) console.info(`[Realtime] Message received: ${incoming.id}`);
      updateRoomPreview(incoming);
      removeTypingUser(incoming.room_id, incoming.graduate_id);
      const isNewRealtimeMessage = incoming.id > 0 && !seenRealtimeMessageIdsRef.current.has(incoming.id);
      if (isNewRealtimeMessage) {
        if (seenRealtimeMessageIdsRef.current.size >= 1000) {
          seenRealtimeMessageIdsRef.current.clear();
        }
        seenRealtimeMessageIdsRef.current.add(incoming.id);
      }
      if (isNewRealtimeMessage && !incoming.is_mine) {
        if (incoming.message_type === 'job_share') {
          window.dispatchEvent(new CustomEvent('gradtrack:notifications-updated', { detail: { audience: 'graduate' } }));
        }
        const visibleAtNewest = selectedRoomIdRef.current === incoming.room_id
          && chatConversationSurfaceOpenRef.current
          && chatNearBottomRef.current;
        if (!visibleAtNewest) {
          setRooms((current) => current.map((room) => (
            room.id === incoming.room_id
              ? { ...room, unread_count: Math.max(0, Number(room.unread_count || 0)) + 1 }
              : room
          )));
        }
      }
      if (selectedRoomIdRef.current !== incoming.room_id || !chatConversationSurfaceOpenRef.current) return;

      const nextMessages = mergeChatMessages(roomMessagesRef.current, [incoming]);
      setRoomMessages(nextMessages);
      roomMessagesRef.current = nextMessages;
      const shouldStickToBottom = chatNearBottomRef.current;
      setChatNewMessageAvailable(!shouldStickToBottom);
      if (!incoming.is_mine && shouldStickToBottom) {
        void markVisibleMessagesAsReadRef.current(incoming.room_id, nextMessages);
      }
    };

    const handleMessageConfirmed = (payload: { message?: ChatMessage }) => {
      if (!payload.message) return;
      const sent = normalizeChatMessage(payload.message, currentGraduateId);
      updateRoomPreview(sent);
      if (selectedRoomIdRef.current !== sent.room_id) return;
      const nextMessages = mergeChatMessages(roomMessagesRef.current, [{ ...sent, status: sent.status || 'sent' }]);
      setRoomMessages(nextMessages);
      roomMessagesRef.current = nextMessages;
    };

    const handleMessageFailed = (payload: { room_id?: number; client_message_id?: string; error?: string }) => {
      const roomId = Number(payload.room_id || 0);
      if (!payload.client_message_id || selectedRoomIdRef.current !== roomId) return;
      const nextMessages = roomMessagesRef.current.map((message) => (
        message.client_message_id === payload.client_message_id
          ? { ...message, status: 'failed' as const, error: payload.error || 'Unable to send message' }
          : message
      ));
      roomMessagesRef.current = nextMessages;
      setRoomMessages(nextMessages);
    };

    const handleMessageDeleted = (payload: { room_id?: number; message_id?: number }) => {
      const roomId = Number(payload.room_id || 0);
      const messageId = Number(payload.message_id || 0);
      if (!roomId || !messageId) return;

      if (selectedRoomIdRef.current === roomId) {
        const nextMessages = roomMessagesRef.current.map((message) => (
          message.id === messageId
            ? { ...message, message: 'This message was deleted', is_deleted: true, attachments: [] }
            : message
        ));
        roomMessagesRef.current = nextMessages;
        setRoomMessages(nextMessages);
        if (conversationInfoOpenRef.current) {
          void loadConversationInfo(roomId, true);
        }
      }
      void loadChats();
    };

    const handleTypingUpdate = (payload: { room_id?: number; graduate_id?: number; name?: string; is_typing?: boolean }) => {
      const roomId = Number(payload.room_id || 0);
      const graduateId = Number(payload.graduate_id || 0);
      if (!roomId || !graduateId || graduateId === currentGraduateId) return;

      if (!payload.is_typing) {
        removeTypingUser(roomId, graduateId);
        return;
      }

      const expiresAt = Date.now() + 2800;
      setChatTypingUsers((current) => ({
        ...current,
        [roomId]: {
          ...(current[roomId] || {}),
          [graduateId]: { name: payload.name || 'Graduate', expiresAt },
        },
      }));

      const timeoutKey = `${roomId}:${graduateId}`;
      const previousTimeout = typingExpiryTimeouts.get(timeoutKey);
      if (previousTimeout) window.clearTimeout(previousTimeout);
      const timeoutId = window.setTimeout(() => {
        typingExpiryTimeouts.delete(timeoutKey);
        setChatTypingUsers((current) => {
          const typing = current[roomId]?.[graduateId];
          if (!typing || typing.expiresAt > Date.now()) return current;
          const roomTyping = { ...(current[roomId] || {}) };
          delete roomTyping[graduateId];
          return { ...current, [roomId]: roomTyping };
        });
      }, 3000);
      typingExpiryTimeouts.set(timeoutKey, timeoutId);
    };

    const handleConversationUpdated = (payload: { conversation?: ChatRoom | null }) => {
      upsertConversation(payload.conversation);
      const roomId = Number(payload.conversation?.id || 0);
      if (roomId && selectedRoomIdRef.current === roomId && conversationInfoOpenRef.current) {
        void loadConversationInfo(roomId, true);
      }
    };

    const handleUnreadUpdated = (payload: { rooms?: Record<string, number> }) => {
      if (!payload.rooms) return;
      setRooms((current) => current.map((room) => {
        const unreadCount = payload.rooms?.[String(room.id)];
        if (typeof unreadCount !== 'number') return room;
        return { ...room, unread_count: unreadCount };
      }));
    };

    const handleConversationPolicyUpdated = (payload: { room_id?: number }) => {
      const roomId = Number(payload.room_id || 0);
      if (roomId && selectedRoomIdRef.current === roomId) {
        void loadConversationInfo(roomId, true);
      }
    };

    const handleConversationMembersUpdated = (payload: { room_id?: number }) => {
      const roomId = Number(payload.room_id || 0);
      if (roomId && selectedRoomIdRef.current === roomId && conversationInfoOpenRef.current) {
        void loadConversationInfo(roomId, true);
      }
    };

    const handleConversationRemoved = (payload: { room_id?: number }) => {
      const roomId = Number(payload.room_id || 0);
      if (!roomId) return;
      setRooms((current) => current.filter((room) => room.id !== roomId));
      if (selectedRoomIdRef.current === roomId) {
        setSelectedRoomId(null);
        setActiveRoom(null);
        setRoomMessages([]);
        setConversationInfo(null);
        setConversationInfoOpen(false);
        setFloatingChatOpen(false);
      }
      void loadChats();
    };

    const handlePresenceSnapshot = (payload: { users?: ChatPresenceStatus[] }) => {
      if (Array.isArray(payload.users)) applyPresenceStatuses(payload.users);
    };

    const handleReconnectAttempt = () => {
      setChatConnectionStatus('reconnecting');
      if (import.meta.env.DEV) console.info('[Realtime] Reconnecting...');
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('message:new', handleMessageNew);
    socket.on('message:confirmed', handleMessageConfirmed);
    socket.on('message:failed', handleMessageFailed);
    socket.on('message:deleted', handleMessageDeleted);
    socket.on('message:delivered', applyMessageDelivery);
    socket.on('message:read', applyMessageRead);
    socket.on('typing:update', handleTypingUpdate);
    socket.on('conversation:updated', handleConversationUpdated);
    socket.on('conversation:policy-updated', handleConversationPolicyUpdated);
    socket.on('conversation:members-updated', handleConversationMembersUpdated);
    socket.on('conversation:removed', handleConversationRemoved);
    socket.on('unread-count:updated', handleUnreadUpdated);
    socket.on('user:status', applyPresenceStatus);
    socket.on('presence:snapshot', handlePresenceSnapshot);
    socket.io.on('reconnect_attempt', handleReconnectAttempt);
    socket.connect();

    return () => {
      const typingRoomId = chatTypingRoomIdRef.current;
      if (typingRoomId && socket.connected) {
        socket.emit('typing:stop', { room_id: typingRoomId });
      }
      if (chatTypingStopTimeoutRef.current) {
        window.clearTimeout(chatTypingStopTimeoutRef.current);
        chatTypingStopTimeoutRef.current = null;
      }
      if (manualReconnectTimeout !== null) {
        window.clearTimeout(manualReconnectTimeout);
        manualReconnectTimeout = null;
      }
      typingExpiryTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
      typingExpiryTimeouts.clear();
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('message:new', handleMessageNew);
      socket.off('message:confirmed', handleMessageConfirmed);
      socket.off('message:failed', handleMessageFailed);
      socket.off('message:deleted', handleMessageDeleted);
      socket.off('message:delivered', applyMessageDelivery);
      socket.off('message:read', applyMessageRead);
      socket.off('typing:update', handleTypingUpdate);
      socket.off('conversation:updated', handleConversationUpdated);
      socket.off('conversation:policy-updated', handleConversationPolicyUpdated);
      socket.off('conversation:members-updated', handleConversationMembersUpdated);
      socket.off('conversation:removed', handleConversationRemoved);
      socket.off('unread-count:updated', handleUnreadUpdated);
      socket.off('user:status', applyPresenceStatus);
      socket.off('presence:snapshot', handlePresenceSnapshot);
      socket.io.off('reconnect_attempt', handleReconnectAttempt);
      destroyRealtimeChatSocket(socket);
      chatSocketRef.current = null;
      chatJoinedRoomIdRef.current = null;
      chatTypingRoomIdRef.current = null;
      chatTypingLastEmittedAtRef.current = 0;
    };
  }, [applyMessageDelivery, applyMessageRead, applyPresenceStatus, applyPresenceStatuses, chatRealtimeEnabled, currentGraduateId, loadChats, loadConversationInfo, messagingAvailable, upsertConversation]);

  useEffect(() => {
    if (!currentGraduateId) return undefined;

    const socket = getRealtimeChatSocket();
    const rememberEvent = (eventName: string, payload: RealtimeMutationEnvelope) => {
      const key = `${eventName}:${payload.event_id || ''}`;
      if (!payload.event_id || seenPortalEventIdsRef.current.has(key)) return false;
      if (seenPortalEventIdsRef.current.size >= 2000) seenPortalEventIdsRef.current.clear();
      seenPortalEventIdsRef.current.add(key);
      return true;
    };

    const updateCommentCount = (postId: number, commentCount: number) => {
      const updatePost = (post: ForumPost) => post.id === postId
        ? { ...post, comment_count: commentCount }
        : post;
      setForumPosts((current) => current.map(updatePost));
      setMyForumPosts((current) => current.map(updatePost));
      setProfileForumPosts((current) => current.map(updatePost));
      setSelectedPost((current) => current?.id === postId ? updatePost(current) : current);
      setMediaViewer((current) => current?.post.id === postId
        ? { ...current, post: updatePost(current.post) }
        : current);
    };

    const handlePostCreated = (payload: RealtimeMutationEnvelope & { post?: ForumPost }) => {
      if (!rememberEvent('community:post-created', payload) || !payload.post) return;
      const post = payload.post;
      setForumPosts((current) => upsertForumPost(current, post));
      if (post.graduate_id === currentGraduateId) {
        setMyForumPosts((current) => upsertForumPost(current, post));
      }
      if (post.graduate_id === profileTargetGraduateIdRef.current) {
        setProfileForumPosts((current) => upsertForumPost(current, post));
      }
    };

    const handlePostUpdated = (payload: RealtimeMutationEnvelope & { post?: ForumPost }) => {
      if (!rememberEvent('community:post-updated', payload) || !payload.post) return;
      const post = payload.post;
      setForumPosts((current) => upsertForumPost(current, post));
      setMyForumPosts((current) => post.graduate_id === currentGraduateId
        ? upsertForumPost(current, post)
        : current.filter((item) => item.id !== post.id));
      setProfileForumPosts((current) => post.graduate_id === profileTargetGraduateIdRef.current
        ? upsertForumPost(current, post)
        : current.filter((item) => item.id !== post.id));
      setSelectedPost((current) => current?.id === post.id
        ? { ...post, is_liked: current.is_liked }
        : current);
      setMediaViewer((current) => current?.post.id === post.id
        ? { ...current, post: { ...post, is_liked: current.post.is_liked } }
        : current);
    };

    const handlePostDeleted = (payload: RealtimeMutationEnvelope & { post_id?: number }) => {
      if (!rememberEvent('community:post-deleted', payload)) return;
      const postId = Number(payload.post_id || 0);
      if (!postId) return;
      setForumPosts((current) => current.filter((post) => post.id !== postId));
      setMyForumPosts((current) => current.filter((post) => post.id !== postId));
      setProfileForumPosts((current) => current.filter((post) => post.id !== postId));
      if (selectedPost?.id === postId) {
        setSelectedPostOpen(false);
        setPostComments([]);
      }
      setSelectedPost((current) => current?.id === postId ? null : current);
      setMediaViewer((current) => current?.post.id === postId ? null : current);
    };

    const handleCommentCount = (payload: RealtimeMutationEnvelope & { post_id?: number; comment_count?: number }) => {
      if (!rememberEvent('community:comment-count', payload)) return;
      const postId = Number(payload.post_id || 0);
      if (postId) {
        commentRealtimeSequenceRef.current.set(
          postId,
          (commentRealtimeSequenceRef.current.get(postId) || 0) + 1,
        );
        updateCommentCount(postId, Math.max(0, Number(payload.comment_count || 0)));
      }
    };

    const handleCommentCreated = (payload: RealtimeMutationEnvelope & { post_id?: number; comment?: ForumComment; comment_count?: number }) => {
      if (!rememberEvent('community:comment-created', payload) || !payload.comment) return;
      const comment = payload.comment;
      const appendUnique = (current: ForumComment[]) => current.some((item) => item.id === comment.id)
        ? current
        : [...current, comment];
      setPostComments((current) => selectedPost?.id === comment.post_id ? appendUnique(current) : current);
      setMediaViewerComments((current) => mediaViewer?.post.id === comment.post_id ? appendUnique(current) : current);
      updateCommentCount(comment.post_id, Math.max(0, Number(payload.comment_count || 0)));
    };

    const handleCommentDeleted = (payload: RealtimeMutationEnvelope & { post_id?: number; comment_id?: number; comment_count?: number }) => {
      if (!rememberEvent('community:comment-deleted', payload)) return;
      const postId = Number(payload.post_id || 0);
      const commentId = Number(payload.comment_id || 0);
      if (!postId || !commentId) return;
      setPostComments((current) => current.filter((comment) => comment.id !== commentId));
      setMediaViewerComments((current) => current.filter((comment) => comment.id !== commentId));
      updateCommentCount(postId, Math.max(0, Number(payload.comment_count || 0)));
    };

    const handleReactionUpdated = (payload: RealtimeMutationEnvelope & {
      post_id?: number;
      actor_graduate_id?: number | null;
      actor_liked?: boolean | null;
      like_count?: number;
    }) => {
      if (!rememberEvent('community:reaction-updated', payload)) return;
      const postId = Number(payload.post_id || 0);
      if (!postId) return;
      reactionRealtimeSequenceRef.current.set(
        postId,
        (reactionRealtimeSequenceRef.current.get(postId) || 0) + 1,
      );
      const updatePost = (post: ForumPost) => post.id === postId
        ? {
            ...post,
            like_count: Math.max(0, Number(payload.like_count || 0)),
            is_liked: Number(payload.actor_graduate_id || 0) === currentGraduateId
              ? Boolean(payload.actor_liked)
              : post.is_liked,
          }
        : post;
      setForumPosts((current) => current.map(updatePost));
      setMyForumPosts((current) => current.map(updatePost));
      setProfileForumPosts((current) => current.map(updatePost));
      setSelectedPost((current) => current?.id === postId ? updatePost(current) : current);
      setMediaViewer((current) => current?.post.id === postId
        ? { ...current, post: updatePost(current.post) }
        : current);
    };

    const handleJobUpsert = (eventName: 'jobs:created' | 'jobs:updated') => (
      payload: RealtimeMutationEnvelope & { job?: JobPost },
    ) => {
      if (!rememberEvent(eventName, payload) || !payload.job) return;
      const job = payload.job;
      setJobs((current) => upsertJobPost(current, job));
      setSavedJobs((current) => current.some((item) => item.id === job.id) ? upsertJobPost(current, job) : current);
      setSelectedJob((current) => current?.id === job.id ? job : current);
      if (job.poster_graduate_id === currentGraduateId) {
        setMyPostedJobs((current) => upsertJobPost(current, job));
      }
      if (eventName === 'jobs:created') {
        window.dispatchEvent(new CustomEvent('gradtrack:notifications-updated', { detail: { audience: 'graduate' } }));
      }
    };

    const handleJobCreated = handleJobUpsert('jobs:created');
    const handleJobUpdated = handleJobUpsert('jobs:updated');
    const handleJobRemoved = (payload: RealtimeMutationEnvelope & { job_id?: number }) => {
      if (!rememberEvent('jobs:removed', payload)) return;
      const jobId = Number(payload.job_id || 0);
      if (!jobId) return;
      setJobs((current) => current.filter((job) => job.id !== jobId));
      setSavedJobs((current) => current.filter((job) => job.id !== jobId));
      setSelectedJob((current) => current?.id === jobId ? null : current);
    };

    const handleAnnouncementMutation = (eventName: string) => (payload: RealtimeMutationEnvelope & Record<string, unknown>) => {
      if (!rememberEvent(eventName, payload)) return;
      window.dispatchEvent(new CustomEvent('gradtrack:announcement-realtime', { detail: { ...payload, event_name: eventName } }));
      window.dispatchEvent(new CustomEvent('gradtrack:notifications-updated', { detail: { audience: 'graduate' } }));
    };
    const handleAnnouncementCreated = handleAnnouncementMutation('announcements:created');
    const handleAnnouncementUpdated = handleAnnouncementMutation('announcements:updated');
    const handleAnnouncementRemoved = handleAnnouncementMutation('announcements:removed');

    const handleProfileUpdated = (payload: RealtimeMutationEnvelope & { profile?: RealtimeProfileSummary }) => {
      if (!rememberEvent('profile:updated', payload) || !payload.profile) return;
      const profile = payload.profile;
      const graduateId = Number(profile.graduate_id || 0);
      if (!graduateId) return;
      const incomingVersion = {
        profileTime: parseDate(profile.updated_at)?.getTime() || 0,
        eventTime: parseDate(payload.occurred_at)?.getTime() || 0,
      };
      const previousVersion = profileRealtimeVersionsRef.current.get(graduateId);
      if (
        previousVersion
        && (
          incomingVersion.profileTime < previousVersion.profileTime
          || (
            incomingVersion.profileTime === previousVersion.profileTime
            && incomingVersion.eventTime <= previousVersion.eventTime
          )
        )
      ) return;
      profileRealtimeVersionsRef.current.set(graduateId, incomingVersion);
      const patchPost = (post: ForumPost): ForumPost => post.graduate_id === graduateId
        ? {
            ...post,
            author_name: profile.full_name,
            author_program_name: profile.program_name,
            author_program_code: profile.program_code,
            author_year_graduated: profile.year_graduated,
            author_profile_image_path: profile.profile_image_path,
          }
        : post;
      const patchComment = (comment: ForumComment): ForumComment => comment.graduate_id === graduateId
        ? {
            ...comment,
            commenter_name: profile.full_name,
            commenter_program_name: profile.program_name,
            commenter_program_code: profile.program_code,
            commenter_profile_image_path: profile.profile_image_path,
          }
        : comment;
      const patchJob = (job: JobPost): JobPost => job.poster_graduate_id === graduateId
        ? {
            ...job,
            first_name: profile.first_name,
            middle_name: profile.middle_name,
            last_name: profile.last_name,
            poster_full_name: profile.full_name,
            poster_program_name: profile.program_name,
            poster_program_code: profile.program_code,
            poster_profile_image_path: profile.profile_image_path,
          }
        : job;

      setForumPosts((current) => current.map(patchPost));
      setMyForumPosts((current) => current.map(patchPost));
      setProfileForumPosts((current) => current.map(patchPost));
      setSelectedPost((current) => current ? patchPost(current) : current);
      setMediaViewer((current) => current ? { ...current, post: patchPost(current.post) } : current);
      setPostComments((current) => current.map(patchComment));
      setMediaViewerComments((current) => current.map(patchComment));
      setJobs((current) => current.map(patchJob));
      setSavedJobs((current) => current.map(patchJob));
      setMyPostedJobs((current) => current.map(patchJob));
      setSelectedJob((current) => current ? patchJob(current) : current);
      setDirectory((current) => current.map((participant) => participant.graduate_id === graduateId
        ? {
            ...participant,
            full_name: profile.full_name,
            program_name: profile.program_name,
            program_code: profile.program_code,
            year_graduated: profile.year_graduated,
            profile_image_path: profile.profile_image_path,
          }
        : participant));
      setRooms((current) => current.map((room) => ({
        ...room,
        participants: room.participants.map((participant) => participant.graduate_id === graduateId
          ? {
              ...participant,
              full_name: profile.full_name,
              program_name: profile.program_name,
              program_code: profile.program_code,
              year_graduated: profile.year_graduated,
              profile_image_path: profile.profile_image_path,
            }
          : participant),
      })));

      const protectDirtySettings = activeTabRef.current === 'settings' && profileFormDirtyRef.current;
      if (graduateId === currentGraduateId && !profileSavingRef.current && !protectDirtySettings) void checkAuth();
      if (
        graduateId === profileTargetGraduateIdRef.current
        && !profileSavingRef.current
        && !protectDirtySettings
      ) {
        void loadGraduateProfile().catch(() => undefined);
      }
    };

    socket.on('community:post-created', handlePostCreated);
    socket.on('community:post-updated', handlePostUpdated);
    socket.on('community:post-deleted', handlePostDeleted);
    socket.on('community:comment-count', handleCommentCount);
    socket.on('community:comment-created', handleCommentCreated);
    socket.on('community:comment-deleted', handleCommentDeleted);
    socket.on('community:reaction-updated', handleReactionUpdated);
    socket.on('jobs:created', handleJobCreated);
    socket.on('jobs:updated', handleJobUpdated);
    socket.on('jobs:removed', handleJobRemoved);
    socket.on('announcements:created', handleAnnouncementCreated);
    socket.on('announcements:updated', handleAnnouncementUpdated);
    socket.on('announcements:removed', handleAnnouncementRemoved);
    socket.on('profile:updated', handleProfileUpdated);

    return () => {
      socket.off('community:post-created', handlePostCreated);
      socket.off('community:post-updated', handlePostUpdated);
      socket.off('community:post-deleted', handlePostDeleted);
      socket.off('community:comment-count', handleCommentCount);
      socket.off('community:comment-created', handleCommentCreated);
      socket.off('community:comment-deleted', handleCommentDeleted);
      socket.off('community:reaction-updated', handleReactionUpdated);
      socket.off('jobs:created', handleJobCreated);
      socket.off('jobs:updated', handleJobUpdated);
      socket.off('jobs:removed', handleJobRemoved);
      socket.off('announcements:created', handleAnnouncementCreated);
      socket.off('announcements:updated', handleAnnouncementUpdated);
      socket.off('announcements:removed', handleAnnouncementRemoved);
      socket.off('profile:updated', handleProfileUpdated);
    };
  }, [checkAuth, currentGraduateId, loadGraduateProfile, mediaViewer?.post.id, selectedPost?.id]);

  useEffect(() => {
    if (!currentGraduateId) return undefined;
    const postIds = Array.from(new Set([
      Number(selectedPost?.id || 0),
      Number(mediaViewer?.post.id || 0),
    ].filter((postId) => postId > 0)));
    if (postIds.length === 0) return undefined;

    const socket = getRealtimeChatSocket();
    const joinThreads = () => postIds.forEach((postId) => {
      void emitWithAck(socket, 'community:thread:join', { post_id: postId });
    });
    socket.on('connect', joinThreads);
    if (socket.connected) joinThreads();

    return () => {
      socket.off('connect', joinThreads);
      if (socket.connected) {
        postIds.forEach((postId) => socket.emit('community:thread:leave', { post_id: postId }));
      }
    };
  }, [currentGraduateId, mediaViewer?.post.id, selectedPost?.id]);

  useEffect(() => {
    if (!currentGraduateId) return undefined;
    const socket = getRealtimeChatSocket();
    let disconnectedSinceLastConnect = false;

    const handleDisconnect = () => {
      disconnectedSinceLastConnect = true;
    };
    const handleReconnect = () => {
      if (!disconnectedSinceLastConnect) return;
      disconnectedSinceLastConnect = false;
      const tasks: Array<Promise<unknown>> = [];
      if (communityAvailable) tasks.push(loadForumFeed(), loadMyForumPosts());
      if (jobsAvailable) tasks.push(loadJobs(), loadSavedJobs(), loadMyJobs());
      if (
        profileTargetGraduateIdRef.current > 0
        && !profileSavingRef.current
        && !(activeTabRef.current === 'settings' && profileFormDirtyRef.current)
      ) {
        tasks.push(loadGraduateProfile());
      }
      void Promise.allSettled(tasks);
      window.dispatchEvent(new CustomEvent('gradtrack:portal-reconnected'));
      window.dispatchEvent(new CustomEvent('gradtrack:notifications-updated', { detail: { audience: 'graduate' } }));
    };

    socket.on('disconnect', handleDisconnect);
    socket.on('connect', handleReconnect);
    return () => {
      socket.off('disconnect', handleDisconnect);
      socket.off('connect', handleReconnect);
    };
  }, [communityAvailable, currentGraduateId, jobsAvailable, loadForumFeed, loadGraduateProfile, loadJobs, loadMyForumPosts, loadMyJobs, loadSavedJobs]);

  const sharedPresenceTargetKey = useMemo(() => {
    const ids = new Set<number>();
    rooms.forEach((room) => room.participants.forEach((participant) => ids.add(participant.graduate_id)));
    directory.forEach((participant) => ids.add(participant.graduate_id));
    forumPosts.forEach((post) => ids.add(post.graduate_id));
    postComments.forEach((comment) => ids.add(comment.graduate_id));
    mediaViewerComments.forEach((comment) => ids.add(comment.graduate_id));
    addMemberCandidates.forEach((participant) => ids.add(participant.graduate_id));
    if (miniProfileGraduateId) ids.add(miniProfileGraduateId);
    return Array.from(ids).filter((id) => id > 0).sort((a, b) => a - b).slice(0, 500).join(',');
  }, [addMemberCandidates, directory, forumPosts, mediaViewerComments, miniProfileGraduateId, postComments, rooms]);

  useEffect(() => {
    const socket = chatSocketRef.current;
    if (!socket?.connected || chatConnectionStatus !== 'connected' || !sharedPresenceTargetKey) return;
    const graduateIds = sharedPresenceTargetKey.split(',').map(Number).filter((id) => id > 0);
    void emitWithAck<{ users?: ChatPresenceStatus[] }>(socket, 'presence:sync', { graduate_ids: graduateIds }).then((response) => {
      if (response.success && Array.isArray(response.users)) applyPresenceStatuses(response.users);
    });
  }, [applyPresenceStatuses, chatConnectionStatus, sharedPresenceTargetKey]);

  useEffect(() => {
    if (!addMembersOpen || !selectedRoomId) return undefined;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setAddMembersLoading(true);
      const endpoint = `${API_ENDPOINTS.FORUM.CONVERSATION_INFO}?room_id=${selectedRoomId}&action=eligible_members&q=${encodeURIComponent(addMemberSearch.trim())}`;
      void authenticatedFetch(endpoint)
        .then((response) => {
          if (cancelled) return;
          const candidates = Array.isArray(response.data?.candidates)
            ? (response.data.candidates as ChatParticipant[]).map((participant) => mergeKnownPresenceIntoParticipant(participant, chatPresenceByGraduateRef.current))
            : [];
          setAddMemberCandidates(candidates);
        })
        .catch((error) => {
          if (!cancelled) {
            setAddMemberCandidates([]);
            notify('error', error instanceof Error ? error.message : 'Unable to search eligible graduates', 'Add Members');
          }
        })
        .finally(() => {
          if (!cancelled) setAddMembersLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [addMemberSearch, addMembersOpen, authenticatedFetch, notify, selectedRoomId]);

  useEffect(() => {
    if (!chatSurfaceOpen || chatConnectionStatus === 'connected') return undefined;

    const roomInterval = window.setInterval(() => {
      void loadChats();
    }, 15000);

    const messageInterval = window.setInterval(() => {
      const roomId = selectedRoomIdRef.current;
      if (roomId && chatConversationSurfaceOpenRef.current) {
        void loadMissedRoomMessages(roomId);
      }
    }, 7000);

    return () => {
      window.clearInterval(roomInterval);
      window.clearInterval(messageInterval);
    };
  }, [chatConnectionStatus, chatSurfaceOpen, loadChats, loadMissedRoomMessages]);

  useEffect(() => {
    if (activeTab === 'messages') return;
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeTab, roomMessages]);

  useEffect(() => {
    if (!chatConversationSurfaceOpen || !chatNearBottomRef.current) return;
    void markVisibleMessagesAsRead();
  }, [chatConnectionStatus, chatConversationSurfaceOpen, markVisibleMessagesAsRead, roomMessages]);

  useEffect(() => {
    chatSelectedAttachmentRef.current = chatSelectedAttachment;
  }, [chatSelectedAttachment]);

  useEffect(() => {
    return () => {
      const previewUrls = new Set<string>();
      const selectedPreview = chatSelectedAttachmentRef.current?.preview_url;
      if (selectedPreview) previewUrls.add(selectedPreview);
      Object.values(retryAttachmentsRef.current).forEach((attachment) => {
        if (attachment.preview_url) previewUrls.add(attachment.preview_url);
      });
      previewUrls.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
      retryAttachmentsRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (loading || activeTab !== 'jobs' || notificationCategoryCounts.browse_jobs <= 0) return;
    void markNotificationCategoryRead('browse_jobs');
  }, [activeTab, loading, markNotificationCategoryRead, notificationCategoryCounts.browse_jobs]);

  useEffect(() => {
    if (loading || activeTab !== 'job_posting' || notificationCategoryCounts.job_posting <= 0) return;
    void markNotificationCategoryRead('job_posting');
  }, [activeTab, loading, markNotificationCategoryRead, notificationCategoryCounts.job_posting]);

  useEffect(() => {
    if (!mediaViewer) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

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
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mediaViewer]);

  const openForumComposer = (post?: ForumPost) => {
    if (!communityAvailable) {
      notify('info', 'This feature is currently unavailable.', 'Community Forum');
      return;
    }

    setManagePostsOpen(false);
    setSelectedPostOpen(false);

    if (post) {
      setForumForm({
        id: post.id,
        content: post.content,
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
    if (!forumMediaEnabled) {
      notify('info', 'Forum media uploads are currently unavailable.', 'Community Forum');
      return;
    }

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

    if (selectedFiles.reduce((total, file) => total + file.size, 0) > maxForumRequestBytes) {
      notify('warning', 'The selected media exceed the 256 MB total upload limit.', 'Community Forum');
      if (forumMediaInputRef.current) forumMediaInputRef.current.value = '';
      return;
    }

    for (const file of selectedFiles) {
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      const isImage = supportedForumImageTypes.has(file.type);
      const isVideo = supportedForumVideoTypes.has(file.type);

      if (extension === 'heic' || extension === 'heif' || /image\/(?:hei[cf]|heif)/i.test(file.type)) {
        notify('warning', `${file.name} uses HEIC/HEIF, which is not supported. Please convert it to JPG, PNG, or WEBP.`, 'Community Forum');
        if (forumMediaInputRef.current) {
          forumMediaInputRef.current.value = '';
        }
        return;
      }

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
    setNewMediaViewerCommentId(null);
    void loadMediaViewerComments(post.id);
  };

  const closeMediaViewer = () => {
    setMediaViewer(null);
    setMediaViewerZoom(1);
    setMediaViewerComments([]);
    setMediaViewerCommentDraft('');
    setNewMediaViewerCommentId(null);
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

    if (!communityAvailable) {
      notify('info', 'This feature is currently unavailable.', 'Community Forum');
      return;
    }

    const content = forumForm.content.trim();

    if (!content) {
      notify('warning', 'Write something before publishing your post.', 'Community Forum');
      return;
    }

    // AI Moderation Check
    if (!forumForm.id) {
      setAiModerating(true);
      try {
        const moderationResponse = await authenticatedFetch(API_ENDPOINTS.FORUM_AI_MODERATE, {
          method: 'POST',
          body: JSON.stringify({ content }),
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
      formData.append('content', content);
      forumMediaFiles.forEach((file) => {
        formData.append('media[]', file);
      });
      if (forumForm.remove_media) {
        formData.append('remove_media', '1');
      }

      let savedPost: ForumPost | null = null;
      if (forumForm.id) {
        formData.append('id', String(forumForm.id));
        formData.append('_method', 'PUT');
        const response = await authenticatedFetch(API_ENDPOINTS.FORUM.POSTS, {
          method: 'POST',
          body: formData,
        });
        savedPost = (response.data as ForumPost | undefined) || null;
        notify('success', 'Forum post updated and remains published.', 'Community Forum');
      } else {
        const response = await authenticatedFetch(API_ENDPOINTS.FORUM.POSTS, {
          method: 'POST',
          body: formData,
        });
        savedPost = (response.data as ForumPost | undefined) || null;
        notify('success', 'Forum post published and visible in the feed.', 'Community Forum');
      }

      closeForumComposer();
      if (savedPost) {
        setForumPosts((current) => upsertForumPost(current, savedPost as ForumPost));
        setMyForumPosts((current) => upsertForumPost(current, savedPost as ForumPost));
        if (savedPost.graduate_id === profileTargetGraduateId) {
          setProfileForumPosts((current) => upsertForumPost(current, savedPost as ForumPost));
        }
      }
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
      message: `Delete "${previewText(post.title || post.content, 80)}" from the Community Forum?`,
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
          setForumPosts((current) => current.filter((item) => item.id !== post.id));
          setMyForumPosts((current) => current.filter((item) => item.id !== post.id));
          setProfileForumPosts((current) => current.filter((item) => item.id !== post.id));
        } catch (error) {
          notify('error', error instanceof Error ? error.message : 'Unable to delete forum post', 'Community Forum');
        } finally {
          setForumActionKey('');
        }
      },
    });
  };

  const toggleLike = async (postId: number) => {
    if (!communityAvailable) {
      notify('info', 'This feature is currently unavailable.', 'Community Forum');
      return;
    }

    setForumActionKey(`like-${postId}`);
    const realtimeSequenceAtStart = reactionRealtimeSequenceRef.current.get(postId) || 0;

    try {
      const response = await authenticatedFetch(API_ENDPOINTS.FORUM.LIKES, {
        method: 'POST',
        body: JSON.stringify({ post_id: postId }),
      });

      const liked = !!response.liked;
      const likeCount = Number(response.like_count || 0);
      const preserveNewerRealtimeCount = (reactionRealtimeSequenceRef.current.get(postId) || 0) !== realtimeSequenceAtStart;
      const updateReaction = (post: ForumPost) => post.id === postId
        ? {
            ...post,
            is_liked: liked,
            like_count: preserveNewerRealtimeCount ? post.like_count : likeCount,
          }
        : post;

      setForumPosts((current) =>
        current.map(updateReaction),
      );
      setMyForumPosts((current) =>
        current.map(updateReaction),
      );
      setProfileForumPosts((current) =>
        current.map(updateReaction),
      );
      setSelectedPost((current) =>
        current && current.id === postId ? updateReaction(current) : current,
      );
      setMediaViewer((current) => current?.post.id === postId
        ? { ...current, post: updateReaction(current.post) }
        : current);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to update reaction', 'Community Forum');
    } finally {
      setForumActionKey('');
    }
  };

  const applyForumCommentCount = (postId: number, commentCount: number) => {
    const updatePost = (post: ForumPost) => (post.id === postId ? { ...post, comment_count: commentCount } : post);
    setForumPosts((current) => current.map(updatePost));
    setMyForumPosts((current) => current.map(updatePost));
    setProfileForumPosts((current) => current.map(updatePost));
    setSelectedPost((current) => (current?.id === postId ? updatePost(current) : current));
    setMediaViewer((current) => (
      current?.post.id === postId ? { ...current, post: updatePost(current.post) } : current
    ));
  };

  const handleCommentSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!communityAvailable) {
      notify('info', 'This feature is currently unavailable.', 'Community Forum');
      return;
    }

    if (!selectedPost) return;

    const comment = commentDraft.trim();
    if (!comment) {
      notify('warning', 'Write a comment before posting.', 'Community Forum');
      return;
    }

    setCommentSubmitting(true);
    const commentSequenceAtStart = commentRealtimeSequenceRef.current.get(selectedPost.id) || 0;

    try {
      const response = await authenticatedFetch(API_ENDPOINTS.FORUM.COMMENTS, {
        method: 'POST',
        body: JSON.stringify({
          post_id: selectedPost.id,
          comment,
        }),
      });

      const createdComment = response.data as ForumComment | undefined;
      if (!createdComment?.id) {
        throw new Error('The comment was saved but could not be displayed. Please reopen the post.');
      }
      const addCreatedComment = (current: ForumComment[]) => (
        current.some((item) => item.id === createdComment.id) ? current : [...current, createdComment]
      );
      const commentCount = Number(response.comment_count || postComments.length + 1);
      setCommentDraft('');
      setPostComments(addCreatedComment);
      if (mediaViewer?.post.id === selectedPost.id) {
        setMediaViewerComments(addCreatedComment);
      }
      if ((commentRealtimeSequenceRef.current.get(selectedPost.id) || 0) === commentSequenceAtStart) {
        applyForumCommentCount(selectedPost.id, commentCount);
      }
      setNewPostCommentId(createdComment.id);
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
    const postId = mediaViewer.post.id;
    const commentSequenceAtStart = commentRealtimeSequenceRef.current.get(postId) || 0;

    try {
      const response = await authenticatedFetch(API_ENDPOINTS.FORUM.COMMENTS, {
        method: 'POST',
        body: JSON.stringify({
          post_id: postId,
          comment,
        }),
      });

      const createdComment = response.data as ForumComment | undefined;
      if (!createdComment?.id) {
        throw new Error('The comment was saved but could not be displayed. Please reopen the post.');
      }
      const addCreatedComment = (current: ForumComment[]) => (
        current.some((item) => item.id === createdComment.id) ? current : [...current, createdComment]
      );
      const commentCount = Number(response.comment_count || mediaViewerComments.length + 1);
      setMediaViewerCommentDraft('');
      setMediaViewerComments(addCreatedComment);
      if (selectedPost?.id === postId) {
        setPostComments(addCreatedComment);
      }
      if ((commentRealtimeSequenceRef.current.get(postId) || 0) === commentSequenceAtStart) {
        applyForumCommentCount(postId, commentCount);
      }
      setNewMediaViewerCommentId(createdComment.id);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to post comment', 'Community Forum');
    } finally {
      setMediaViewerCommentSubmitting(false);
    }
  };

  const handleDeleteComment = (comment: ForumComment) => {
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: 'Delete Comment',
      message: 'Delete this comment from the discussion?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: async () => {
        const commentSequenceAtStart = commentRealtimeSequenceRef.current.get(comment.post_id) || 0;
        try {
          const response = await authenticatedFetch(API_ENDPOINTS.FORUM.COMMENTS, {
            method: 'DELETE',
            body: JSON.stringify({ id: comment.id }),
          });

          const postId = Number(response.data?.post_id || comment.post_id);
          const removeComment = (current: ForumComment[]) => current.filter((item) => item.id !== comment.id);
          setPostComments(removeComment);
          setMediaViewerComments(removeComment);
          setNewPostCommentId((current) => (current === comment.id ? null : current));
          setNewMediaViewerCommentId((current) => (current === comment.id ? null : current));
          const fallbackCount = Math.max(0, Number(selectedPost?.comment_count || mediaViewer?.post.comment_count || 1) - 1);
          if ((commentRealtimeSequenceRef.current.get(postId) || 0) === commentSequenceAtStart) {
            applyForumCommentCount(postId, Number(response.data?.comment_count ?? fallbackCount));
          }
          notify('success', 'Comment deleted successfully.', 'Community Forum');
        } catch (error) {
          notify('error', error instanceof Error ? error.message : 'Unable to delete comment', 'Community Forum');
        }
      },
    });
  };

  const openReportModal = (target: ReportTarget) => {
    setReportTarget(target);
    setReportReason('Inappropriate content');
    setReportDescription('');
  };

  const closeReportModal = () => {
    setReportTarget(null);
    setReportReason('Inappropriate content');
    setReportDescription('');
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
          description: reportDescription.trim(),
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
    if (!messagingAvailable) {
      notify('info', 'This feature is currently unavailable.', 'Messages');
      return;
    }

    setChatModalMode(mode);
    setChatModalName('');
    setChatModalSelectedIds([]);
    setChatModalSearch('');
    setChatModalProgramFilter('all');
    setChatModalBatchFilter('all');
    setChatModalOpen(true);
  };

  const openMiniProfile = useCallback((graduateId?: number | null) => {
    const targetId = Number(graduateId || 0);
    if (!Number.isInteger(targetId) || targetId <= 0) return;
    setMiniProfileGraduateId(targetId);
  }, []);

  const openCommunityProfile = useCallback((graduateId?: number | null) => {
    const targetId = Number(graduateId || 0);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return;
    }

    setSelectedPostOpen(false);
    setSelectedPost(null);
    setPostComments([]);
    setMediaViewer(null);
    setReportTarget(null);
    setChatModalOpen(false);
    setMiniProfileGraduateId(null);
    setProfileMenuOpen(false);
    setActiveTab('my_profile');
    navigate(`/graduate/community/profile/${targetId}`);
  }, [navigate]);

  const createDirectChat = async (graduateId: number) => {
    if (!messagingAvailable) {
      notify('info', 'This feature is currently unavailable.', 'Messages');
      return;
    }

    if (directChatOpeningRef.current) {
      return;
    }

    const recipient = directory.find((participant) => participant.graduate_id === graduateId) || null;
    if (!recipient) {
      notify('error', 'The selected graduate is unavailable for chat', 'Chats');
      return;
    }

    const synchronizedRecipient = mergeKnownPresenceIntoParticipant(recipient, chatPresenceByGraduateRef.current);
    const knownRoom = rooms.find((room) => (
      !room.is_group
      && room.participants.some((participant) => participant.graduate_id === graduateId)
    )) || null;

    directChatOpeningRef.current = true;
    setChatCreating(true);
    setChatModalSelectedIds([graduateId]);
    setSelectedPostOpen(false);
    setChatModalOpen(false);
    setChatMobileConversationOpen(true);
    setConversationInfo(null);
    setConversationInfoOpen(false);
    selectTab('messages');

    if (knownRoom) {
      const wasSelectedRoom = selectedRoomIdRef.current === knownRoom.id;
      temporaryChatRecipientRef.current = null;
      setTemporaryChatRecipient(null);
      selectedRoomIdRef.current = knownRoom.id;
      setSelectedRoomId(knownRoom.id);
      setActiveRoom(mergeKnownPresenceIntoRoom(knownRoom, chatPresenceByGraduateRef.current));
      if (!wasSelectedRoom) {
        roomMessagesRef.current = [];
        setRoomMessages([]);
      }
      setChatProfileIntro(null);
      setChatProfileIntroLoading(false);
      chatProfileIntroRequestRef.current += 1;
      directChatOpeningRef.current = false;
      setChatCreating(false);
      void loadRoomMessages(knownRoom.id);
      return;
    }

    // Open the temporary composer immediately. The lookup below remains the
    // authoritative check for a hidden/existing direct conversation.
    roomLoadRequestRef.current += 1;
    setRoomLoading(false);
    temporaryChatRecipientRef.current = synchronizedRecipient;
    setTemporaryChatRecipient(synchronizedRecipient);
    selectedRoomIdRef.current = null;
    setSelectedRoomId(null);
    setActiveRoom(null);
    setRoomMessages([]);
    roomMessagesRef.current = [];
    setMessagePagination(null);

    const profileRequestId = ++chatProfileIntroRequestRef.current;
    setChatProfileIntro(null);
    setChatProfileIntroLoading(true);
    void loadMiniProfile(graduateId)
      .then((profile) => {
        if (profileRequestId === chatProfileIntroRequestRef.current) {
          setChatProfileIntro(profile);
        }
      })
      .catch(() => {
        if (profileRequestId === chatProfileIntroRequestRef.current) {
          setChatProfileIntro(null);
        }
      })
      .finally(() => {
        if (profileRequestId === chatProfileIntroRequestRef.current) {
          setChatProfileIntroLoading(false);
        }
      });

    try {
      const response = await authenticatedFetch(API_ENDPOINTS.FORUM.CHATS, {
        method: 'POST',
        body: JSON.stringify({
          is_group: false,
          participant_ids: [graduateId],
        }),
      });

      if (temporaryChatRecipientRef.current?.graduate_id !== graduateId) {
        return;
      }

      const roomId = Number(response.room_id || 0);
      const resolvedRoom = roomId > 0 ? rooms.find((room) => room.id === roomId) || null : null;
      if (roomId > 0 && resolvedRoom) {
        temporaryChatRecipientRef.current = null;
        setTemporaryChatRecipient(null);
        selectedRoomIdRef.current = roomId;
        setSelectedRoomId(roomId);
        setActiveRoom(mergeKnownPresenceIntoRoom(resolvedRoom, chatPresenceByGraduateRef.current));
        setRoomMessages([]);
        roomMessagesRef.current = [];
        setChatProfileIntro(null);
        setChatProfileIntroLoading(false);
        chatProfileIntroRequestRef.current += 1;
        await loadRoomMessages(roomId);
      } else {
        const confirmedRecipient = (response.recipient as ChatParticipant | undefined) || synchronizedRecipient;
        const synchronizedConfirmedRecipient = mergeKnownPresenceIntoParticipant(confirmedRecipient, chatPresenceByGraduateRef.current);
        temporaryChatRecipientRef.current = synchronizedConfirmedRecipient;
        setTemporaryChatRecipient(synchronizedConfirmedRecipient);
      }
    } catch (error) {
      if (temporaryChatRecipientRef.current?.graduate_id === graduateId) {
        notify('error', error instanceof Error ? error.message : 'Unable to start direct chat', 'Chats');
      }
    } finally {
      directChatOpeningRef.current = false;
      setChatCreating(false);
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

    if (chatModalMode === 'direct') {
      await createDirectChat(chatModalSelectedIds[0]);
      return;
    }

    setChatCreating(true);

    try {
      const response = await authenticatedFetch(API_ENDPOINTS.FORUM.CHATS, {
        method: 'POST',
        body: JSON.stringify({
          is_group: true,
          name: chatModalName.trim(),
          participant_ids: chatModalSelectedIds,
        }),
      });

      const roomId = Number(response.room_id || 0);
      setChatModalOpen(false);
      await loadChats();

      if (roomId > 0) {
        setSelectedRoomId(roomId);
        setChatMobileConversationOpen(true);
        await loadRoomMessages(roomId);
      }
      selectTab('messages');

      notify(
        'success',
        'Group chat created successfully.',
        'Chats',
      );
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to create chat', 'Chats');
    } finally {
      setChatCreating(false);
    }
  };

  const stopChatTyping = (roomId = chatTypingRoomIdRef.current || selectedRoomIdRef.current) => {
    if (chatTypingStopTimeoutRef.current) {
      window.clearTimeout(chatTypingStopTimeoutRef.current);
      chatTypingStopTimeoutRef.current = null;
    }

    const typingRoomId = chatTypingRoomIdRef.current;
    if (!roomId || !typingRoomId) return;
    const socket = chatSocketRef.current;
    if (socket?.connected) {
      socket.emit('typing:stop', { room_id: typingRoomId });
    }
    chatTypingRoomIdRef.current = null;
    chatTypingLastEmittedAtRef.current = 0;
  };

  const handleChatDraftInput = (value: string) => {
    const nextValue = value.slice(0, 5000);
    setChatMessageDraft(nextValue);

    const roomId = selectedRoomIdRef.current;
    const socket = chatSocketRef.current;
    if (!roomId || !socket?.connected) return;

    if (!nextValue.trim()) {
      stopChatTyping(roomId);
      return;
    }

    const shouldStartTyping = chatTypingRoomIdRef.current !== roomId;
    const shouldRefreshTyping = Date.now() - chatTypingLastEmittedAtRef.current >= 1000;
    if (shouldStartTyping || shouldRefreshTyping) {
      if (shouldStartTyping && chatTypingRoomIdRef.current) {
        stopChatTyping(chatTypingRoomIdRef.current);
      }
      chatTypingRoomIdRef.current = roomId;
      chatTypingLastEmittedAtRef.current = Date.now();
      void emitWithAck(socket, 'typing:start', { room_id: roomId }).then((response) => {
        if (!response.success && chatTypingRoomIdRef.current === roomId) {
          chatTypingRoomIdRef.current = null;
          chatTypingLastEmittedAtRef.current = 0;
        }
      });
    }

    if (chatTypingStopTimeoutRef.current) {
      window.clearTimeout(chatTypingStopTimeoutRef.current);
    }
    chatTypingStopTimeoutRef.current = window.setTimeout(() => stopChatTyping(roomId), 1800);
  };

  const handleChatAttachmentSelected = (file: File) => {
    const validationError = validateChatAttachmentFile(file);
    if (validationError) {
      notify('warning', validationError, 'Attachment');
      return;
    }

    setChatSelectedAttachment((current) => {
      if (current?.preview_url) URL.revokeObjectURL(current.preview_url);
      return {
        file,
        preview_url: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
        progress: 0,
        status: 'selected',
      };
    });
  };

  const removeChatAttachment = () => {
    setChatSelectedAttachment((current) => {
      if (current?.preview_url) URL.revokeObjectURL(current.preview_url);
      return null;
    });
  };

  const uploadChatAttachment = async (
    attachment: SelectedAttachment,
    roomId: number,
    clientMessageId: string,
    recipientGraduateId?: number,
  ): Promise<MessageAttachment> => {
    if (attachment.uploaded) return attachment.uploaded;
    retryAttachmentsRef.current[clientMessageId] = {
      ...attachment,
      status: 'uploading',
      progress: 0,
      error: undefined,
    };

    const executeUpload = async (forceCsrfRefresh = false): Promise<MessageAttachment> => {
      const csrfToken = await obtainApiCsrfToken(forceCsrfRefresh);

      return new Promise((resolve, reject) => {
        const formData = new FormData();
        if (roomId > 0) {
          formData.append('room_id', String(roomId));
        } else if (recipientGraduateId) {
          formData.append('recipient_id', String(recipientGraduateId));
        }
        formData.append('attachment', attachment.file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', API_ENDPOINTS.FORUM.CHAT_ATTACHMENTS);
        xhr.withCredentials = true;
        xhr.setRequestHeader('X-CSRF-Token', csrfToken);

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          const progress = Math.round((event.loaded / event.total) * 100);
          const retryAttachment = retryAttachmentsRef.current[clientMessageId];
          if (retryAttachment) {
            retryAttachmentsRef.current[clientMessageId] = { ...retryAttachment, progress };
          }
        };

        xhr.onload = () => {
          let data: { success?: boolean; error?: string; data?: { attachment?: MessageAttachment } } = {};
          try {
            data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
          } catch {
            // Keep the initialized empty payload so the request follows the normal failure path.
          }

          if (xhr.status >= 200 && xhr.status < 300 && data.success && data.data?.attachment) {
            retryAttachmentsRef.current[clientMessageId] = {
              ...attachment,
              uploaded: data.data.attachment,
              status: 'uploaded',
              progress: 100,
            };
            resolve(data.data.attachment);
            return;
          }

          if (xhr.status === 419) {
            const csrfError = new Error('Secure session token expired') as Error & { status: number };
            csrfError.status = 419;
            reject(csrfError);
            return;
          }

          const errorMessage = data.error || 'Attachment upload failed';
          retryAttachmentsRef.current[clientMessageId] = { ...attachment, status: 'failed', error: errorMessage };
          reject(new Error(errorMessage));
        };

        xhr.onerror = () => {
          const errorMessage = 'Attachment upload failed';
          retryAttachmentsRef.current[clientMessageId] = { ...attachment, status: 'failed', error: errorMessage };
          reject(new Error(errorMessage));
        };

        xhr.send(formData);
      });
    };

    try {
      return await executeUpload();
    } catch (error) {
      if ((error as { status?: number })?.status === 419) return executeUpload(true);
      throw error;
    }
  };

  const sendMessageToServer = async (payload: {
    room_id?: number;
    recipient_id?: number;
    message: string;
    client_message_id: string;
    attachment_ids: number[];
    action?: 'share_job';
    job_id?: number;
  }) => {
    const response = await authenticatedFetch(API_ENDPOINTS.FORUM.CHAT_MESSAGES, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const savedMessages = Array.isArray(response.data?.messages)
      ? (response.data.messages as ChatMessage[])
      : response.data?.message
        ? [response.data.message as ChatMessage]
        : [];
    if (savedMessages.length === 0) {
      throw new Error(response.error || 'Unable to send message');
    }

    const conversation = response.data?.conversation as ChatRoom | undefined;

    const socket = chatSocketRef.current;
    const canonicalMessages: ChatMessage[] = [];
    if (socket?.connected) {
      for (const savedMessage of savedMessages) {
        const publishResponse = await emitWithAck<{ message?: ChatMessage }>(socket, 'message:publish', {
          room_id: savedMessage.room_id,
          message_id: savedMessage.id,
        }, 5000);
        if (publishResponse.success && publishResponse.message) {
          canonicalMessages.push(publishResponse.message);
          continue;
        }
        canonicalMessages.push(savedMessage);
        console.warn(`[Realtime] Saved message ${savedMessage.id} could not be published immediately: ${publishResponse.error || 'Unknown error'}`);
      }
      return {
        messages: canonicalMessages,
        conversation,
        roomId: Number(canonicalMessages[canonicalMessages.length - 1]?.room_id || conversation?.id || 0),
      };
    }

    return {
      messages: savedMessages,
      conversation,
      roomId: Number(savedMessages[savedMessages.length - 1]?.room_id || conversation?.id || 0),
    };
  };

  const handleSendMessage = async (event?: FormEvent<HTMLFormElement>, retryMessage?: ChatMessage) => {
    event?.preventDefault();

    const roomId = retryMessage?.room_id || selectedRoomId || 0;
    const temporaryRecipientId = roomId <= 0 ? Number(temporaryChatRecipientRef.current?.graduate_id || 0) : 0;
    if (!roomId && !temporaryRecipientId) {
      notify('warning', 'Select a graduate or chat room first.', 'Chats');
      return;
    }

    const message = retryMessage ? retryMessage.message.trim() : chatMessageDraft.trim();
    const selectedAttachment = retryMessage?.client_message_id
      ? retryAttachmentsRef.current[retryMessage.client_message_id] || null
      : chatSelectedAttachment;
    if (!message && !selectedAttachment && !retryMessage?.attachments?.length) return;

    const clientMessageId = retryMessage?.client_message_id || createClientMessageId(currentGraduateId);
    if (selectedAttachment) {
      retryAttachmentsRef.current[clientMessageId] = selectedAttachment;
    }
    const optimisticMessage: ChatMessage = retryMessage || {
      id: -Date.now(),
      room_id: roomId,
      graduate_id: currentGraduateId,
      message,
      message_type: selectedAttachment ? (message ? 'mixed' : selectedAttachment.file.type.startsWith('image/') ? 'image' : 'file') : 'text',
      client_message_id: clientMessageId,
      created_at: new Date().toISOString(),
      sender_name: user?.full_name || 'You',
      sender_program_code: user?.program_code || null,
      sender_profile_image_path: user?.profile_image_path || null,
      is_mine: true,
      attachments: selectedAttachment
        ? [{
            id: -Date.now() - 1,
            room_id: roomId,
            message_id: null,
            original_name: selectedAttachment.file.name,
            stored_name: selectedAttachment.file.name,
            mime_type: selectedAttachment.file.type || 'application/octet-stream',
            file_size: selectedAttachment.file.size,
            attachment_type: selectedAttachment.file.type.startsWith('image/') ? 'image' : 'file',
            url: selectedAttachment.preview_url || '',
            download_url: selectedAttachment.preview_url || '',
          }]
        : [],
      status: 'sending',
    };

    const optimisticMessages = mergeChatMessages(
      retryMessage ? roomMessagesRef.current.map((item) => (item.client_message_id === clientMessageId ? { ...item, status: 'sending', error: undefined } : item)) : roomMessagesRef.current,
      retryMessage ? [] : [optimisticMessage],
    );
    setRoomMessages(optimisticMessages);
    roomMessagesRef.current = optimisticMessages;
    setChatNewMessageAvailable(!chatNearBottomRef.current);
    if (!retryMessage) {
      setChatMessageDraft('');
      if (selectedAttachment) {
        setChatSelectedAttachment(null);
      }
    }

    try {
      stopChatTyping(roomId);

      const uploadedAttachment = selectedAttachment
        ? await uploadChatAttachment(selectedAttachment, roomId, clientMessageId, temporaryRecipientId || undefined)
        : null;
      const existingAttachmentIds = retryMessage?.attachments
        ?.filter((attachment) => attachment.id > 0)
        .map((attachment) => attachment.id) || [];
      const attachmentIds = existingAttachmentIds.length > 0
        ? existingAttachmentIds
        : (uploadedAttachment ? [uploadedAttachment.id] : []);

      const sendResult = await sendMessageToServer({
        ...(roomId > 0 ? { room_id: roomId } : { recipient_id: temporaryRecipientId }),
        message,
        client_message_id: clientMessageId,
        attachment_ids: attachmentIds,
      });

      const resolvedRoomId = sendResult.roomId;
      if (!resolvedRoomId) {
        throw new Error('The saved conversation could not be resolved');
      }
      const normalizedMessages = sendResult.messages.map((savedMessage) => normalizeChatMessage(savedMessage, currentGraduateId));
      const newestMessage = normalizedMessages[normalizedMessages.length - 1];
      const wasTemporaryConversation = roomId <= 0;
      if (wasTemporaryConversation || selectedRoomIdRef.current === roomId) {
        const withoutOptimisticMessage = roomMessagesRef.current.filter((item) => (
          item.client_message_id !== clientMessageId
        ));
        const nextMessages = mergeChatMessages(withoutOptimisticMessage, normalizedMessages);
        setRoomMessages(nextMessages);
        roomMessagesRef.current = nextMessages;
      }
      if (sendResult.conversation) {
        upsertConversation(sendResult.conversation);
        setActiveRoom(mergeKnownPresenceIntoRoom(sendResult.conversation, chatPresenceByGraduateRef.current));
      } else {
        setRooms((current) => sortChatRooms(current.map((room) => (
          room.id === newestMessage.room_id
            ? {
                ...room,
                last_message: getChatMessagePreview(newestMessage),
                last_message_type: newestMessage.message_type || 'text',
                last_message_at: newestMessage.created_at,
                last_message_sender_id: newestMessage.graduate_id,
                updated_at: newestMessage.created_at,
              }
            : room
        ))));
      }
      if (wasTemporaryConversation) {
        temporaryChatRecipientRef.current = null;
        setTemporaryChatRecipient(null);
        setChatProfileIntro(null);
        setChatProfileIntroLoading(false);
        chatProfileIntroRequestRef.current += 1;
        selectedRoomIdRef.current = resolvedRoomId;
        setSelectedRoomId(resolvedRoomId);
        setMessagePagination({
          limit: 30,
          has_more_older: false,
          has_more_newer: false,
          oldest_id: normalizedMessages[0]?.id || null,
          newest_id: newestMessage.id,
        });
      }
      const completedAttachment = retryAttachmentsRef.current[clientMessageId];
      if (completedAttachment?.preview_url) {
        URL.revokeObjectURL(completedAttachment.preview_url);
      }
      delete retryAttachmentsRef.current[clientMessageId];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unable to send message';
      if ((roomId > 0 && selectedRoomIdRef.current === roomId) || (roomId <= 0 && temporaryChatRecipientRef.current)) {
        const failedMessages = roomMessagesRef.current.map((item) => (
          item.client_message_id === clientMessageId
            ? { ...item, status: 'failed' as const, error: errorMessage }
            : item
        ));
        roomMessagesRef.current = failedMessages;
        setRoomMessages(failedMessages);
      }
      notify('error', errorMessage, 'Chats');
    }
  };

  const handleRetryMessage = (message: ChatMessage) => {
    void handleSendMessage(undefined, message);
  };

  const confirmDeleteMessage = (message: ChatMessage) => {
    if (!message.is_mine || message.id <= 0 || message.message_type === 'system') return;

    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: 'Delete Message',
      message: 'Delete this message for everyone in the conversation? This cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          const response = await authenticatedFetch(API_ENDPOINTS.FORUM.CHAT_MESSAGES, {
            method: 'DELETE',
            body: JSON.stringify({ message_id: message.id }),
          });
          const roomId = Number(response.data?.room_id || message.room_id);
          const deletedMessageId = Number(response.data?.message_id || message.id);

          if (selectedRoomIdRef.current === roomId) {
            const nextMessages = roomMessagesRef.current.map((item) => (
              item.id === deletedMessageId
                ? { ...item, message: 'This message was deleted', is_deleted: true, attachments: [] }
                : item
            ));
            roomMessagesRef.current = nextMessages;
            setRoomMessages(nextMessages);
          }

          const socket = chatSocketRef.current;
          if (socket?.connected) {
            void emitWithAck(socket, 'message:delete-publish', {
              room_id: roomId,
              message_id: deletedMessageId,
            }, 3000).catch(() => undefined);
          }

          await loadChats();
          if (conversationInfoOpenRef.current && selectedRoomIdRef.current === roomId) {
            await loadConversationInfo(roomId, true);
          }
          notify('success', 'Your message was deleted for everyone.', 'Message Deleted');
        } catch (error) {
          notify('error', error instanceof Error ? error.message : 'Unable to delete this message', 'Delete Message');
        }
      },
    });
  };

  const handleRetryAttachment = () => {
    const roomId = selectedRoomIdRef.current || 0;
    const recipientId = roomId <= 0 ? Number(temporaryChatRecipientRef.current?.graduate_id || 0) : 0;
    if (!chatSelectedAttachment || (!roomId && !recipientId)) return;
    const attachment = chatSelectedAttachment;
    const retryId = createClientMessageId(currentGraduateId);
    void uploadChatAttachment(attachment, roomId, retryId, recipientId || undefined)
      .then((uploaded) => {
        setChatSelectedAttachment((current) => (
          current?.file === attachment.file
            ? { ...current, uploaded, status: 'uploaded', progress: 100, error: undefined }
            : current
        ));
        delete retryAttachmentsRef.current[retryId];
      })
      .catch((error) => {
        setChatSelectedAttachment((current) => (
          current?.file === attachment.file
            ? { ...current, status: 'failed', error: error instanceof Error ? error.message : 'Attachment upload failed' }
            : current
        ));
        notify('error', error instanceof Error ? error.message : 'Attachment upload failed', 'Attachment');
      });
  };

  const openFloatingChat = (roomId: number) => {
    setSelectedRoomId(roomId);
    setFloatingChatOpen(true);
    setFloatingChatMinimized(false);
    setConversationInfoOpen(false);
  };

  const toggleConversationInfo = () => {
    if (!selectedRoomId) return;
    if (conversationInfoOpen) {
      setConversationInfoOpen(false);
      return;
    }

    setConversationInfoOpen(true);
    void loadConversationInfo(selectedRoomId);
  };

  const openAddMembers = () => {
    if (!selectedRoomId || !activeRoom?.is_group || !conversationInfo?.permissions.can_add_members) return;
    setAddMemberSearch('');
    setAddMemberSelectedIds([]);
    setAddMemberCandidates([]);
    setAddMembersOpen(true);
  };

  const closeAddMembers = () => {
    if (addMembersSubmitting) return;
    setAddMembersOpen(false);
    setAddMemberSelectedIds([]);
    setAddMemberSearch('');
  };

  const toggleAddMember = (graduateId: number) => {
    setAddMemberSelectedIds((current) => (
      current.includes(graduateId)
        ? current.filter((id) => id !== graduateId)
        : [...current, graduateId]
    ));
  };

  const handleAddMembers = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const roomId = selectedRoomIdRef.current;
    const selectedIds = Array.from(new Set(addMemberSelectedIds));
    if (!roomId || selectedIds.length === 0) return;

    setAddMembersSubmitting(true);
    try {
      const response = await authenticatedFetch(API_ENDPOINTS.FORUM.CONVERSATION_INFO, {
        method: 'POST',
        body: JSON.stringify({ room_id: roomId, action: 'add_members', participant_ids: selectedIds }),
      });
      const updatedRoom = response.data?.room as ChatRoom | undefined;
      const addedMembers = Array.isArray(response.data?.added_members) ? response.data.added_members as ChatParticipant[] : [];
      const systemMessageId = Number(response.data?.system_message_id || 0);

      if (updatedRoom) {
        const synchronizedRoom = mergeKnownPresenceIntoRoom(updatedRoom, chatPresenceByGraduateRef.current);
        upsertConversation(synchronizedRoom);
        setConversationInfo((current) => current ? { ...current, room: synchronizedRoom } : current);
      }

      const socket = chatSocketRef.current;
      if (socket?.connected && systemMessageId > 0) {
        const realtimeResponse = await emitWithAck(socket, 'conversation:members-added', {
          room_id: roomId,
          system_message_id: systemMessageId,
          added_member_ids: addedMembers.map((member) => member.graduate_id),
        }, 5000);
        if (!realtimeResponse.success && import.meta.env.DEV) {
          console.warn(`[Realtime] Added members were saved but immediate broadcast failed: ${realtimeResponse.error || 'Unknown error'}`);
        }
      }

      setAddMembersOpen(false);
      setAddMemberSelectedIds([]);
      setAddMemberSearch('');
      await Promise.all([loadChats(), loadConversationInfo(roomId, true)]);
      if (!socket?.connected) await loadRoomMessages(roomId, true);
      notify('success', `${addedMembers.length} member${addedMembers.length === 1 ? '' : 's'} added to the group.`, 'Members Added');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to add group members', 'Add Members');
    } finally {
      setAddMembersSubmitting(false);
    }
  };

  const publishConversationPolicyChange = (roomId: number) => {
    const socket = chatSocketRef.current;
    if (socket?.connected) {
      void emitWithAck(socket, 'conversation:policy-changed', { room_id: roomId }, 3000).catch(() => undefined);
    }
  };

  const changeBlockState = async (action: 'block' | 'unblock') => {
    const roomId = selectedRoomIdRef.current;
    if (!roomId) return;
    setConversationActionLoading(true);
    try {
      const response = await authenticatedFetch(API_ENDPOINTS.FORUM.CONVERSATION_INFO, {
        method: 'POST',
        body: JSON.stringify({ room_id: roomId, action }),
      });
      setConversationInfo((current) => current ? { ...current, block: response.data?.block || current.block } : current);
      if (action === 'block') {
        setChatMessageDraft('');
        removeChatAttachment();
      }
      publishConversationPolicyChange(roomId);
      notify('success', action === 'block' ? 'This graduate can no longer message you directly.' : 'Direct messaging is available again.', action === 'block' ? 'Graduate Blocked' : 'Graduate Unblocked');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : `Unable to ${action} this graduate`, 'Conversation Information');
    } finally {
      setConversationActionLoading(false);
    }
  };

  const confirmBlockToggle = () => {
    if (!conversationInfo?.block) return;
    const shouldUnblock = conversationInfo.block.blocked_by_me;
    const recipientName = activeRoom && !activeRoom.is_group
      ? getRoomOtherParticipants(activeRoom, currentGraduateId)[0]?.full_name || 'this graduate'
      : 'this graduate';
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: shouldUnblock ? `Unblock ${recipientName}?` : `Block ${recipientName}?`,
      message: shouldUnblock
        ? `Unblock ${recipientName} and allow direct messages again?`
        : `${recipientName} will not be able to message you directly, and you will not be able to message them. You may still see and reply to each other's messages in group chats you are both in.`,
      confirmText: shouldUnblock ? `Unblock ${recipientName}` : `Block ${recipientName}`,
      cancelText: 'Cancel',
      onConfirm: () => changeBlockState(shouldUnblock ? 'unblock' : 'block'),
    });
  };

  const confirmLeaveGroup = () => {
    const roomId = selectedRoomIdRef.current;
    if (!roomId || !activeRoom?.is_group) return;
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: 'Leave Group',
      message: 'Are you sure you want to leave this group? The conversation will be removed from your message list, but it will remain available to other members.',
      confirmText: 'Leave Group',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setConversationActionLoading(true);
        try {
          const socket = chatSocketRef.current;
          let leaveToken = '';
          if (socket?.connected) {
            try {
              const prepared = await emitWithAck<{ token?: string }>(socket, 'conversation:leave-prepare', { room_id: roomId }, 3000);
              if (prepared.success) leaveToken = prepared.token || '';
            } catch {
              // Leaving is committed by the authenticated REST endpoint; realtime is best effort.
            }
          }
          const leaveResponse = await authenticatedFetch(API_ENDPOINTS.FORUM.CONVERSATION_INFO, {
            method: 'POST',
            body: JSON.stringify({ room_id: roomId, action: 'leave_group' }),
          });
          if (socket?.connected && leaveToken) {
            try {
              await emitWithAck(socket, 'conversation:leave-confirm', {
                room_id: roomId,
                token: leaveToken,
                system_message_id: Number(leaveResponse.data?.system_message_id || 0),
              }, 3000);
            } catch {
              // The local list is refreshed below even if the realtime acknowledgement is lost.
            }
          }
          if (socket?.connected) socket.emit('conversation:leave', { room_id: roomId });
          setRooms((current) => current.filter((room) => room.id !== roomId));
          setActiveRoom(null);
          setRoomMessages([]);
          setConversationInfo(null);
          setConversationInfoOpen(false);
          setFloatingChatOpen(false);
          setSelectedRoomId(null);
          await loadChats();
          notify('success', 'You left the group. The group and its messages remain available to the other members.', 'Group Left');
        } catch (error) {
          notify('error', error instanceof Error ? error.message : 'Unable to leave this group', 'Conversation Information');
        } finally {
          setConversationActionLoading(false);
        }
      },
    });
  };

  const confirmDeleteConversation = () => {
    const roomId = selectedRoomIdRef.current;
    if (!roomId) return;

    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: 'Delete Conversation',
      message: 'Remove this conversation from your message list? It is removed only for your account; other participants keep their messages. A future message will make the conversation appear again without restoring your hidden history.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setConversationActionLoading(true);
        try {
          await authenticatedFetch(API_ENDPOINTS.FORUM.CONVERSATION_INFO, {
            method: 'POST',
            body: JSON.stringify({ room_id: roomId, action: 'delete_conversation' }),
          });

          const socket = chatSocketRef.current;
          if (socket?.connected) {
            void emitWithAck(socket, 'conversation:hidden-publish', { room_id: roomId }, 3000).catch(() => undefined);
            socket.emit('conversation:leave', { room_id: roomId });
          }
          stopChatTyping(roomId);
          setRooms((current) => current.filter((room) => room.id !== roomId));
          selectedRoomIdRef.current = null;
          roomMessagesRef.current = [];
          setSelectedRoomId(null);
          setActiveRoom(null);
          setRoomMessages([]);
          setMessagePagination(null);
          setChatNewMessageAvailable(false);
          setChatMobileConversationOpen(false);
          setConversationInfo(null);
          setConversationInfoOpen(false);
          setFloatingChatOpen(false);
          setFloatingChatMinimized(false);
          await loadChats();
          notify('success', 'The conversation was removed from your account. Other participants were not affected.', 'Conversation Deleted');
        } catch (error) {
          notify('error', error instanceof Error ? error.message : 'Unable to delete this conversation', 'Delete Conversation');
        } finally {
          setConversationActionLoading(false);
        }
      },
    });
  };

  const handleGroupPhotoSelected = async (file: File) => {
    const roomId = selectedRoomIdRef.current;
    if (!roomId) return;
    const validationError = validateChatAttachmentFile(file);
    if (validationError || !file.type.startsWith('image/')) {
      notify('warning', validationError || 'Choose a supported JPG, PNG, or WebP image.', 'Group Photo');
      return;
    }

    const formData = new FormData();
    formData.append('room_id', String(roomId));
    formData.append('action', 'group_photo');
    formData.append('photo', file);
    setConversationActionLoading(true);
    try {
      const response = await authenticatedFetch(API_ENDPOINTS.FORUM.CONVERSATION_INFO, { method: 'POST', body: formData });
      const updatedRoom = response.data?.room as ChatRoom | undefined;
      if (updatedRoom) upsertConversation(updatedRoom);
      await loadConversationInfo(roomId, true);
      const socket = chatSocketRef.current;
      if (socket?.connected) void emitWithAck(socket, 'conversation:refresh', { room_id: roomId }, 3000).catch(() => undefined);
      notify('success', 'The new group photo is now visible across GradTrack messaging.', 'Group Photo Updated');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to change the group photo', 'Conversation Information');
    } finally {
      setConversationActionLoading(false);
    }
  };

  const handleChatNearBottomChange = useCallback((nearBottom: boolean) => {
    chatNearBottomRef.current = nearBottom;
    if (nearBottom) {
      setChatNewMessageAvailable(false);
      void markVisibleMessagesAsRead();
    }
  }, [markVisibleMessagesAsRead]);

  const handleScrollToNewest = useCallback(() => {
    chatNearBottomRef.current = true;
    setChatNewMessageAvailable(false);
    void markVisibleMessagesAsRead();
  }, [markVisibleMessagesAsRead]);

  const openJobDetails = async (job: JobPost) => {
    if (!jobsAvailable) {
      notify('info', 'This feature is currently unavailable.', 'Browse Jobs');
      return;
    }

    setSelectedJob(job);
    setSelectedJobLoading(true);

    try {
      const response = await authenticatedFetch(`${API_ENDPOINTS.JOBS.POSTS}?id=${job.id}`);
      if (response.data) {
        setSelectedJob(response.data as JobPost);
      }
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to load job details', 'Browse Jobs');
    } finally {
      setSelectedJobLoading(false);
    }
  };

  const openSharedJob = useCallback(async (jobId: number) => {
    if (!jobsAvailable || jobId <= 0) return;
    setSelectedJobLoading(true);
    try {
      const response = await authenticatedFetch(`${API_ENDPOINTS.JOBS.POSTS}?id=${jobId}`);
      if (!response.data) throw new Error('This job posting is no longer available.');
      setSelectedJob(response.data as JobPost);
    } catch (error) {
      notify('info', error instanceof Error ? error.message : 'This job posting is no longer available.', 'Shared Job');
    } finally {
      setSelectedJobLoading(false);
    }
  }, [authenticatedFetch, jobsAvailable, notify]);

  const toggleSavedJob = async (job: JobPost) => {
    if (savingJobIds.includes(job.id)) return;
    const isSaved = savedJobIds.has(job.id);
    setSavingJobIds((current) => [...current, job.id]);
    try {
      if (isSaved) {
        await authenticatedFetch(`${API_ENDPOINTS.JOBS.SAVED}?job_id=${job.id}`, { method: 'DELETE' });
        setSavedJobs((current) => current.filter((item) => item.id !== job.id));
        notify('success', 'Job removed from Saved Jobs.', 'Saved Jobs');
      } else {
        await authenticatedFetch(API_ENDPOINTS.JOBS.SAVED, {
          method: 'POST',
          body: JSON.stringify({ job_id: job.id }),
        });
        setSavedJobs((current) => upsertJobPost(current, { ...job, saved_at: new Date().toISOString() }));
        notify('success', 'Job saved successfully.', 'Saved Jobs');
      }
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to update Saved Jobs.', 'Saved Jobs');
      await loadSavedJobs().catch(() => undefined);
    } finally {
      setSavingJobIds((current) => current.filter((id) => id !== job.id));
    }
  };

  const openShareJob = (job: JobPost) => {
    if (!messagingAvailable) {
      notify('info', 'Messages are currently unavailable.', 'Share Job');
      return;
    }
    setShareJob(job);
    setShareSearch('');
    setShareRecipientId(null);
    setShareMessage('Check out this job opportunity!');
    if (directory.length === 0) void loadChats();
  };

  const closeShareJob = () => {
    if (shareSubmitting) return;
    setShareJob(null);
    setShareSearch('');
    setShareRecipientId(null);
    setShareMessage('Check out this job opportunity!');
  };

  const handleShareJob = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!shareJob || !shareRecipientId) {
      notify('warning', 'Select a graduate to share this job with.', 'Share Job');
      return;
    }

    setShareSubmitting(true);
    try {
      const result = await sendMessageToServer({
        recipient_id: shareRecipientId,
        message: shareMessage.trim(),
        client_message_id: createClientMessageId(currentGraduateId),
        attachment_ids: [],
        action: 'share_job',
        job_id: shareJob.id,
      });
      if (result.conversation) upsertConversation(result.conversation);
      await loadChats();
      setShareJob(null);
      setShareRecipientId(null);
      setShareSearch('');
      setShareMessage('Check out this job opportunity!');
      notify('success', 'Job shared through GradTrack Messages.', 'Share Job');
      window.dispatchEvent(new CustomEvent('gradtrack:notifications-updated', { detail: { audience: 'graduate' } }));
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to share this job.', 'Share Job');
    } finally {
      setShareSubmitting(false);
    }
  };

  const closeJobDetails = () => {
    setSelectedJob(null);
    setSelectedJobLoading(false);
  };

  const beginCreateJob = () => {
    if (!jobsAvailable) {
      notify('info', 'This feature is currently unavailable.', 'Job Posting');
      return;
    }

    resetJobForm();
    setShowJobPostForm(true);
  };

  const closeJobForm = () => {
    setShowJobPostForm(false);
    resetJobForm();
  };

  const beginEditJob = async (id: number) => {
    if (!jobsAvailable) {
      notify('info', 'This feature is currently unavailable.', 'Job Posting');
      return;
    }

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

    if (!jobsAvailable) {
      notify('info', 'This feature is currently unavailable.', 'Job Posting');
      return;
    }

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

      const response = await authenticatedFetch(API_ENDPOINTS.JOBS.POSTS, {
        method: 'POST',
        body: formData,
      });
      const savedJob = response.data as JobPost | undefined;

      notify('success', 'Job post submitted for approval.', 'Job Posting');
      closeJobForm();
      if (savedJob) {
        setMyPostedJobs((current) => upsertJobPost(current, savedJob));
        setJobs((current) => savedJob.approval_status === 'approved' && savedJob.is_active
          ? upsertJobPost(current, savedJob)
          : current.filter((job) => job.id !== savedJob.id));
      }
      await loadRatingSummary();
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
          setJobs((current) => current.filter((item) => item.id !== job.id));
          setMyPostedJobs((current) => current.filter((item) => item.id !== job.id));
        } catch (error) {
          notify('error', error instanceof Error ? error.message : 'Unable to delete job post', 'Job Posting');
        }
      },
    });
  };

  const resetProfileEditorFiles = () => {
    setProfileImageFile(null);
    setAuthenticatedProfileImagePreview(resolveAssetUrl(viewedProfileUser?.profile_image_path));
    setCoverImageFile(null);
    setCoverImagePreview(resolveAssetUrl(viewedProfileUser?.cover_image_path));
    setCoverRemoveRequested(false);
    if (profileImageInputRef.current) {
      profileImageInputRef.current.value = '';
    }
    if (coverImageInputRef.current) {
      coverImageInputRef.current.value = '';
    }
  };

  const openProfileSettings = (section: ProfileEditSection = 'basic') => {
    if (!isViewingOwnProfile) {
      return;
    }

    setProfileMenuOpen(false);
    setProfileEditSection(section);
    setActiveTab('settings');
    navigate(`/graduate/portal?tab=settings&section=${section}`);
  };

  const resetProfileSettings = () => {
    resetProfileEditorFiles();
    setProfileForm(createProfileForm(viewedProfileRecord, viewedProfileUser));
  };

  const handleProfileSettingsSectionChange = (section: ProfileEditSection) => {
    setProfileEditSection(section);
    setSearchParams({ tab: 'settings', section }, { replace: true });
  };

  const submitProfileUpdate = async ({
    profileFile = profileImageFile,
    coverFile = coverImageFile,
    removeProfile = false,
    removeCover = coverRemoveRequested,
    includeProfileFields = false,
    includePassword = false,
  }: {
    profileFile?: File | null;
    coverFile?: File | null;
    removeProfile?: boolean;
    removeCover?: boolean;
    includeProfileFields?: boolean;
    includePassword?: boolean;
  } = {}) => {
    if (!isViewingOwnProfile) {
      notify('info', 'You can only edit your own profile.', 'Community Profile');
      return;
    }

    const notification = coverFile
      ? { title: 'Cover Photo', success: 'Cover photo updated successfully.', error: 'Unable to update cover photo' }
      : removeCover
        ? { title: 'Cover Photo', success: 'Cover photo removed successfully.', error: 'Unable to remove cover photo' }
        : profileFile
          ? { title: 'Profile Photo', success: 'Profile photo updated successfully.', error: 'Unable to update profile photo' }
          : removeProfile
            ? { title: 'Profile Photo', success: 'Profile photo removed successfully.', error: 'Unable to remove profile photo' }
            : { title: 'My Profile', success: 'Profile updated successfully.', error: 'Unable to update profile' };

    const formData = new FormData();
    if (includeProfileFields) {
      formData.append('update_profile', '1');
      formData.append('first_name', profileForm.first_name.trim());
      formData.append('middle_name', profileForm.middle_name.trim());
      formData.append('last_name', profileForm.last_name.trim());
      formData.append('phone_number', profileForm.phone_number.trim());
      formData.append('birthday', profileForm.birthday);
      formData.append('civil_status', profileForm.civil_status.trim());
      formData.append('sex_gender', profileForm.sex_gender.trim());
      formData.append('current_location', profileForm.current_location.trim());
      formData.append('job_title', profileForm.job_title.trim());
      formData.append('company_name', profileForm.company_name.trim());
      formData.append('employment_location', profileForm.employment_location.trim());
      formData.append('professional_status', profileForm.professional_status.trim());
      formData.append('start_date', profileForm.start_date);
    }

    if (includePassword && profileForm.password.trim() !== '') {
      formData.append('current_password', profileForm.current_password);
      formData.append('password', profileForm.password);
    }

    if (removeProfile) {
      formData.append('remove_profile_image', '1');
    } else if (profileFile) {
      formData.append('profile_image', profileFile);
    }

    if (removeCover) {
      formData.append('remove_cover_image', '1');
    } else if (coverFile) {
      formData.append('cover_image', coverFile);
    }

    setProfileSaving(true);

    try {
      const response = await authenticatedFetch(API_ENDPOINTS.GRADUATE_PROFILE, {
        method: 'POST',
        body: formData,
      });
      const nextProfile = (response.data as GraduateProfilePayload | undefined) || null;
      setViewedProfileDetails(nextProfile);
      setViewedProfileLoaded(true);
      await checkAuth();
      setProfileImageFile(null);
      setCoverImageFile(null);
      setCoverRemoveRequested(false);
      setAuthenticatedProfileImagePreview(resolveAssetUrl(nextProfile?.user?.profile_image_path));
      setCoverImagePreview(resolveAssetUrl(nextProfile?.user?.cover_image_path));
      setProfileForm((current) => ({
        ...current,
        current_password: '',
        password: '',
        confirm_password: '',
      }));
      if (profileImageInputRef.current) {
        profileImageInputRef.current.value = '';
      }
      if (coverImageInputRef.current) {
        coverImageInputRef.current.value = '';
      }
      notify('success', notification.success, notification.title);
    } catch (error) {
      setProfileImageFile(null);
      setCoverImageFile(null);
      setCoverRemoveRequested(false);
      setAuthenticatedProfileImagePreview(resolveAssetUrl(viewedProfileUser?.profile_image_path));
      setCoverImagePreview(resolveAssetUrl(viewedProfileUser?.cover_image_path));
      notify('error', error instanceof Error ? error.message : notification.error, notification.title);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleProfileAssetSelection = (file: File | null, kind: 'profile' | 'cover') => {
    if (!isViewingOwnProfile) {
      return;
    }

    if (!file) return;

    const input = kind === 'profile' ? profileImageInputRef.current : coverImageInputRef.current;
    if (input) {
      input.value = '';
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (extension === 'heic' || extension === 'heif' || /image\/(?:hei[cf]|heif)/i.test(file.type)) {
      notify('warning', 'HEIC/HEIF photos are not supported. Please convert the photo to JPG, PNG, or WEBP.', 'My Profile');
      return;
    }

    if (!supportedProfileImageTypes.has(file.type)) {
      notify('warning', 'Only JPG, PNG, WEBP, or GIF images are supported.', 'My Profile');
      return;
    }

    if (file.size <= 0 || file.size > 5 * 1024 * 1024) {
      notify('warning', 'Profile images can be up to 5 MB.', 'My Profile');
      return;
    }

    const photoLabel = kind === 'profile' ? 'profile photo' : 'cover photo';
    const hasExistingPhoto = kind === 'profile' ? Boolean(profileImageUrl) : Boolean(profileCoverImageUrl);
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: `${hasExistingPhoto ? 'Change' : 'Upload'} ${kind === 'profile' ? 'Profile' : 'Cover'} Photo?`,
      message: `Use “${file.name}” as your ${photoLabel}? It will be visible on your GradTrack profile.`,
      confirmText: hasExistingPhoto ? 'Change Photo' : 'Upload Photo',
      cancelText: 'Cancel',
      onConfirm: () => {
        const previewUrl = URL.createObjectURL(file);
        if (kind === 'profile') {
          setProfileImageFile(file);
          setAuthenticatedProfileImagePreview(previewUrl);
          void submitProfileUpdate({ profileFile: file, coverFile: null, removeProfile: false, removeCover: false })
            .finally(() => URL.revokeObjectURL(previewUrl));
          return;
        }

        setCoverImageFile(file);
        setCoverImagePreview(previewUrl);
        setCoverRemoveRequested(false);
        void submitProfileUpdate({ profileFile: null, coverFile: file, removeProfile: false, removeCover: false })
          .finally(() => URL.revokeObjectURL(previewUrl));
      },
    });
  };

  const removeProfileImage = async (kind: 'profile' | 'cover') => {
    if (!isViewingOwnProfile) {
      return;
    }

    setProfileImageViewer(null);
    if (kind === 'profile') {
      setProfileImageFile(null);
      await submitProfileUpdate({
        profileFile: null,
        coverFile: null,
        removeProfile: true,
        removeCover: false,
      });
      return;
    }

    setCoverRemoveRequested(true);
    setCoverImageFile(null);
    setCoverImagePreview('');
    await submitProfileUpdate({
      profileFile: null,
      coverFile: null,
      removeProfile: false,
      removeCover: true,
    });
  };

  const requestProfileImageRemoval = (kind: 'profile' | 'cover') => {
    const isProfilePhoto = kind === 'profile';
    setMsgBox({
      isOpen: true,
      type: 'confirm',
      title: `Remove ${isProfilePhoto ? 'Profile' : 'Cover'} Photo?`,
      message: isProfilePhoto
        ? 'Your current profile photo will be permanently removed. Your initials will be shown instead.'
        : 'Your current cover photo will be permanently removed and the default GradTrack cover will be shown.',
      confirmText: 'Remove Photo',
      cancelText: 'Keep Photo',
      destructive: true,
      onConfirm: () => {
        void removeProfileImage(kind);
      },
    });
  };

  const changeProfileImageFromViewer = (kind: 'profile' | 'cover') => {
    setProfileImageViewer(null);
    const input = kind === 'profile' ? profileImageInputRef.current : coverImageInputRef.current;
    input?.click();
  };

  const handleProfileSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (profileEditSection !== 'security') {
      if (!profileForm.first_name.trim() || !profileForm.last_name.trim()) {
        notify('warning', 'First name and last name are required.', 'My Profile');
        return;
      }

      if (profileForm.phone_number.trim() && !/^[0-9+()\-.\s]+$/.test(profileForm.phone_number.trim())) {
        notify('warning', 'Phone number contains unsupported characters.', 'My Profile');
        return;
      }

      const today = new Date();
      today.setHours(23, 59, 59, 999);
      for (const [label, value] of [['Birthday', profileForm.birthday], ['Start date', profileForm.start_date]]) {
        if (value && new Date(`${value}T00:00:00`) > today) {
          notify('warning', `${label} cannot be in the future.`, 'My Profile');
          return;
        }
      }
    }

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

    await submitProfileUpdate({
      includeProfileFields: profileEditSection !== 'security',
      includePassword: changingPassword,
    });
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

  const handleOpenProfileSettings = () => {
    setProfileMenuOpen(false);
    setProfileEditSection('basic');
    setActiveTab('settings');
    navigate('/graduate/portal?tab=settings&section=basic');
  };

  const navItems: Array<{ key: PortalTab; label: string; shortLabel: string; icon: LucideIcon; badge?: number }> = [
    { key: 'community_forum', label: 'Home', shortLabel: 'Home', icon: Home },
    { key: 'announcements', label: 'Announcements', shortLabel: 'News', icon: Megaphone },
    { key: 'messages', label: 'Messages', shortLabel: 'Chats', icon: MessageCircle, badge: unreadMessageCount },
    { key: 'jobs', label: 'Browse Jobs', shortLabel: 'Jobs', icon: Briefcase, badge: notificationCategoryCounts.browse_jobs },
    { key: 'job_posting', label: 'Job Posting', shortLabel: 'Post Job', icon: Pencil, badge: notificationCategoryCounts.job_posting },
    { key: 'my_profile', label: 'My Profile', shortLabel: 'Profile', icon: User },
  ];
  const primaryNavItems = navItems.filter((item) => item.key !== 'my_profile');
  const activeNavItem = navItems.find((item) => item.key === activeTab);
  const mobileBottomNavItems = [
    {
      key: 'community_forum',
      label: 'Home',
      icon: Home,
      active: activeTab === 'community_forum' || activeTab === 'dashboard',
      onSelect: () => selectTab('community_forum'),
    },
    {
      key: 'announcements',
      label: 'Announcements',
      icon: Megaphone,
      active: activeTab === 'announcements',
      onSelect: () => selectTab('announcements'),
    },
    {
      key: 'messages',
      label: 'Chats',
      icon: MessageCircle,
      active: activeTab === 'messages',
      badge: unreadMessageCount,
      onSelect: () => selectTab('messages'),
    },
    {
      key: 'jobs',
      label: 'Browse Jobs',
      icon: Briefcase,
      active: activeTab === 'jobs',
      badge: notificationCategoryCounts.browse_jobs,
      onSelect: () => selectTab('jobs'),
    },
    {
      key: 'job_posting',
      label: 'Job Posting',
      icon: Pencil,
      active: activeTab === 'job_posting',
      badge: notificationCategoryCounts.job_posting,
      onSelect: () => selectTab('job_posting'),
    },
  ];

  const profileInputClass = 'w-full rounded-2xl border border-[var(--border-strong)] bg-[var(--input)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-blue-500';

  const activeTypingNames = selectedRoomId
    ? Object.values(chatTypingUsers[selectedRoomId] || {})
        .filter((typing) => typing.expiresAt > Date.now())
        .map((typing) => typing.name)
    : [];
  const displayedChatRoom = activeRoom?.id === selectedRoomId
    ? activeRoom
    : rooms.find((room) => room.id === selectedRoomId) || null;

  const renderChatWorkspace = () => {

    return (
      <RealtimeMessagingWorkspace
          currentGraduate={{
            graduate_id: currentGraduateId,
            full_name: user?.full_name || 'Graduate',
            profile_image_path: user?.profile_image_path,
            program_code: user?.program_code,
            program_name: user?.program_name,
          }}
          rooms={rooms}
          selectedRoomId={selectedRoomId}
          activeRoom={activeRoom && activeRoom.id === selectedRoomId ? activeRoom : null}
          temporaryRecipient={temporaryChatRecipient}
          profileIntro={chatProfileIntro}
          profileIntroLoading={chatProfileIntroLoading}
          messages={(activeRoom && activeRoom.id === selectedRoomId) || temporaryChatRecipient ? roomMessages : []}
          search={chatSearch}
          draft={chatMessageDraft}
          roomLoading={roomLoading}
          initialLoading={loading && rooms.length === 0}
          connectionStatus={chatConnectionStatus}
          loadingOlder={olderMessagesLoading}
          hasMoreOlder={!!messagePagination?.has_more_older}
          typingNames={activeTypingNames}
          selectedAttachment={chatSelectedAttachment}
          newMessageAvailable={chatNewMessageAvailable}
          mobileChatOpen={chatMobileConversationOpen}
          resolveAssetUrl={resolveAssetUrl}
          onSearchChange={setChatSearch}
          onSelectRoom={(roomId) => {
            setAddMembersOpen(false);
            temporaryChatRecipientRef.current = null;
            setTemporaryChatRecipient(null);
            setChatProfileIntro(null);
            setChatProfileIntroLoading(false);
            chatProfileIntroRequestRef.current += 1;
            setSelectedRoomId(roomId);
            setChatMobileConversationOpen(true);
          }}
          onBackToList={() => setChatMobileConversationOpen(false)}
          onDraftChange={handleChatDraftInput}
          onTypingStop={() => stopChatTyping()}
          onSend={handleSendMessage}
          onRetryMessage={handleRetryMessage}
          onDeleteMessage={confirmDeleteMessage}
          onLoadOlder={loadOlderRoomMessages}
          onNearBottomChange={handleChatNearBottomChange}
          onScrollToNewest={handleScrollToNewest}
          onAttachmentSelected={handleChatAttachmentSelected}
          onRemoveAttachment={removeChatAttachment}
          onRetryAttachment={handleRetryAttachment}
          onOpenNewConversation={() => openChatModal('direct')}
          onOpenProfile={openMiniProfile}
          onViewJob={openSharedJob}
          conversationInfoOpen={conversationInfoOpen}
          conversationInfo={conversationInfo?.room.id === selectedRoomId ? conversationInfo : null}
          conversationInfoLoading={conversationInfoLoading}
          conversationActionLoading={conversationActionLoading}
          onToggleConversationInfo={toggleConversationInfo}
          onCloseConversationInfo={() => setConversationInfoOpen(false)}
          onBlockToggle={confirmBlockToggle}
          onLeaveGroup={confirmLeaveGroup}
          onDeleteConversation={confirmDeleteConversation}
          onGroupPhotoSelected={handleGroupPhotoSelected}
          onOpenAddMembers={openAddMembers}
      />
    );
  };

  const ActiveNavIcon = activeTab === 'settings' ? Settings : (activeTab === 'saved_jobs' ? Bookmark : (activeNavItem?.icon || Home));
  return (
    <div className="min-h-screen overflow-x-clip bg-[#f4f6fb] text-slate-900" style={graduatePortalLayoutStyle}>
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto grid max-w-screen-2xl grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-4 py-2 sm:px-6 xl:grid-cols-[minmax(180px,1fr)_auto_minmax(340px,1fr)] xl:gap-5">
          <button
            type="button"
            onClick={() => selectTab('community_forum')}
            className="flex shrink-0 items-center gap-3 justify-self-start text-left"
            title="GradTrack Community"
            aria-label="Open GradTrack Community"
          >
            <img src={systemLogoUrl} alt={systemShortName} className="h-9 w-9 object-contain" />
            <div className="hidden sm:block">
              <p className="text-base font-bold leading-tight text-gray-900">{systemShortName}</p>
              <p className="text-[11px] leading-tight text-slate-500">Community</p>
            </div>
          </button>

          <nav className="hidden h-12 w-[40rem] items-center justify-center gap-6 justify-self-center rounded-2xl px-3 2xl:w-[44rem] 2xl:gap-8 xl:flex" aria-label="Graduate portal navigation">
            {primaryNavItems.map((item) => {
              const isActive = activeTab === item.key;
              const itemStyle = {
                '--graduate-nav-open-width': getPortalNavOpenWidth(item.label),
                '--graduate-nav-label-width': getPortalNavLabelWidth(item.label),
              } as CSSProperties;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => selectTab(item.key)}
                  aria-label={item.label}
                  style={itemStyle}
                  className={`group relative inline-flex h-11 w-11 shrink-0 items-center justify-start rounded-full border text-sm font-semibold transition-[width,background-color,border-color,color,box-shadow] duration-[250ms] ease-out hover:w-[var(--graduate-nav-open-width)] focus-visible:w-[var(--graduate-nav-open-width)] ${
                    isActive
                      ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-100 hover:border-blue-200 hover:bg-blue-100'
                      : 'border-transparent text-gray-600 hover:border-blue-100 hover:bg-blue-50 hover:text-blue-700 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-blue-200'
                  }`}
                >
                  <span className="relative flex h-11 w-11 shrink-0 items-center justify-center">
                    <item.icon className="h-5 w-5" />
                    {typeof item.badge === 'number' && item.badge > 0 && (
                      <span
                        className={`absolute right-0 top-0 flex min-h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-center text-[10px] font-bold leading-none shadow-sm ring-2 ring-white dark:ring-slate-900 ${
                          isActive ? 'bg-[#f8c331] text-blue-950' : 'bg-rose-500 text-white'
                        }`}
                      >
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 max-w-0 -translate-x-1 overflow-hidden whitespace-nowrap pr-0 text-sm opacity-0 transition-[max-width,opacity,transform,padding] duration-[250ms] ease-out group-hover:max-w-[var(--graduate-nav-label-width)] group-hover:translate-x-0 group-hover:pr-4 group-hover:opacity-100 group-focus-visible:max-w-[var(--graduate-nav-label-width)] group-focus-visible:translate-x-0 group-focus-visible:pr-4 group-focus-visible:opacity-100">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="flex min-w-0 shrink-0 items-center justify-end gap-2 justify-self-end sm:gap-3">
            <ThemeToggle compact />
            {notificationsEnabled && <NotificationBell audience="graduate" expandLabel onSnapshot={applyNotificationSnapshot} />}

            <div className="relative min-w-0" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => setProfileMenuOpen((current) => !current)}
                className={`flex items-center gap-2 rounded-full border bg-white px-2 py-1.5 shadow-sm transition hover:border-gray-300 ${
                  activeTab === 'my_profile' || activeTab === 'settings' ? 'border-blue-200 ring-2 ring-blue-100' : 'border-gray-200'
                }`}
                aria-haspopup="menu"
                aria-expanded={profileMenuOpen}
              >
                <Avatar src={navbarProfileImageUrl} label={user?.full_name} size="sm" />
                <div className="hidden min-w-0 flex-1 text-left 2xl:block">
                  <p className="max-w-[150px] truncate text-sm font-semibold text-gray-800">{user?.full_name || 'Graduate User'}</p>
                  <p className="max-w-[150px] truncate text-xs text-gray-500">{user?.program_code || 'Graduate'}</p>
                </div>
                <ChevronDown className={`hidden h-4 w-4 text-gray-500 transition md:block ${profileMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {profileMenuOpen && (
                <div className="absolute right-0 z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border bg-white py-2 shadow-xl sm:w-80">
                  <div className="flex items-center gap-3 border-b px-4 py-3">
                    <Avatar src={navbarProfileImageUrl} label={user?.full_name} size="lg" />
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
                    onClick={() => {
                      setProfileMenuOpen(false);
                      selectTab('saved_jobs');
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    <Bookmark className="h-4 w-4" />
                    Saved Jobs
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenProfileSettings}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    <Settings className="h-4 w-4" />
                    Settings
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

          </div>
        </div>
      </header>

      <MobileBottomNav items={mobileBottomNavItems} ariaLabel="Graduate portal mobile navigation" className="xl:hidden" />

      <main className={`relative z-0 mx-auto max-w-screen-2xl px-3 py-4 sm:px-6 sm:py-6 xl:pb-10 ${['jobs', 'saved_jobs'].includes(activeTab) ? 'pb-[calc(7rem+env(safe-area-inset-bottom))]' : 'pb-[calc(6rem+env(safe-area-inset-bottom))]'}`}>
        <section className={`${activeTab === 'jobs' ? 'hidden' : 'mb-4 flex'} flex-col gap-3 border-b border-slate-200 pb-4 sm:mb-5 sm:gap-4 sm:pb-5 lg:flex-row lg:items-center lg:justify-between`}>
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white shadow-sm sm:h-12 sm:w-12 sm:rounded-2xl">
              <ActiveNavIcon className="h-5 w-5 sm:h-6 sm:w-6" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700 sm:text-xs sm:tracking-[0.22em]">GradTrack Community</p>
              <h1 className="mt-0.5 break-words text-xl font-bold text-slate-900 sm:mt-1 sm:text-3xl">{pageHeading.title}</h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{pageHeading.subtitle}</p>
            </div>
          </div>

        </section>

          {loading ? (
            activeTab === 'jobs'
              ? <JobsPageSkeleton />
              : <div className="flex min-h-[300px] items-center justify-center rounded-[32px] border border-slate-200 bg-white">
                  <div className="flex items-center gap-3 text-slate-500">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading your graduate portal...
                  </div>
                </div>
          ) : (
            <>
              {activeTab === 'announcements' && (
                <GraduateAnnouncements announcementId={routeAnnouncementId || undefined} />
              )}

              {isViewingOwnProfile && ['my_profile', 'settings'].includes(activeTab) && (
                <>
                  <input
                    ref={profileImageInputRef}
                    type="file"
                    accept={profileImageAccept}
                    className="hidden"
                    onChange={(event) => handleProfileAssetSelection(event.target.files?.[0] || null, 'profile')}
                  />
                  <input
                    ref={coverImageInputRef}
                    type="file"
                    accept={profileImageAccept}
                    className="hidden"
                    onChange={(event) => handleProfileAssetSelection(event.target.files?.[0] || null, 'cover')}
                  />
                </>
              )}

              {activeTab === 'dashboard' && (
                <section className="space-y-6">
                  <div className="grid gap-4 lg:grid-cols-4">
                    <DashboardCard label="Published Forum Posts" value={forumPosts.length} caption="Visible in the community feed" tone="blue" />
                    <DashboardCard label="My Published Posts" value={publishedForumPostsCount} caption="Published immediately after posting" tone="amber" />
                    <DashboardCard label="Conversations" value={rooms.length} caption={`${unreadMessageCount} unread message${unreadMessageCount === 1 ? '' : 's'}`} tone="pink" />
                    <DashboardCard label="Approved Jobs" value={jobs.length} caption={`${myPostedJobs.length} post${myPostedJobs.length === 1 ? '' : 's'} created by you`} tone="emerald" />
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[32px] sm:p-6">
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
                        <InfoTile title="Messages" description="Continue direct and group conversations in one inbox." actionLabel="Open Messages" onAction={() => selectTab('messages')} />
                        <InfoTile title="Job Posting" description={canPostJobs ? 'Your account can submit new job opportunities.' : 'Locked until employment status is marked as employed.'} actionLabel="Open Job Posting" onAction={() => selectTab('job_posting')} />
                        <InfoTile title="Browse Jobs" description="Review approved job openings shared in GradTrack." actionLabel="Browse Jobs" onAction={() => selectTab('jobs')} />
                        <InfoTile title="My Profile" description="Review your public graduate profile and community activity." actionLabel="View Profile" onAction={() => selectTab('my_profile')} />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[32px] sm:p-6">
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

              {activeTab === 'community_forum' && unavailableForTab(activeTab) && (
                <FeatureUnavailable compact {...unavailableForTab(activeTab)!} />
              )}

              {activeTab === 'community_forum' && !unavailableForTab(activeTab) && (
                <section className="space-y-6">
                  <div className="rounded-[32px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <Avatar src={authenticatedUserProfileImageUrl} label={user?.full_name} size="lg" />
                      <button type="button" onClick={() => openForumComposer()} className="flex-1 rounded-full bg-[#f5f7fb] px-5 py-3 text-left text-sm text-slate-500 transition hover:bg-[#edf1f8]">
                        Share something with the graduate community...
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

                  <div className="grid gap-4 lg:grid-cols-2">
                    {getSetting('community_default_announcement') && (
                      <div className="rounded-[24px] border border-blue-100 bg-blue-50 px-5 py-4">
                        <p className="text-sm font-bold text-blue-900">Community Announcement</p>
                        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-blue-800">{getSetting('community_default_announcement')}</p>
                      </div>
                    )}
                    {getSetting('community_guidelines') && (
                      <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
                        <p className="text-sm font-bold text-slate-900">Community Guidelines</p>
                        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{getSetting('community_guidelines')}</p>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
                    <div className="min-w-0 space-y-5">
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
                            {forumProgramOptions.map((code) => (
                              <option key={code} value={code}>{code}</option>
                            ))}
                          </select>

                          <select value={yearFilter} onChange={(event) => { setYearFilter(event.target.value); }} className="rounded-2xl border border-slate-200 bg-[#fafbff] px-4 py-3 text-sm outline-none transition focus:border-blue-500">
                            <option value="">All Years</option>
                            {forumYearOptions.map((year) => (
                              <option key={year} value={year}>{year}</option>
                            ))}
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
                              <button type="button" onClick={() => openMiniProfile(post.graduate_id)} className="flex min-w-0 items-center gap-3 text-left">
                                <span className="relative shrink-0">
                                  <Avatar src={resolveAssetUrl(post.author_profile_image_path)} label={post.author_name} size="md" />
                                  {chatPresenceByGraduateRef.current.get(post.graduate_id)?.is_online && <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900" aria-label="Online" />}
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900 transition hover:text-blue-700">
                                    {post.author_name}
                                  </p>
                                  <p className="truncate text-xs text-slate-500">
                                    {post.author_program_code || post.author_program_name || 'Graduate'} - {formatRelativeTime(post.created_at)}
                                  </p>
                                </div>
                              </button>

                              <div className="flex items-center gap-2">
                                {post.category && (
                                  <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-700">{post.category}</span>
                                )}
                                {messagingAvailable && post.graduate_id !== currentGraduateId && (
                                  <button type="button" onClick={() => void createDirectChat(post.graduate_id)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                    Message
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="px-5 pb-5 sm:px-6">
                              <button type="button" onClick={() => void loadPostDetail(post.id)} className="w-full text-left">
                                {post.title && <h3 className="text-xl font-bold text-slate-900">{post.title}</h3>}
                                <p className={`${post.title ? 'mt-3' : ''} whitespace-pre-line text-sm leading-7 text-slate-700`}>{previewText(post.content)}</p>
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
                                <button type="button" onClick={() => openReportModal({ target_type: 'post', target_id: post.id, label: previewText(post.title || post.content, 80) })} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 transition hover:text-amber-700">
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

                    <div className="min-w-0 space-y-5">
                      <aside className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-[calc(var(--graduate-portal-header-height)_+_var(--graduate-portal-sticky-gap))] lg:z-10 lg:max-h-[calc(100vh_-_var(--graduate-portal-header-height)_-_2rem)] lg:overflow-y-auto lg:overscroll-contain">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h2 className="text-xl font-bold text-slate-900">Recent Messages</h2>
                            <p className="text-sm text-slate-500">A preview of your unified inbox.</p>
                          </div>
                          {messagingAvailable && (
                            <button type="button" onClick={() => selectTab('messages')} className="rounded-full border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-50">
                              View all
                            </button>
                          )}
                        </div>

                        {!messagingAvailable ? (
                          <FeatureUnavailable compact title="Messages are currently unavailable." message="This feature is currently unavailable." />
                        ) : (
                        <div className="mt-4 rounded-3xl bg-[#fafbff] p-3 dark:bg-slate-950/60">
                          <div className="space-y-2">
                            {rooms.length === 0 ? (
                              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                                No conversations yet. Start one from Messages.
                              </div>
                            ) : (
                              rooms.slice(0, 4).map((room) => (
                                  <button key={room.id} type="button" onClick={() => openFloatingChat(room.id)} className="flex w-full items-start gap-3 rounded-2xl border border-transparent bg-white px-3 py-3 text-left transition hover:border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800">
                                    <span className="relative shrink-0">
                                      <Avatar src={resolveAssetUrl((room.is_group && room.group_image_url) || getRoomOtherParticipants(room, currentGraduateId)[0]?.profile_image_path || room.participants[0]?.profile_image_path)} label={getRoomLabel(room, currentGraduateId)} size="sm" />
                                      {!room.is_group && getRoomOtherParticipants(room, currentGraduateId)[0]?.is_online && <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900" aria-label="Online" />}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-start justify-between gap-3">
                                        <p className={`truncate text-sm text-slate-900 dark:text-slate-100 ${(room.unread_count || 0) > 0 ? 'font-bold' : 'font-semibold'}`}>{getRoomLabel(room, currentGraduateId)}</p>
                                        {!room.is_group && getRoomOtherParticipants(room, currentGraduateId)[0]?.is_online ? (
                                          <span className="shrink-0 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">Active now</span>
                                        ) : (
                                          <span className="shrink-0 text-[11px] text-slate-400">{formatRelativeTime(room.last_message_at || room.updated_at)}</span>
                                        )}
                                      </div>
                                      <div className="mt-1 flex items-center gap-2">
                                        <p className={`min-w-0 flex-1 truncate text-xs dark:text-slate-400 ${(room.unread_count || 0) > 0 ? 'font-bold text-slate-800 dark:text-slate-200' : 'text-slate-500'}`}>{room.last_message || 'No messages yet'}</p>
                                        {(room.unread_count || 0) > 0 && <span className="min-w-5 rounded-full bg-blue-700 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">{room.unread_count}</span>}
                                      </div>
                                    </div>
                                  </button>
                              ))
                            )}
                          </div>
                        </div>
                        )}
                      </aside>
                    </div>
                  </div>
                </section>
              )}

              {activeTab === 'messages' && (
                unavailableForTab(activeTab)
                  ? <FeatureUnavailable compact {...unavailableForTab(activeTab)!} />
                  : renderChatWorkspace()
              )}

              {activeTab === 'jobs' && unavailableForTab(activeTab) && (
                <FeatureUnavailable compact {...unavailableForTab(activeTab)!} />
              )}

              {activeTab === 'jobs' && !unavailableForTab(activeTab) && (
                <section className="min-w-0 space-y-4 sm:space-y-5" aria-labelledby="browse-jobs-title">
                  <div className="relative min-h-[140px] min-w-0 overflow-hidden rounded-[28px] border border-blue-200 bg-blue-950 shadow-sm dark:border-blue-500/30 sm:min-h-[160px]">
                    <img src="/browse-jobs-city.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-center" aria-hidden="true" />
                    <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-blue-950/70 to-blue-900/20" aria-hidden="true" />
                    <div className="relative z-10 flex min-h-[140px] max-w-2xl flex-col justify-center px-5 py-6 sm:min-h-[160px] sm:px-8 sm:py-7">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-200">Graduate opportunities</p>
                      <h1 id="browse-jobs-title" className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">Browse Jobs</h1>
                      <p className="mt-2 text-sm leading-6 text-blue-50/90 sm:text-base">Find opportunities matched to your program and career goals.</p>
                    </div>
                  </div>

                  <div className="grid min-w-0 gap-4 md:grid-cols-[220px_minmax(0,1fr)] lg:gap-5 lg:grid-cols-[248px_minmax(0,1fr)] xl:grid-cols-[264px_minmax(0,1fr)]">
                    <aside className="hidden md:block">
                      <div className="sticky top-[calc(var(--graduate-portal-header-height)_+_var(--graduate-portal-sticky-gap))] max-h-[calc(100vh_-_var(--graduate-portal-header-height)_-_2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 lg:p-5">
                        <JobFiltersPanel
                          options={jobFilterOptions}
                          locationOptions={searchableJobLocations}
                          locationsLoading={jobLocationsLoading}
                          locationInputId="job-filter-location-desktop"
                          keyword={jobSearch}
                          location={jobLocationFilter}
                          jobTypes={jobTypeFilters}
                          programFits={jobProgramFitFilters}
                          industries={jobIndustryFilters}
                          activeFilterCount={activeJobFilterCount}
                          onKeywordChange={setJobSearch}
                          onLocationChange={setJobLocationFilter}
                          onJobTypesChange={setJobTypeFilters}
                          onProgramFitsChange={setJobProgramFitFilters}
                          onIndustriesChange={setJobIndustryFilters}
                          onClear={clearJobFilters}
                        />
                      </div>
                    </aside>

                    <div className="min-w-0">
                      {jobsLoading ? (
                        <JobResultsSkeleton />
                      ) : jobsError ? (
                        <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-rose-100 bg-white px-6 py-12 text-center shadow-sm dark:border-rose-500/30 dark:bg-slate-900">
                          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300"><AlertCircle className="h-6 w-6" /></span>
                          <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">Unable to load job opportunities.</h2>
                          <p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">Please check your connection and try again. Your filters and saved jobs have not been changed.</p>
                          <button type="button" onClick={() => void loadJobs()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800"><ArrowRight className="h-4 w-4" /> Try Again</button>
                        </div>
                      ) : (
                        <>
                          <div id="job-results-summary" className="mb-4 scroll-mt-24 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:px-5">
                            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <p className="text-base font-bold text-slate-900 dark:text-slate-100" aria-live="polite"><span className="text-blue-700 dark:text-blue-300">{filteredJobs.length}</span> job{filteredJobs.length === 1 ? '' : 's'} found</p>
                                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">Discover opportunities from our alumni and partner companies</p>
                              </div>
                              <div className="flex min-w-0 items-center gap-2 self-stretch sm:self-auto">
                                <button type="button" onClick={() => setMobileJobFiltersOpen(true)} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 md:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                                  <Filter className="h-4 w-4" /> Filters
                                  {activeJobFilterCount > 0 && <span className="rounded-full bg-blue-700 px-1.5 py-0.5 text-[10px] font-bold text-white">{activeJobFilterCount}</span>}
                                </button>
                                <label className="flex min-w-0 flex-1 items-center justify-end gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 sm:flex-none">
                                  <span className="hidden shrink-0 lg:inline">Sort by:</span>
                                  <select aria-label="Sort jobs" value={jobSort} onChange={(event) => setJobSort(event.target.value as JobSortOption)} className="h-10 min-w-0 max-w-full flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:focus:ring-blue-900 sm:flex-none">
                                <option value="recent">Most Recent</option>
                                <option value="oldest">Oldest</option>
                                <option value="deadline">Deadline Soonest</option>
                                  </select>
                                </label>
                              </div>
                            </div>
                          </div>

                          {filteredJobs.length === 0 ? (
                            <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
                              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"><Briefcase className="h-7 w-7" /></span>
                              <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">No jobs found</h2>
                              <p className="mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">We couldn&apos;t find jobs matching your current filters.</p>
                              {activeJobFilterCount > 0 && <button type="button" onClick={clearJobFilters} className="mt-5 rounded-xl border border-blue-200 bg-blue-50 px-5 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-blue-500/40 dark:bg-blue-950/30 dark:text-blue-200">Clear Filters</button>}
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="grid min-w-0 grid-cols-1 gap-4">
                                {paginatedJobs.map((job) => (
                                  <JobCard
                                    key={job.id}
                                    job={job}
                                    saved={savedJobIds.has(job.id)}
                                    saving={savingJobIds.includes(job.id)}
                                    highlighted={highlightedJobId === job.id}
                                    elementRef={(element) => { jobCardRefs.current[job.id] = element; }}
                                    onOpenProfile={openCommunityProfile}
                                    onToggleSave={toggleSavedJob}
                                    onShare={openShareJob}
                                    onViewDetails={openJobDetails}
                                  />
                                ))}
                              </div>

                              {jobPageCount > 1 && (
                                <nav aria-label="Job results pagination" className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
                                  <p className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 sm:text-left">
                                    Showing {(jobPage - 1) * JOBS_PER_PAGE + 1}–{Math.min(jobPage * JOBS_PER_PAGE, filteredJobs.length)} of {filteredJobs.length} jobs
                                  </p>
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button type="button" onClick={() => changeJobPage(jobPage - 1)} disabled={jobPage === 1} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /><span className="hidden sm:inline">Previous</span></button>
                                    {jobPaginationItems.map((item, index) => item === 'ellipsis' ? (
                                      <span key={`job-page-ellipsis-${index}`} className="flex h-9 w-7 items-center justify-center text-sm text-slate-400" aria-hidden="true">…</span>
                                    ) : (
                                      <button key={item} type="button" onClick={() => changeJobPage(item)} aria-current={item === jobPage ? 'page' : undefined} className={`flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-semibold transition ${item === jobPage ? 'bg-blue-700 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'}`}>{item}</button>
                                    ))}
                                    <button type="button" onClick={() => changeJobPage(jobPage + 1)} disabled={jobPage === jobPageCount} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800" aria-label="Next page"><span className="hidden sm:inline">Next</span><ChevronRight className="h-4 w-4" /></button>
                                  </div>
                                </nav>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {mobileJobFiltersOpen && (
                    <div className="fixed inset-0 z-[80] md:hidden">
                      <button type="button" onClick={() => setMobileJobFiltersOpen(false)} className="absolute inset-0 bg-slate-950/45" aria-label="Close filters" />
                      <div role="dialog" aria-modal="true" aria-labelledby="mobile-job-filters-title" className="job-filter-sheet-enter absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-[28px] border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">Refine results</p>
                          <h2 id="mobile-job-filters-title" className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">Filters</h2>
                        </div>
                        <button type="button" onClick={() => setMobileJobFiltersOpen(false)} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close filters"><X className="h-5 w-5" /></button>
                      </div>
                      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                        <JobFiltersPanel
                          options={jobFilterOptions}
                          locationOptions={searchableJobLocations}
                          locationsLoading={jobLocationsLoading}
                          locationInputId="job-filter-location-mobile"
                          keyword={jobSearch}
                          location={jobLocationFilter}
                          jobTypes={jobTypeFilters}
                          programFits={jobProgramFitFilters}
                          industries={jobIndustryFilters}
                          activeFilterCount={activeJobFilterCount}
                          onKeywordChange={setJobSearch}
                          onLocationChange={setJobLocationFilter}
                          onJobTypesChange={setJobTypeFilters}
                          onProgramFitsChange={setJobProgramFitFilters}
                          onIndustriesChange={setJobIndustryFilters}
                          onClear={clearJobFilters}
                          showHeading={false}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3 border-t border-slate-100 bg-white px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 dark:border-slate-700 dark:bg-slate-900">
                        <button type="button" onClick={clearJobFilters} disabled={activeJobFilterCount === 0} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">Clear all</button>
                        <button type="button" onClick={() => setMobileJobFiltersOpen(false)} className="rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-800">Show {filteredJobs.length} job{filteredJobs.length === 1 ? '' : 's'}</button>
                      </div>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {activeTab === 'saved_jobs' && unavailableForTab(activeTab) && (
                <FeatureUnavailable compact {...unavailableForTab(activeTab)!} />
              )}

              {activeTab === 'saved_jobs' && !unavailableForTab(activeTab) && (
                <section className="min-w-0 space-y-4 sm:space-y-5">
                  <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Saved Jobs</h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Only active, approved, and unexpired saved opportunities appear here.</p>
                    </div>
                    <div className="self-start rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:self-auto">
                      {savedJobs.length} saved job{savedJobs.length === 1 ? '' : 's'}
                    </div>
                  </div>

                  {savedJobs.length === 0 ? (
                    <div className="rounded-[32px] border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
                      <Bookmark className="mx-auto h-9 w-9 text-slate-300 dark:text-slate-600" />
                      <p className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-200">No saved jobs yet.</p>
                      <button type="button" onClick={() => selectTab('jobs')} className="mt-4 rounded-full bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">Browse Jobs</button>
                    </div>
                  ) : (
                    <div className="grid min-w-0 grid-cols-1 gap-4 sm:gap-5">
                      {savedJobs.map((job) => (
                        <JobCard
                          key={job.id}
                          job={job}
                          saved
                          saving={savingJobIds.includes(job.id)}
                          onOpenProfile={openCommunityProfile}
                          onToggleSave={toggleSavedJob}
                          onShare={openShareJob}
                          onViewDetails={openJobDetails}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {activeTab === 'job_posting' && unavailableForTab(activeTab) && (
                <FeatureUnavailable compact {...unavailableForTab(activeTab)!} />
              )}

              {activeTab === 'job_posting' && !unavailableForTab(activeTab) && (
                <section className="space-y-6">
                  {!showJobPostForm && (
                    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[32px] sm:p-6">
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
                        <div className="min-w-0">
                          <label htmlFor="graduate-job-location" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Location</label>
                          <JobLocationCombobox id="graduate-job-location" value={myJobForm.location} options={searchableJobLocations} loading={jobLocationsLoading} onChange={(value) => setMyJobForm((current) => ({ ...current, location: value }))} placeholder="City, province, or remote" inputClassName="h-[46px] w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-9 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                        </div>
                        <Field label="Salary Range">
                          <input value={myJobForm.salary_range} onChange={(event) => setMyJobForm((current) => ({ ...current, salary_range: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500" />
                        </Field>
                        <Field label="Employment Type">
                          <select value={myJobForm.job_type} onChange={(event) => setMyJobForm((current) => ({ ...current, job_type: event.target.value }))} className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500">
                            <option value="full_time">Full time</option>
                            <option value="part_time">Part time</option>
                            <option value="contract">Contract</option>
                            {myJobForm.id && myJobForm.job_type === 'internship' && <option value="internship">Internship (legacy post)</option>}
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
                        <JobProgramFitPicker id="graduate-job-program-fit" programs={jobPrograms} value={myJobForm.course_program_fit} onChange={(value) => setMyJobForm((current) => ({ ...current, course_program_fit: value }))} />
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
                  {viewedProfileLoading && !viewedProfileLoaded ? (
                    <ProfileSkeleton />
                  ) : (
                    <ProfileWorkspace
                      user={viewedProfileUser}
                      profile={viewedProfileRecord}
                      survey={profileSurvey}
                      personalFields={profilePersonalFields}
                      workFields={profileWorkFields}
                      educationFields={profileEducationFields}
                      graduateStudyFields={profileGraduateStudyFields}
                      trainings={profileTrainings}
                      posts={profilePosts}
                      profileImageUrl={profileImageUrl}
                      coverImageUrl={profileCoverImageUrl}
                      defaultLogoUrl={systemLogoUrl}
                      jobTitle={profileJobTitle}
                      canEdit={isViewingOwnProfile}
                      saving={profileSaving}
                      messagingAvailable={messagingAvailable}
                      currentGraduateId={currentGraduateId}
                      forumActionKey={forumActionKey}
                      onEdit={openProfileSettings}
                      onChangeProfilePhoto={() => profileImageInputRef.current?.click()}
                      onRemoveProfilePhoto={() => requestProfileImageRemoval('profile')}
                      onChangeCoverPhoto={() => coverImageInputRef.current?.click()}
                      onRemoveCoverPhoto={() => requestProfileImageRemoval('cover')}
                      onOpenProfileImage={(src, alt, kind) => setProfileImageViewer({ src, alt, kind })}
                      onMessage={() => viewedProfileUser?.graduate_id && void createDirectChat(viewedProfileUser.graduate_id)}
                      onOpenPost={(post) => void loadPostDetail(post.id)}
                      onOpenMedia={openMediaViewer}
                      onToggleLike={(postId) => void toggleLike(postId)}
                      onEditPost={openForumComposer}
                      onDeletePost={handleForumDelete}
                      onOpenProfile={openMiniProfile}
                    />
                  )}
                </section>
              )}

              {activeTab === 'settings' && (
                <section>
                  {viewedProfileLoading && !viewedProfileLoaded ? (
                    <ProfileSettingsSkeleton />
                  ) : (
                    <ProfileSettingsWorkspace
                      activeSection={profileEditSection}
                      user={viewedProfileUser}
                      survey={profileSurvey}
                      form={profileForm}
                      inputClassName={profileInputClass}
                      profileImageUrl={profileImageUrl}
                      coverImageUrl={profileCoverImageUrl}
                      saving={profileSaving}
                      onSectionChange={handleProfileSettingsSectionChange}
                      onFormChange={setProfileForm}
                      onSubmit={handleProfileSave}
                      onReset={resetProfileSettings}
                      onBack={() => selectTab('my_profile')}
                      onChangeProfilePhoto={() => profileImageInputRef.current?.click()}
                      onChangeCoverPhoto={() => coverImageInputRef.current?.click()}
                      onRemoveCoverPhoto={() => requestProfileImageRemoval('cover')}
                    />
                  )}
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
                <h2 className="text-2xl font-bold text-slate-900">{forumForm.id ? 'Edit post' : 'Create post'}</h2>
                <p className="text-sm text-slate-500">Share an update with the graduate community.</p>
              </div>
              <button type="button" onClick={closeForumComposer} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100" aria-label="Close post composer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-start gap-3">
              <Avatar src={authenticatedUserProfileImageUrl} label={user?.full_name} size="md" />
              <textarea
                value={forumForm.content}
                onChange={(event) => setForumForm((current) => ({ ...current, content: event.target.value }))}
                rows={7}
                maxLength={20000}
                required
                autoFocus
                aria-label="Post content"
                placeholder="Share something with the graduate community..."
                className="min-h-44 min-w-0 flex-1 resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-base leading-7 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
              />
            </div>

            {forumMediaEnabled ? (
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
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Post Media</p>
                <p className="mt-1 text-xs text-slate-500">Media uploads are currently unavailable.</p>
                {forumForm.media.length > 0 && !forumForm.remove_media && <StaticMediaPreview media={forumForm.media} />}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={forumSubmitting || aiModerating || !forumForm.content.trim()} className="inline-flex items-center gap-2 rounded-full bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
                {(forumSubmitting || aiModerating) && <Loader2 className="h-4 w-4 animate-spin" />}
                {aiModerating ? 'Checking Post...' : forumForm.id ? 'Save changes' : 'Post'}
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

            <div className="grid gap-3 border-b border-slate-100 px-6 py-5 md:grid-cols-2">
              <SummaryPill label="Published" value={publishedForumPostsCount} className="border-emerald-200 bg-emerald-50 text-emerald-700" />
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
                          {post.title && <h3 className="text-lg font-bold text-slate-900">{post.title}</h3>}
                          <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${forumStatusClass(post.status)}`}>{formatForumStatus(post.status)}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {post.category ? `${post.category} - ` : ''}Updated {formatRelativeTime(post.updated_at)}
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
          currentGraduateId={currentGraduateId}
          newCommentId={newMediaViewerCommentId}
          onClose={closeMediaViewer}
          onMove={moveMediaViewer}
          onZoomIn={() => setMediaViewerZoom((current) => Math.min(3, current + 0.25))}
          onZoomOut={() => setMediaViewerZoom((current) => Math.max(0.5, current - 0.25))}
          onZoomReset={() => setMediaViewerZoom(1)}
          onCommentDraftChange={setMediaViewerCommentDraft}
          onCommentSubmit={handleMediaViewerCommentSubmit}
          onDeleteComment={handleDeleteComment}
          onNewCommentShown={() => setNewMediaViewerCommentId(null)}
          onOpenProfile={openMiniProfile}
        />
      )}

      {profileImageViewer && (
        <ImageLightbox
          src={profileImageViewer.src}
          alt={profileImageViewer.alt}
          kind={profileImageViewer.kind}
          canManage={isViewingOwnProfile}
          saving={profileSaving}
          onClose={() => setProfileImageViewer(null)}
          onChange={() => changeProfileImageFromViewer(profileImageViewer.kind)}
          onRemove={() => requestProfileImageRemoval(profileImageViewer.kind)}
        />
      )}

      {shareJob && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 px-3 py-4 sm:px-4 sm:py-6">
          <form onSubmit={handleShareJob} className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-700 sm:px-6 sm:py-5">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-300">GradTrack Messages</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">Share Job</h2>
                <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">{shareJob.title} at {shareJob.company}</p>
              </div>
              <button type="button" onClick={closeShareJob} disabled={shareSubmitting} className="rounded-full p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800" aria-label="Close Share Job"><X className="h-5 w-5" /></button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={shareSearch} onChange={(event) => setShareSearch(event.target.value)} placeholder="Search alumni..." className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-11 py-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
              </label>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Select alumnus or graduate</p>
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {filteredShareDirectory.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-7 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">No accessible graduates match your search.</div>
                  ) : filteredShareDirectory.map((participant) => (
                    <label key={participant.graduate_id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition ${shareRecipientId === participant.graduate_id ? 'border-blue-300 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/30' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}>
                      <input type="radio" name="share_recipient" value={participant.graduate_id} checked={shareRecipientId === participant.graduate_id} onChange={() => setShareRecipientId(participant.graduate_id)} />
                      <Avatar src={resolveAssetUrl(participant.profile_image_path)} label={participant.full_name} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{participant.full_name}</span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400">{participant.program_code || 'Graduate'}{participant.year_graduated ? ` - Batch ${participant.year_graduated}` : ''}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <Field label="Optional message">
                <textarea value={shareMessage} onChange={(event) => setShareMessage(event.target.value)} maxLength={500} rows={3} placeholder="Hi, I thought you might be interested in this job." className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
              </Field>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-700 sm:flex-row sm:justify-end sm:px-6">
              <button type="button" onClick={closeShareJob} disabled={shareSubmitting} className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</button>
              <button type="submit" disabled={shareSubmitting || !shareRecipientId} className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">{shareSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />} Share Job</button>
            </div>
          </form>
        </div>
      )}

      {selectedJob && (
        <JobDetailsModal
          job={selectedJob}
          loading={selectedJobLoading}
          onClose={closeJobDetails}
          onOpenProfile={openCommunityProfile}
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
              <button type="button" onClick={closePostDetail} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100" aria-label="Close post details">
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
                    <button type="button" onClick={() => openMiniProfile(selectedPost.graduate_id)} className="flex items-center gap-3 text-left">
                      <Avatar src={resolveAssetUrl(selectedPost.author_profile_image_path)} label={selectedPost.author_name} size="md" />
                      <div>
                        <p className="font-semibold text-slate-900 transition hover:text-blue-700">{selectedPost.author_name}</p>
                        {selectedPost.category && <p className="text-xs text-slate-500">{selectedPost.category}</p>}
                      </div>
                    </button>

                    <div className="flex flex-wrap gap-2">
                      {selectedPost.graduate_id !== currentGraduateId && (
                        <>
                          {messagingAvailable && (
                            <button type="button" onClick={() => void createDirectChat(selectedPost.graduate_id)} className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                              Message Author
                            </button>
                          )}
                          <button type="button" onClick={() => openReportModal({ target_type: 'post', target_id: selectedPost.id, label: previewText(selectedPost.title || selectedPost.content, 80) })} className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100">
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
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${forumStatusClass(selectedPost.status)}`}>{formatForumStatus(selectedPost.status)}</span>
                  </div>
                </div>

                <div className="border-l border-slate-100 bg-[#fafbff]">
                  <div className="border-b border-slate-100 px-5 py-4">
                    <h3 className="text-lg font-bold text-slate-900">Comments</h3>
                    <p className="text-sm text-slate-500">Join the discussion on this post.</p>
                  </div>

                  <div ref={selectedPostCommentsContainerRef} className="max-h-[360px] space-y-4 overflow-y-auto px-5 py-5">
                    {postComments.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
                        No comments yet. Be the first to reply.
                      </div>
                    ) : (
                      postComments.map((comment) => (
                        <ForumCommentCard
                          key={comment.id}
                          comment={comment}
                          currentGraduateId={currentGraduateId}
                          highlighted={highlightedCommentId === comment.id}
                          elementRef={(element) => { commentRefs.current[comment.id] = element; }}
                          onOpenProfile={openMiniProfile}
                          onDelete={handleDeleteComment}
                          onMessage={messagingAvailable ? (graduateId) => { void createDirectChat(graduateId); } : undefined}
                          onReport={(targetComment) => openReportModal({ target_type: 'comment', target_id: targetComment.id, label: 'this comment' })}
                        />
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
          <form onSubmit={handleCreateChat} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[32px] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">New Message</h2>
                <p className="text-sm text-slate-500">
                  {chatModalMode === 'group'
                    ? 'Choose multiple graduates and give your chat a name.'
                    : 'Select a graduate to open a private conversation.'}
                </p>
              </div>
              <button type="button" onClick={() => setChatModalOpen(false)} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100" aria-label="Close chat creator">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 px-6 py-5">
              <div className="flex gap-2">
                <button type="button" onClick={() => { setChatModalMode('direct'); setChatModalName(''); setChatModalSelectedIds([]); }} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${chatModalMode === 'direct' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700'}`}>
                  Direct Message
                </button>
                <button type="button" onClick={() => { setChatModalMode('group'); setChatModalSelectedIds([]); }} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${chatModalMode === 'group' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700'}`}>
                  Group Chat
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

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Program</span>
                  <select value={chatModalProgramFilter} onChange={(event) => setChatModalProgramFilter(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-[#fafbff] px-4 py-3 text-sm outline-none transition focus:border-blue-500">
                    <option value="all">All Programs</option>
                    {chatModalProgramOptions.map((program) => (
                      <option key={program} value={program}>
                        {program}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Batch</span>
                  <select value={chatModalBatchFilter} onChange={(event) => setChatModalBatchFilter(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-[#fafbff] px-4 py-3 text-sm outline-none transition focus:border-blue-500">
                    <option value="all">All Batches</option>
                    {chatModalBatchOptions.map((year) => (
                      <option key={year} value={String(year)}>
                        Batch {year}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                {filteredDirectory.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                    No graduates match your filters.
                  </div>
                ) : (
                  filteredDirectory.map((participant) => {
                    const selected = chatModalSelectedIds.includes(participant.graduate_id);
                    const toggleParticipant = () => {
                      if (chatCreating) {
                        return;
                      }

                      if (chatModalMode === 'group') {
                        setChatModalSelectedIds((current) =>
                          current.includes(participant.graduate_id)
                            ? current.filter((id) => id !== participant.graduate_id)
                            : [...current, participant.graduate_id],
                        );
                      } else {
                        setChatModalSelectedIds([participant.graduate_id]);
                        void createDirectChat(participant.graduate_id);
                      }
                    };

                    const participantSummary = (
                      <>
                        <Avatar src={resolveAssetUrl(participant.profile_image_path)} label={participant.full_name} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-slate-900 transition group-hover:text-blue-700">{participant.full_name}</span>
                          <span className="block text-xs text-slate-500">
                            {participant.program_code || 'Graduate'}{participant.year_graduated ? ` - Batch ${participant.year_graduated}` : ''}
                          </span>
                        </span>
                      </>
                    );

                    if (chatModalMode === 'direct') {
                      return (
                        <button
                          key={participant.graduate_id}
                          type="button"
                          disabled={chatCreating}
                          onClick={toggleParticipant}
                          className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-left transition hover:border-blue-200 hover:bg-blue-50 focus-visible:border-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 disabled:cursor-wait disabled:opacity-60"
                          aria-label={`Open conversation with ${participant.full_name}`}
                        >
                          {participantSummary}
                        </button>
                      );
                    }

                    return (
                      <div key={participant.graduate_id} className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition ${selected ? 'border-blue-200 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                        <input
                          type="checkbox"
                          name="chat_participant"
                          checked={selected}
                          disabled={chatCreating}
                          onChange={toggleParticipant}
                        />
                        <button type="button" disabled={chatCreating} onClick={toggleParticipant} className="group flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-wait">
                          {participantSummary}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 px-6 py-5">
              {chatModalMode === 'direct' && (
                <span className="mr-auto inline-flex items-center gap-2 text-sm text-slate-500" aria-live="polite">
                  {chatCreating && <Loader2 className="h-4 w-4 animate-spin" />}
                  {chatCreating ? 'Opening conversation...' : 'Select a graduate to open the conversation.'}
                </span>
              )}
              <button type="button" disabled={chatCreating} onClick={() => setChatModalOpen(false)} className="rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60">
                Cancel
              </button>
              {chatModalMode === 'group' && (
                <button type="submit" disabled={chatCreating} className="inline-flex items-center gap-2 rounded-full bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
                  {chatCreating && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create Group Chat
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {(reportDetailLoading || reportDetail || reportDetailError) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6">
          <div className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">Community Moderation</p>
                <h2 className="mt-1 text-2xl font-bold text-slate-900">Report Details</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.delete('report_id');
                  setSearchParams(next, { replace: true });
                }}
                className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100"
                aria-label="Close report details"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              {reportDetailLoading && (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin" /> Loading report details...
                </div>
              )}
              {!reportDetailLoading && reportDetailError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {reportDetailError}
                </div>
              )}
              {!reportDetailLoading && reportDetail && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase text-slate-500">Your involvement</p>
                      <p className="mt-1 font-semibold text-slate-900">
                        {reportDetail.viewer_relation === 'reporter' ? 'You submitted this report' : 'You own the reported content'}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase text-slate-500">Moderation status</p>
                      <p className="mt-1 font-semibold capitalize text-slate-900">{reportDetail.status}</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">Reported {reportDetail.target_type}</p>
                    <p className="mt-1 font-semibold text-slate-900">{reportDetail.post_title || 'Forum discussion'}</p>
                    <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{reportDetail.content || 'Content unavailable'}</p>
                    <p className="mt-3 text-xs font-medium capitalize text-slate-500">Content status: {reportDetail.content_status}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-500">Reason</p>
                      <p className="mt-1 text-sm text-slate-800">{reportDetail.reason}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-500">Reviewed</p>
                      <p className="mt-1 text-sm text-slate-800">{reportDetail.reviewed_at ? formatDateTime(reportDetail.reviewed_at) : 'Pending review'}</p>
                    </div>
                  </div>
                  {reportDetail.description && (
                    <div>
                      <p className="text-xs font-semibold uppercase text-slate-500">Description</p>
                      <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{reportDetail.description}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
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

            <Field label="Report Reason">
              <select
                value={reportReason}
                onChange={(event) => setReportReason(event.target.value)}
                required
                className="mt-4 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-blue-500"
              >
                <option>Inappropriate content</option>
                <option>Harassment or bullying</option>
                <option>Spam or misleading</option>
                <option>Hate speech</option>
                <option>Privacy concern</option>
                <option>Other</option>
              </select>
            </Field>

            <Field label="Description (optional)">
              <textarea
                value={reportDescription}
                onChange={(event) => setReportDescription(event.target.value)}
                rows={5}
                maxLength={1000}
                placeholder="Add details that will help the moderator review this report"
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

      {floatingChatOpen && activeTab === 'community_forum' && (
        <FloatingChatWindow
          currentGraduateId={currentGraduateId}
          room={displayedChatRoom}
          messages={activeRoom?.id === selectedRoomId ? roomMessages : []}
          draft={chatMessageDraft}
          loading={roomLoading}
          minimized={floatingChatMinimized}
          loadingOlder={olderMessagesLoading}
          hasMoreOlder={!!messagePagination?.has_more_older}
          typingNames={activeTypingNames}
          selectedAttachment={chatSelectedAttachment}
          newMessageAvailable={chatNewMessageAvailable}
          conversationInfo={conversationInfo?.room.id === selectedRoomId ? conversationInfo : null}
          resolveAssetUrl={resolveAssetUrl}
          onMinimize={() => setFloatingChatMinimized(true)}
          onReopen={() => setFloatingChatMinimized(false)}
          onClose={() => { setFloatingChatOpen(false); setFloatingChatMinimized(false); stopChatTyping(); }}
          onOpenFull={() => { setFloatingChatOpen(false); setChatMobileConversationOpen(true); selectTab('messages'); }}
          onDraftChange={handleChatDraftInput}
          onTypingStop={() => stopChatTyping()}
          onSend={handleSendMessage}
          onRetryMessage={handleRetryMessage}
          onDeleteMessage={confirmDeleteMessage}
          onLoadOlder={loadOlderRoomMessages}
          onNearBottomChange={handleChatNearBottomChange}
          onScrollToNewest={handleScrollToNewest}
          onAttachmentSelected={handleChatAttachmentSelected}
          onRemoveAttachment={removeChatAttachment}
          onRetryAttachment={handleRetryAttachment}
          onOpenProfile={openMiniProfile}
          onViewJob={openSharedJob}
        />
      )}

      <AddGroupMembersModal
        open={addMembersOpen}
        candidates={addMemberCandidates}
        selectedIds={addMemberSelectedIds}
        search={addMemberSearch}
        loading={addMembersLoading}
        submitting={addMembersSubmitting}
        resolveAssetUrl={resolveAssetUrl}
        onSearchChange={setAddMemberSearch}
        onToggle={toggleAddMember}
        onClose={closeAddMembers}
        onSubmit={handleAddMembers}
      />

      <GraduateMiniProfile
        graduateId={miniProfileGraduateId}
        presence={miniProfileGraduateId ? chatPresenceByGraduateRef.current.get(miniProfileGraduateId) : null}
        loadProfile={loadMiniProfile}
        resolveAssetUrl={resolveAssetUrl}
        onClose={() => setMiniProfileGraduateId(null)}
        onViewProfile={(graduateId) => openCommunityProfile(graduateId)}
      />

      <MessageBox
        isOpen={msgBox.isOpen}
        onClose={() => setMsgBox((current) => ({ ...current, isOpen: false }))}
        onConfirm={msgBox.onConfirm}
        type={msgBox.type}
        title={msgBox.title}
        message={msgBox.message}
        confirmText={msgBox.confirmText}
        cancelText={msgBox.cancelText}
        destructive={msgBox.destructive}
      />
    </div>
  );
}

function ProfileWorkspace({
  user,
  profile,
  survey,
  personalFields,
  workFields,
  educationFields,
  graduateStudyFields,
  trainings,
  posts,
  profileImageUrl,
  coverImageUrl,
  defaultLogoUrl,
  jobTitle,
  canEdit,
  saving,
  messagingAvailable,
  currentGraduateId,
  forumActionKey,
  onEdit,
  onChangeProfilePhoto,
  onRemoveProfilePhoto,
  onChangeCoverPhoto,
  onRemoveCoverPhoto,
  onOpenProfileImage,
  onMessage,
  onOpenPost,
  onOpenMedia,
  onToggleLike,
  onEditPost,
  onDeletePost,
  onOpenProfile,
}: {
  user?: GraduateUser | null;
  profile?: GraduateEditableProfile | null;
  survey?: GraduateSurveyProfile | null;
  personalFields: GraduateProfileField[];
  workFields: GraduateProfileField[];
  educationFields: GraduateProfileField[];
  graduateStudyFields: GraduateProfileField[];
  trainings: GraduateTrainingEntry[];
  posts: ForumPost[];
  profileImageUrl: string;
  coverImageUrl: string;
  defaultLogoUrl: string;
  jobTitle: string;
  canEdit: boolean;
  saving: boolean;
  messagingAvailable: boolean;
  currentGraduateId: number;
  forumActionKey: string;
  onEdit: (section?: ProfileEditSection) => void;
  onChangeProfilePhoto: () => void;
  onRemoveProfilePhoto: () => void;
  onChangeCoverPhoto: () => void;
  onRemoveCoverPhoto: () => void;
  onOpenProfileImage: (src: string, alt: string, kind: 'profile' | 'cover') => void;
  onMessage: () => void;
  onOpenPost: (post: ForumPost) => void;
  onOpenMedia: (post: ForumPost, mediaIndex?: number) => void;
  onToggleLike: (postId: number) => void;
  onEditPost: (post?: ForumPost) => void;
  onDeletePost: (post: ForumPost) => void;
  onOpenProfile: (graduateId?: number | null) => void;
}) {
  const hasSupplementaryDetails = educationFields.length > 0 || graduateStudyFields.length > 0 || trainings.length > 0;

  return (
    <div className="space-y-6">
      <ProfileIdentityPanel
        user={user}
        profile={profile}
        survey={survey}
        profileImageUrl={profileImageUrl}
        coverImageUrl={coverImageUrl}
        defaultLogoUrl={defaultLogoUrl}
        jobTitle={jobTitle}
        canEdit={canEdit}
        saving={saving}
        messagingAvailable={messagingAvailable}
        currentGraduateId={currentGraduateId}
        onChangeProfilePhoto={onChangeProfilePhoto}
        onRemoveProfilePhoto={onRemoveProfilePhoto}
        onChangeCoverPhoto={onChangeCoverPhoto}
        onRemoveCoverPhoto={onRemoveCoverPhoto}
        onOpenImage={onOpenProfileImage}
        onMessage={onMessage}
      />

      <ProfileSummaryPanel
        user={user}
        profile={profile}
        survey={survey}
        personalFields={personalFields}
        workFields={workFields}
        educationFields={educationFields}
      />

      <ProfilePostsSection
        posts={posts}
        forumActionKey={forumActionKey}
        onOpenPost={onOpenPost}
        onOpenMedia={onOpenMedia}
        onToggleLike={onToggleLike}
        onEditPost={onEditPost}
        onDeletePost={onDeletePost}
        onOpenProfile={onOpenProfile}
        canManagePosts={canEdit}
      />

      {hasSupplementaryDetails && (
        <ProfileSupplementaryDetails
          user={user}
          educationFields={educationFields}
          graduateStudyFields={graduateStudyFields}
          trainings={trainings}
          canEdit={canEdit}
          onEdit={onEdit}
        />
      )}

    </div>
  );
}

function ProfileIdentityPanel({
  user,
  profile,
  survey,
  profileImageUrl,
  coverImageUrl,
  defaultLogoUrl,
  jobTitle,
  canEdit,
  saving,
  messagingAvailable,
  currentGraduateId,
  onChangeProfilePhoto,
  onRemoveProfilePhoto,
  onChangeCoverPhoto,
  onRemoveCoverPhoto,
  onOpenImage,
  onMessage,
}: {
  user?: GraduateUser | null;
  profile?: GraduateEditableProfile | null;
  survey?: GraduateSurveyProfile | null;
  profileImageUrl: string;
  coverImageUrl: string;
  defaultLogoUrl: string;
  jobTitle: string;
  canEdit: boolean;
  saving: boolean;
  messagingAvailable: boolean;
  currentGraduateId: number;
  onChangeProfilePhoto: () => void;
  onRemoveProfilePhoto: () => void;
  onChangeCoverPhoto: () => void;
  onRemoveCoverPhoto: () => void;
  onOpenImage: (src: string, alt: string, kind: 'profile' | 'cover') => void;
  onMessage: () => void;
}) {
  const fullName = getGraduateFullName(user);
  const program = user?.program_name || user?.program_code || profile?.program_course || '';
  const batch = getBatchLabel(user?.year_graduated || profile?.graduation_year);
  const location = buildProfileLocation(profile, user, survey);
  const employmentStatus = profile
    ? (profile.professional_status || '')
    : (survey?.work?.summary?.employment_status || '');
  const company = profile ? (profile.company_name || '') : (survey?.work?.summary?.company || '');
  const headline = [jobTitle || employmentStatus, company].filter(hasDisplayValue).join(' at ');
  const metaItems = [program, batch].filter(hasDisplayValue);
  const canMessage = messagingAvailable && !canEdit && !!user?.graduate_id && user.graduate_id !== currentGraduateId;
  const [profilePhotoMenuOpen, setProfilePhotoMenuOpen] = useState(false);
  const profilePhotoMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!profilePhotoMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!profilePhotoMenuRef.current?.contains(event.target as Node)) {
        setProfilePhotoMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProfilePhotoMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [profilePhotoMenuOpen]);

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="relative h-64 w-full overflow-hidden rounded-t-[28px] bg-[#071735] text-white sm:h-80 lg:h-96">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#071735_0%,#123a7a_56%,#0f172a_100%)]" />
        {coverImageUrl && (
          <button
            type="button"
            onClick={() => onOpenImage(coverImageUrl, `${fullName} profile cover`, 'cover')}
            className="absolute inset-0 z-[1] h-full w-full cursor-zoom-in"
            aria-label={`View ${fullName} cover photo`}
          >
            <SafeImage
              src={coverImageUrl}
              alt={`${fullName} profile cover`}
              className="gradtrack-media-image h-full w-full object-cover object-center"
            />
          </button>
        )}
        <div className="pointer-events-none absolute inset-0 z-[2] bg-[linear-gradient(180deg,rgba(7,23,53,0.08)_0%,rgba(7,23,53,0.22)_48%,rgba(7,23,53,0.72)_100%)]" />
        <div className="pointer-events-none absolute bottom-0 left-0 z-[3] h-2 w-full bg-[#f8c331]" />

        {!coverImageUrl && (
          <div className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-end px-8 opacity-20">
            <img src={defaultLogoUrl} alt="GradTrack" className="h-28 w-28 object-contain sm:h-36 sm:w-36" />
          </div>
        )}

        {canEdit && (
          <div className="absolute right-4 top-4 z-20 flex flex-wrap justify-end gap-2 sm:right-6 sm:top-6">
            <button type="button" onClick={onChangeCoverPhoto} disabled={saving} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-4 py-2 text-xs font-bold text-slate-800 shadow-sm backdrop-blur transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-100 dark:hover:bg-slate-700" aria-label="Change cover photo" title="Change cover photo">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              <span className="hidden sm:inline">Change Cover</span>
            </button>
            {coverImageUrl && (
              <button type="button" onClick={onRemoveCoverPhoto} disabled={saving} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-800 shadow-sm backdrop-blur transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-100 dark:hover:bg-slate-700" aria-label="Remove cover photo" title="Remove cover photo">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="relative px-4 pb-5 pt-[4.75rem] sm:px-6 sm:pb-6 lg:px-8">
        <div className="absolute -top-14 left-4 z-30 sm:-top-16 sm:left-6 lg:left-8">
          <div ref={profilePhotoMenuRef} className="relative rounded-full border-4 border-white bg-white shadow-lg">
            {canEdit ? (
              <button
                type="button"
                onClick={() => setProfilePhotoMenuOpen((current) => !current)}
                className="block rounded-full transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"
                aria-label="Open profile photo options"
                aria-haspopup="menu"
                aria-expanded={profilePhotoMenuOpen}
              >
                <Avatar src={profileImageUrl} label={fullName} size="xl" />
              </button>
            ) : profileImageUrl ? (
              <button
                type="button"
                onClick={() => onOpenImage(profileImageUrl, `${fullName} profile photo`, 'profile')}
                className="block cursor-zoom-in rounded-full"
                aria-label={`View ${fullName} profile photo`}
              >
                <Avatar src={profileImageUrl} label={fullName} size="xl" />
              </button>
            ) : (
              <Avatar src="" label={fullName} size="xl" />
            )}
            {canEdit && (
              <button type="button" onClick={() => setProfilePhotoMenuOpen((current) => !current)} disabled={saving} className="absolute bottom-1 right-1 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60" aria-label="Open profile photo options" title="Profile photo options" aria-haspopup="menu" aria-expanded={profilePhotoMenuOpen}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </button>
            )}

            {canEdit && profilePhotoMenuOpen && (
              <div role="menu" aria-label="Profile photo options" className="absolute left-0 top-full z-50 mt-3 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProfilePhotoMenuOpen(false);
                    onChangeProfilePhoto();
                  }}
                  disabled={saving}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4 text-blue-700" />}
                  {profileImageUrl ? 'Change Profile Photo' : 'Add Profile Photo'}
                </button>

                {profileImageUrl && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setProfilePhotoMenuOpen(false);
                      onRemoveProfilePhoto();
                    }}
                    disabled={saving}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold text-rose-700 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove Profile Photo
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h2 className="break-words text-2xl font-bold leading-tight text-slate-950 sm:text-3xl">{fullName}</h2>
            {metaItems.length > 0 && (
              <p className="mt-2 break-words text-sm font-semibold leading-6 text-slate-600">
                {metaItems.join(' - ')}
              </p>
            )}
            {headline && (
              <p className="mt-2 break-words text-sm font-semibold leading-6 text-blue-800">{headline}</p>
            )}
            {location && (
              <p className="mt-3 flex items-start gap-2 text-sm font-medium leading-6 text-slate-600">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>{location}</span>
              </p>
            )}
          </div>

          {canMessage && (
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <button type="button" onClick={onMessage} className="inline-flex items-center justify-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-bold text-blue-800 transition hover:bg-blue-100">
                <MessageCircle className="h-4 w-4" />
                Message
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function formatProfileValue(value?: string | number | null) {
  const text = String(value ?? '').trim();
  return text || 'Not provided';
}

function formatProfileDateValue(value?: string | null) {
  if (!value) return 'Not provided';
  return parseDate(value) ? formatDate(value) : formatProfileValue(value);
}

function ProfileSummaryPanel({
  user,
  profile,
  survey,
  personalFields,
  workFields,
  educationFields,
}: {
  user?: GraduateUser | null;
  profile?: GraduateEditableProfile | null;
  survey?: GraduateSurveyProfile | null;
  personalFields: GraduateProfileField[];
  workFields: GraduateProfileField[];
  educationFields: GraduateProfileField[];
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <ProfileContactsCard user={user} profile={profile} survey={survey} personalFields={personalFields} />
      <ProfileInformationCard user={user} profile={profile} personalFields={personalFields} educationFields={educationFields} />
      <ProfileWorkCard profile={profile} survey={survey} fields={workFields} />
    </div>
  );
}

function ProfileContactsCard({
  user,
  profile,
  survey,
  personalFields,
}: {
  user?: GraduateUser | null;
  profile?: GraduateEditableProfile | null;
  survey?: GraduateSurveyProfile | null;
  personalFields: GraduateProfileField[];
}) {
  const surveyTelephone = getProfileFieldValue(personalFields, 'telephone');
  const rows = [
    { icon: Mail, label: 'Email Address', value: user?.email },
    { icon: Phone, label: 'Phone Number', value: profile ? profile.phone_number : (user?.phone || surveyTelephone) },
    { icon: MapPin, label: 'Current Location', value: buildProfileLocation(profile, user, survey) },
  ];

  return (
    <section className="flex h-full min-w-0 flex-col rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <ProfileCardHeader icon={Contact} title="Contacts" />
      <div className="mt-5 space-y-4">
        {rows.map((row) => (
          <ProfileInfoRow key={row.label} icon={row.icon} label={row.label} value={formatProfileValue(row.value)} />
        ))}
      </div>
    </section>
  );
}

function ProfileInformationCard({
  user,
  profile,
  personalFields,
  educationFields,
}: {
  user?: GraduateUser | null;
  profile?: GraduateEditableProfile | null;
  personalFields: GraduateProfileField[];
  educationFields: GraduateProfileField[];
}) {
  const rows = [
    { icon: User, label: 'Full Name', value: getGraduateFullName(user) },
    { icon: CalendarDays, label: 'Birthday', value: formatProfileDateValue(profile ? profile.birthday : getProfileFieldValue(personalFields, 'birthday')) },
    { icon: Contact, label: 'Civil Status', value: profile ? profile.civil_status : getProfileFieldValue(personalFields, 'civil_status') },
    { icon: User, label: 'Sex / Gender', value: profile ? profile.sex_gender : getProfileFieldValue(personalFields, 'sex') },
    { icon: GraduationCap, label: 'Program / Course', value: user?.program_name || user?.program_code || getProfileFieldValue(educationFields, 'degree_program') || profile?.program_course },
    { icon: CalendarDays, label: 'Graduation Year / Batch', value: user?.year_graduated || getProfileFieldValue(educationFields, 'year_graduated') || profile?.graduation_year },
  ];

  return (
    <section className="flex h-full min-w-0 flex-col rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <ProfileCardHeader icon={User} title="Information" />
      <div className="mt-5 space-y-4">
        {rows.map((row) => (
          <ProfileInfoRow key={row.label} icon={row.icon} label={row.label} value={formatProfileValue(row.value)} />
        ))}
      </div>
    </section>
  );
}

function ProfileSupplementaryDetails({
  user,
  educationFields,
  graduateStudyFields,
  trainings,
  canEdit,
  onEdit,
}: {
  user?: GraduateUser | null;
  educationFields: GraduateProfileField[];
  graduateStudyFields: GraduateProfileField[];
  trainings: GraduateTrainingEntry[];
  canEdit: boolean;
  onEdit: (section?: ProfileEditSection) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-950">Additional Profile Details</h3>
          <p className="text-sm text-slate-500">Education and training records from existing GradTrack survey data.</p>
        </div>
        {canEdit && (
          <button type="button" onClick={() => onEdit('education')} className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            <GraduationCap className="h-4 w-4" />
            View Education
          </button>
        )}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        {(educationFields.length > 0 || graduateStudyFields.length > 0) && (
          <ProfileEducationCard user={user} fields={educationFields} graduateStudyFields={graduateStudyFields} compact />
        )}
        {trainings.length > 0 && (
          <ProfileTrainingsSection trainings={trainings.slice(0, 3)} compact />
        )}
      </div>
    </section>
  );
}

function ProfileCardHeader({
  icon: Icon,
  title,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          <Icon className="h-5 w-5" />
        </span>
        <h3 className="text-lg font-bold text-slate-950">{title}</h3>
      </div>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function ProfileWorkCard({
  profile,
  survey,
  fields,
}: {
  profile?: GraduateEditableProfile | null;
  survey?: GraduateSurveyProfile | null;
  fields: GraduateProfileField[];
}) {
  const summary = survey?.work?.summary;
  const status = profile ? profile.professional_status : (summary?.employment_status || getProfileFieldValue(fields, 'employment_status'));
  const jobTitle = profile ? profile.job_title : (summary?.current_job_title || getProfileFieldValue(fields, 'current_job_title'));
  const company = profile ? profile.company_name : (summary?.company || getProfileFieldValue(fields, 'company'));
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const isEmployed = profile
    ? (normalizedStatus.includes('not employed') || normalizedStatus.includes('unemployed')
        ? false
        : (normalizedStatus.includes('employed') || normalizedStatus.includes('freelance') ? true : null))
    : survey?.work?.is_employed;
  const rows = [
    { icon: Briefcase, label: 'Current Position / Job Title', value: jobTitle },
    { icon: Building2, label: 'Company Name', value: company },
    { icon: MapPin, label: 'Employment Location', value: profile ? profile.employment_location : (summary?.location || getProfileFieldValue(fields, 'company_location')) },
    { icon: CalendarDays, label: 'Start Date', value: formatProfileDateValue(profile ? profile.start_date : (summary?.start_date || getProfileFieldValue(fields, 'date_started'))) },
  ];
  const statusClass = isEmployed === false
    ? 'border-amber-200 bg-amber-50 text-amber-700'
    : isEmployed === true
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-slate-200 bg-slate-100 text-slate-600';

  return (
    <section className="flex h-full min-w-0 flex-col rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <ProfileCardHeader icon={Briefcase} title="Work" />
      <div className={`mt-5 inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${statusClass}`}>
        <CheckCircle2 className="h-4 w-4" />
        {formatProfileValue(status)}
      </div>

      <div className="mt-5 space-y-4">
        {rows.map((row) => (
          <ProfileInfoRow key={row.label} icon={row.icon} label={row.label} value={formatProfileValue(row.value)} />
        ))}
      </div>
    </section>
  );
}

function ProfileEducationCard({
  user,
  fields,
  graduateStudyFields,
  compact,
  onEdit,
}: {
  user?: GraduateUser | null;
  fields: GraduateProfileField[];
  graduateStudyFields: GraduateProfileField[];
  compact?: boolean;
  onEdit?: () => void;
}) {
  const degree = getProfileFieldValue(fields, 'degree_program') || user?.program_name || user?.program_code || '';
  const year = getProfileFieldValue(fields, 'year_graduated') || (user?.year_graduated ? String(user.year_graduated) : '');

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <ProfileCardHeader icon={GraduationCap} title="Education" actionLabel={onEdit ? 'View' : undefined} onAction={onEdit} />
      <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4">
        <p className="font-bold text-slate-950">Norzagaray College</p>
        {degree && <p className="mt-1 text-sm text-slate-700">{degree}</p>}
        {year && <p className="mt-3 text-sm font-semibold text-blue-700">Graduated: {year}</p>}
      </div>

      {compact && graduateStudyFields.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <GraduateStudiesSummary fields={graduateStudyFields} />
        </div>
      )}
    </section>
  );
}

function GraduateStudiesSummary({ fields }: { fields: GraduateProfileField[] }) {
  const program = getProfileFieldValue(fields, 'graduate_program');
  const institution = getProfileFieldValue(fields, 'college_university');
  const earnedUnits = getProfileFieldValue(fields, 'earned_units');
  const hasFurtherStudies = hasDisplayValue(program) || hasDisplayValue(institution);

  if (!hasFurtherStudies) {
    return null;
  }

  return (
    <div>
      <p className="text-sm font-bold text-slate-900">Further Studies</p>
      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        {institution && <p className="font-semibold text-slate-900">{institution}</p>}
        {program && <p className="mt-1 text-sm text-slate-700">{program}</p>}
        {earnedUnits && earnedUnits !== '0' && <p className="mt-2 text-xs font-semibold text-slate-500">Earned units: {earnedUnits}</p>}
      </div>
    </div>
  );
}

function ProfileTrainingsSection({
  trainings,
  compact,
  onEdit,
}: {
  trainings: GraduateTrainingEntry[];
  compact?: boolean;
  onEdit?: () => void;
}) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <ProfileCardHeader icon={Award} title="Trainings & Seminars" actionLabel={onEdit ? 'View' : undefined} onAction={onEdit} />
      {trainings.length === 0 ? (
        <ProfileEmptyState icon={Award} message="No trainings or seminars added yet." />
      ) : (
        <div className={`mt-5 grid gap-4 ${compact ? '' : 'lg:grid-cols-2'}`}>
          {trainings.map((training) => (
            <article key={training.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="font-bold text-slate-950">{training.title || 'Training / Seminar'}</h4>
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                {training.organizer && <ProfileMiniLine icon={Building2} value={training.organizer} />}
                {training.date && <ProfileMiniLine icon={CalendarDays} value={training.date} />}
              </div>
              {training.description && <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700">{training.description}</p>}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ProfilePostsSection({
  posts,
  forumActionKey,
  limit,
  canManagePosts,
  onOpenPost,
  onOpenMedia,
  onToggleLike,
  onEditPost,
  onDeletePost,
  onOpenProfile,
}: {
  posts: ForumPost[];
  forumActionKey: string;
  limit?: number;
  canManagePosts: boolean;
  onOpenPost: (post: ForumPost) => void;
  onOpenMedia: (post: ForumPost, mediaIndex?: number) => void;
  onToggleLike: (postId: number) => void;
  onEditPost: (post?: ForumPost) => void;
  onDeletePost: (post: ForumPost) => void;
  onOpenProfile: (graduateId?: number | null) => void;
}) {
  const visiblePosts = typeof limit === 'number' ? posts.slice(0, limit) : posts;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
            <MessageSquare className="h-5 w-5" />
          </span>
          <h3 className="text-lg font-bold text-slate-950">Community Forum Posts</h3>
        </div>
      </div>

      {visiblePosts.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <FileText className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-semibold text-slate-500">No community forum posts yet.</p>
        </div>
      ) : (
        visiblePosts.map((post) => (
          <ProfilePostCard
            key={post.id}
            post={post}
            actionKey={forumActionKey}
            canManage={canManagePosts}
            onOpenPost={onOpenPost}
            onOpenMedia={onOpenMedia}
            onToggleLike={onToggleLike}
            onEditPost={onEditPost}
            onDeletePost={onDeletePost}
            onOpenProfile={onOpenProfile}
          />
        ))
      )}
    </section>
  );
}

function ProfilePostCard({
  post,
  actionKey,
  canManage,
  onOpenPost,
  onOpenMedia,
  onToggleLike,
  onEditPost,
  onDeletePost,
  onOpenProfile,
}: {
  post: ForumPost;
  actionKey: string;
  canManage: boolean;
  onOpenPost: (post: ForumPost) => void;
  onOpenMedia: (post: ForumPost, mediaIndex?: number) => void;
  onToggleLike: (postId: number) => void;
  onEditPost: (post?: ForumPost) => void;
  onDeletePost: (post: ForumPost) => void;
  onOpenProfile: (graduateId?: number | null) => void;
}) {
  return (
    <article className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <button type="button" onClick={() => onOpenProfile(post.graduate_id)} className="flex min-w-0 items-center gap-3 text-left">
          <Avatar src={resolveAssetUrl(post.author_profile_image_path)} label={post.author_name} size="md" />
          <div className="min-w-0">
            <p className="font-semibold text-slate-950 transition hover:text-blue-700">{post.author_name}</p>
            <p className="truncate text-xs text-slate-500">
              {post.author_program_code || post.author_program_name || 'Graduate'} - {formatRelativeTime(post.created_at)}
            </p>
          </div>
        </button>
        <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${forumStatusClass(post.status)}`}>{formatForumStatus(post.status)}</span>
      </div>

      <button type="button" onClick={() => onOpenPost(post)} className="mt-4 block w-full text-left">
        {post.title && <h4 className="text-lg font-bold text-slate-950">{post.title}</h4>}
        <p className={`${post.title ? 'mt-2' : ''} whitespace-pre-line text-sm leading-7 text-slate-700`}>{previewText(post.content, 360)}</p>
      </button>

      <ForumMediaGrid post={post} compact onOpen={(index) => onOpenMedia(post, index)} />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" onClick={() => onToggleLike(post.id)} disabled={actionKey === `like-${post.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-rose-500 disabled:opacity-60">
            <Heart className={`h-5 w-5 ${post.is_liked ? 'fill-current text-rose-500' : 'text-slate-500'}`} />
            {post.like_count}
          </button>
          <button type="button" onClick={() => onOpenPost(post)} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-blue-700">
            <MessageCircle className="h-5 w-5 text-slate-500" />
            {post.comment_count}
          </button>
          <span className="text-xs text-slate-400">Posted {formatDateTime(post.created_at)}</span>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onEditPost(post)} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
            <button type="button" onClick={() => onDeletePost(post)} disabled={actionKey === `delete-${post.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60">
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function SurveySourceCard({ survey }: { survey?: GraduateSurveyProfile | null }) {
  const response = survey?.response;
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <ProfileCardHeader icon={FileText} title="Survey Source" />
      {response ? (
        <div className="mt-5 space-y-3">
          <ProfileInfoRow icon={FileText} label="Survey" value={response.survey_title || 'Graduate Tracer Survey'} />
          <ProfileInfoRow icon={CalendarDays} label="Submitted" value={formatDateTime(response.submitted_at)} />
        </div>
      ) : (
        <ProfileEmptyState icon={FileText} message="No submitted Graduate Tracer Survey found." />
      )}
    </section>
  );
}

function ProfileInfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-0.5 break-words text-sm font-medium text-slate-700">{value}</p>
      </div>
    </div>
  );
}

function ProfileMiniLine({
  icon: Icon,
  value,
}: {
  icon: LucideIcon;
  value: string;
}) {
  return (
    <p className="flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-slate-400" />
      <span>{value}</span>
    </p>
  );
}

function ProfileEmptyState({
  icon: Icon,
  message,
}: {
  icon: LucideIcon;
  message: string;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
      <Icon className="mx-auto h-7 w-7 text-slate-300" />
      <p className="mt-3 text-sm font-semibold text-slate-500">{message}</p>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <div className="animate-pulse rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="h-64 rounded-t-[28px] bg-slate-200 sm:h-80 lg:h-96" />
        <div className="px-6 pb-6 pt-20">
          <div className="-mt-32 h-28 w-28 rounded-full border-4 border-white bg-slate-100" />
          <div className="mt-5 h-8 max-w-sm rounded-full bg-slate-100" />
          <div className="mt-3 h-4 max-w-lg rounded-full bg-slate-100" />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-72 animate-pulse rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="h-10 w-36 rounded-full bg-slate-100" />
            <div className="mt-6 space-y-4">
              <div className="h-12 rounded-2xl bg-slate-100" />
              <div className="h-12 rounded-2xl bg-slate-100" />
              <div className="h-12 rounded-2xl bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProfileSettingsSkeleton() {
  return (
    <div className="grid animate-pulse gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="h-16 rounded-2xl bg-slate-100" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-14 rounded-2xl bg-slate-100" />
          ))}
        </div>
      </div>
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="h-7 w-48 rounded-full bg-slate-100" />
        <div className="mt-3 h-4 w-80 max-w-full rounded-full bg-slate-100" />
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-16 rounded-2xl bg-slate-100" />
          ))}
        </div>
      </div>
    </div>
  );
}

function ProfileSettingsWorkspace({
  activeSection,
  user,
  survey,
  form,
  inputClassName,
  profileImageUrl,
  coverImageUrl,
  saving,
  onSectionChange,
  onFormChange,
  onSubmit,
  onReset,
  onBack,
  onChangeProfilePhoto,
  onChangeCoverPhoto,
  onRemoveCoverPhoto,
}: {
  activeSection: ProfileEditSection;
  user?: GraduateUser | null;
  survey?: GraduateSurveyProfile | null;
  form: ProfileFormState;
  inputClassName: string;
  profileImageUrl: string;
  coverImageUrl: string;
  saving: boolean;
  onSectionChange: (section: ProfileEditSection) => void;
  onFormChange: Dispatch<SetStateAction<ProfileFormState>>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
  onBack: () => void;
  onChangeProfilePhoto: () => void;
  onChangeCoverPhoto: () => void;
  onRemoveCoverPhoto: () => void;
}) {
  const canSubmit = ['basic', 'employment', 'security'].includes(activeSection);
  const professionalStatusOptions = ['Currently Employed', 'Self-Employed', 'Freelance', 'Not Employed'];
  const activeSectionDetails = profileEditSections.find((section) => section.key === activeSection) ?? profileEditSections[0];

  return (
    <form onSubmit={onSubmit} className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar src={profileImageUrl} label={user?.full_name} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold text-slate-950">{user?.full_name || 'Graduate User'}</h2>
            <p className="mt-1 text-sm text-slate-500">Choose a category to manage your GradTrack account.</p>
          </div>
        </div>
        <button type="button" onClick={onBack} className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto">
          <ChevronLeft className="h-4 w-4" />
          Back to Profile
        </button>
      </div>

      <div className="grid items-start lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="border-b border-slate-200 bg-slate-50 p-3 sm:p-4 lg:sticky lg:top-[calc(var(--graduate-portal-header-height)_+_var(--graduate-portal-sticky-gap))] lg:border-b-0 lg:border-r">
            <p className="px-3 pb-3 pt-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Profile settings</p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-1">
              {profileEditSections.map((section) => {
                const active = activeSection === section.key;
                const SectionIcon = section.icon;
                return (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => onSectionChange(section.key)}
                    className={`flex min-w-0 items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                      active
                        ? 'border-blue-200 bg-white text-blue-800 shadow-sm ring-1 ring-blue-100'
                        : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950'
                    }`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${active ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-600'}`}>
                      <SectionIcon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold">{section.label}</span>
                      <span className={`mt-0.5 hidden truncate text-xs lg:block ${active ? 'text-blue-600' : 'text-slate-400'}`}>{section.description}</span>
                    </span>
                    <ChevronRight className={`ml-auto hidden h-4 w-4 shrink-0 lg:block ${active ? 'text-blue-600' : 'text-slate-300'}`} />
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="min-w-0">
            <div className="border-b border-slate-100 px-5 py-5 sm:px-7">
              <h3 className="text-xl font-bold text-slate-950">{activeSectionDetails.label}</h3>
              <p className="mt-1 text-sm text-slate-500">{activeSectionDetails.description}</p>
            </div>

            <div className="min-h-[32rem] px-4 py-5 sm:px-7 sm:py-6">
            {activeSection === 'basic' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
                  Changes here update your GradTrack profile only. Your submitted tracer survey remains unchanged.
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="First Name" required>
                    <input required maxLength={50} value={form.first_name} onChange={(event) => onFormChange((current) => ({ ...current, first_name: event.target.value }))} className={inputClassName} />
                  </Field>
                  <Field label="Middle Name">
                    <input maxLength={100} value={form.middle_name} onChange={(event) => onFormChange((current) => ({ ...current, middle_name: event.target.value }))} className={inputClassName} />
                  </Field>
                  <Field label="Last Name" required>
                    <input required maxLength={50} value={form.last_name} onChange={(event) => onFormChange((current) => ({ ...current, last_name: event.target.value }))} className={inputClassName} />
                  </Field>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Email Address">
                    <input type="email" value={form.email} readOnly className={`${inputClassName} cursor-not-allowed bg-slate-100 text-slate-500`} />
                  </Field>
                  <Field label="Phone Number">
                    <input inputMode="tel" maxLength={30} value={form.phone_number} onChange={(event) => onFormChange((current) => ({ ...current, phone_number: event.target.value }))} className={inputClassName} />
                  </Field>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Birthday">
                    <input type="date" value={form.birthday} onChange={(event) => onFormChange((current) => ({ ...current, birthday: event.target.value }))} className={inputClassName} />
                  </Field>
                  <Field label="Civil Status">
                    <input maxLength={50} value={form.civil_status} onChange={(event) => onFormChange((current) => ({ ...current, civil_status: event.target.value }))} className={inputClassName} />
                  </Field>
                  <Field label="Sex / Gender">
                    <input maxLength={50} value={form.sex_gender} onChange={(event) => onFormChange((current) => ({ ...current, sex_gender: event.target.value }))} className={inputClassName} />
                  </Field>
                </div>
                <Field label="Current Location">
                  <textarea maxLength={500} value={form.current_location} onChange={(event) => onFormChange((current) => ({ ...current, current_location: event.target.value }))} rows={3} className={inputClassName} />
                </Field>
              </div>
            )}

            {activeSection === 'employment' && (
              <div className="space-y-5">
                <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
                  These values are shown on My Profile and are stored separately from your tracer survey employment answers.
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Professional Status">
                    <select value={form.professional_status} onChange={(event) => onFormChange((current) => ({ ...current, professional_status: event.target.value }))} className={inputClassName}>
                      <option value="">Select status</option>
                      {form.professional_status && !professionalStatusOptions.includes(form.professional_status) && (
                        <option value={form.professional_status}>{form.professional_status}</option>
                      )}
                      {professionalStatusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </Field>
                  <Field label="Start Date">
                    <input type="date" value={form.start_date} onChange={(event) => onFormChange((current) => ({ ...current, start_date: event.target.value }))} className={inputClassName} />
                  </Field>
                  <Field label="Current Position / Job Title">
                    <input maxLength={200} value={form.job_title} onChange={(event) => onFormChange((current) => ({ ...current, job_title: event.target.value }))} className={inputClassName} />
                  </Field>
                  <Field label="Company Name">
                    <input maxLength={200} value={form.company_name} onChange={(event) => onFormChange((current) => ({ ...current, company_name: event.target.value }))} className={inputClassName} />
                  </Field>
                </div>
                <Field label="Employment Location">
                  <input maxLength={255} value={form.employment_location} onChange={(event) => onFormChange((current) => ({ ...current, employment_location: event.target.value }))} className={inputClassName} />
                </Field>
                <SurveySourceCard survey={survey} />
              </div>
            )}

            {activeSection === 'education' && (
              <div className="space-y-5">
                <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-800">
                  Education details are read-only and come from your verified graduate record. Contact the college if a correction is needed.
                </div>
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
                  <Field label="Program / Course">
                    <div className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800" aria-readonly="true">
                      {user?.program_name || user?.program_code || 'Not specified'}
                    </div>
                  </Field>
                  <Field label="Graduation Year / Batch">
                    <div className="min-h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800" aria-readonly="true">
                      {user?.year_graduated || 'Not specified'}
                    </div>
                  </Field>
                </div>
              </div>
            )}

            {activeSection === 'photo' && (
              <div className="flex flex-col items-center rounded-[28px] border border-slate-200 bg-slate-50 px-6 py-8 text-center">
                <Avatar src={profileImageUrl} label={user?.full_name} size="xl" />
                <h3 className="mt-4 text-lg font-bold text-slate-950">Profile Photo</h3>
                <button type="button" onClick={onChangeProfilePhoto} disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-full bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  Upload Photo
                </button>
              </div>
            )}

            {activeSection === 'cover' && (
              <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                <div className="aspect-[3/1] overflow-hidden rounded-2xl bg-[#081733]">
                  {coverImageUrl ? (
                    <SafeImage src={coverImageUrl} alt="Profile cover preview" logContext="cover photo preview" className="gradtrack-media-image h-full w-full object-cover object-center" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm font-semibold text-white/70">Default GradTrack cover</div>
                  )}
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button type="button" onClick={onChangeCoverPhoto} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                    Change Cover
                  </button>
                  {coverImageUrl && (
                    <button type="button" onClick={onRemoveCoverPhoto} disabled={saving} className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60">
                      <Trash2 className="h-4 w-4" />
                      Remove Cover
                    </button>
                  )}
                </div>
              </div>
            )}

            {activeSection === 'security' && (
              <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                <ProfileCardHeader icon={ShieldCheck} title="Password / Security" />
                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <ProfilePasswordInput label="Current Password" value={form.current_password} readOnly={false} inputClassName={inputClassName} onChange={(value) => onFormChange((current) => ({ ...current, current_password: value }))} />
                  <ProfilePasswordInput label="New Password" value={form.password} readOnly={false} inputClassName={inputClassName} onChange={(value) => onFormChange((current) => ({ ...current, password: value }))} />
                  <ProfilePasswordInput label="Confirm Password" value={form.confirm_password} readOnly={false} inputClassName={inputClassName} onChange={(value) => onFormChange((current) => ({ ...current, confirm_password: value }))} />
                </div>
              </div>
            )}
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 bg-white px-4 py-4 sm:px-7">
              <button type="button" onClick={canSubmit ? onReset : onBack} className="rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                {canSubmit ? 'Reset Changes' : 'Back to Profile'}
              </button>
              {canSubmit && (
                <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Changes
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
  );
}

type SafeImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src?: string | null;
  fallback?: ReactNode;
  logContext?: string;
};

function safeMediaLogReference(src: string) {
  try {
    const parsed = new URL(src, window.location.origin);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return src.split('?')[0];
  }
}

function SafeImage({ src, fallback = null, logContext = 'image', onError, ...props }: SafeImageProps) {
  const [failedSource, setFailedSource] = useState('');

  if (!src || failedSource === src) {
    return <>{fallback}</>;
  }

  return (
    <img
      {...props}
      src={src}
      onError={(event) => {
        console.warn(`GradTrack ${logContext} failed to load`, safeMediaLogReference(src));
        setFailedSource(src);
        onError?.(event);
      }}
    />
  );
}

function ImageLightbox({
  src,
  alt,
  kind,
  canManage,
  saving,
  onClose,
  onChange,
  onRemove,
}: {
  src: string;
  alt: string;
  kind: 'profile' | 'cover';
  canManage: boolean;
  saving: boolean;
  onClose: () => void;
  onChange: () => void;
  onRemove: () => void;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex cursor-zoom-out flex-col items-center justify-center gap-4 bg-black/95 p-4 sm:gap-5 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25"
        aria-label="Close image viewer"
      >
        <X className="h-6 w-6" />
      </button>
      <SafeImage
        src={src}
        alt={alt}
        logContext="full image"
        onClick={(event) => event.stopPropagation()}
        className={`gradtrack-media-image max-w-full cursor-default select-none object-contain ${canManage ? 'max-h-[calc(100vh-12rem)]' : 'max-h-full'}`}
        fallback={(
          <div className="cursor-default rounded-2xl border border-white/15 bg-white/10 px-6 py-8 text-center text-sm font-semibold text-white/80" onClick={(event) => event.stopPropagation()}>
            This image is currently unavailable.
          </div>
        )}
      />

      {canManage && (
        <div
          className="relative z-10 flex w-full max-w-xl shrink-0 flex-col gap-2 rounded-2xl border border-white/15 bg-black/70 p-3 shadow-2xl backdrop-blur sm:w-auto sm:flex-row"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={onChange}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-900 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : kind === 'profile' ? (
              <Camera className="h-4 w-4" />
            ) : (
              <ImagePlus className="h-4 w-4" />
            )}
            Change {kind === 'profile' ? 'Profile' : 'Cover'} Photo
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300/50 bg-rose-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            Remove {kind === 'profile' ? 'Profile' : 'Cover'} Photo
          </button>
        </div>
      )}
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

  return (
    <ProfileAvatar
      src={src}
      label={label}
      imageClassName={`${sizeClass} gradtrack-media-image rounded-full object-cover object-center`}
      fallbackClassName={`${sizeClass} flex items-center justify-center rounded-full bg-blue-100 font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-200`}
    />
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
    <div className={`rounded-3xl border p-4 shadow-sm sm:rounded-[28px] sm:p-5 ${toneClass}`}>
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
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:rounded-[28px] sm:p-5">
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

function JobFiltersPanel({
  options,
  locationOptions,
  locationsLoading,
  locationInputId,
  keyword,
  location,
  jobTypes,
  programFits,
  industries,
  activeFilterCount,
  onKeywordChange,
  onLocationChange,
  onJobTypesChange,
  onProgramFitsChange,
  onIndustriesChange,
  onClear,
  showHeading = true,
}: {
  options: JobFilterOptions;
  locationOptions: JobLocationOption[];
  locationsLoading: boolean;
  locationInputId: string;
  keyword: string;
  location: string;
  jobTypes: string[];
  programFits: string[];
  industries: string[];
  activeFilterCount: number;
  onKeywordChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onJobTypesChange: (value: string[]) => void;
  onProgramFitsChange: (value: string[]) => void;
  onIndustriesChange: (value: string[]) => void;
  onClear: () => void;
  showHeading?: boolean;
}) {
  const toggleValue = (values: string[], value: string, onChange: (next: string[]) => void) => {
    onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  };

  const checkboxGroup = (
    title: string,
    values: string[],
    selectedValues: string[],
    onChange: (value: string[]) => void,
    formatValue: (value: string) => string = (value) => value,
  ) => values.length > 0 && (
    <fieldset className="border-t border-slate-100 pt-4 dark:border-slate-800">
      <legend className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{title}</legend>
      <div className="mt-3 max-h-44 space-y-1 overflow-y-auto pr-1">
        {values.map((value) => (
          <label key={value} className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/70">
            <input
              type="checkbox"
              checked={selectedValues.includes(value)}
              onChange={() => toggleValue(selectedValues, value, onChange)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-700 focus:ring-blue-500"
            />
            <span className="min-w-0 break-words leading-5 [overflow-wrap:anywhere]">{formatValue(value)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <div className="space-y-4">
      {showHeading && (
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
              <SlidersHorizontal className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Filters</h2>
              <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">Refine opportunities</p>
            </div>
          </div>
          <button type="button" onClick={onClear} disabled={activeFilterCount === 0} className="mt-1 text-xs font-semibold text-blue-700 transition hover:text-blue-900 disabled:cursor-not-allowed disabled:text-slate-300 dark:text-blue-300 dark:hover:text-blue-200 dark:disabled:text-slate-600">Clear all</button>
        </div>
      )}

      <label className="block">
        <span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Keyword</span>
        <span className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={keyword} onChange={(event) => onKeywordChange(event.target.value)} placeholder="Title, company, or keyword" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:ring-blue-900" />
        </span>
      </label>

      <div className="block border-t border-slate-100 pt-4 dark:border-slate-800">
        <label htmlFor={locationInputId} className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Location</label>
        <JobLocationCombobox id={locationInputId} value={location} options={locationOptions} loading={locationsLoading} onChange={onLocationChange} placeholder="City, province, or remote" />
      </div>

      {checkboxGroup('Job Type', options.jobTypes, jobTypes, onJobTypesChange, formatEmploymentType)}
      {checkboxGroup('Program Fit', options.programFits, programFits, onProgramFitsChange)}
      {checkboxGroup('Industry', options.industries, industries, onIndustriesChange)}
    </div>
  );
}

function JobCard({
  job,
  saved,
  saving,
  highlighted = false,
  elementRef,
  onOpenProfile,
  onToggleSave,
  onShare,
  onViewDetails,
}: {
  job: JobPost;
  saved: boolean;
  saving: boolean;
  highlighted?: boolean;
  elementRef?: (element: HTMLElement | null) => void;
  onOpenProfile: (graduateId: number) => void;
  onToggleSave: (job: JobPost) => void | Promise<void>;
  onShare: (job: JobPost) => void;
  onViewDetails: (job: JobPost) => void | Promise<void>;
}) {
  const posterName = getJobPosterName(job);
  const posterProgram = getJobPosterProgram(job);
  const officialPost = Boolean(job.created_by_admin_id || job.creator_role);
  const hasApplicationDetails = Boolean(job.contact_email || job.application_link || job.application_method || job.requirements_file_path);
  const externalApplication = Boolean(normalizeApplicationLink(job.application_link));
  const deadlinePassed = isJobDeadlinePast(job.application_deadline);
  const detailItems = [
    ...(job.location ? [{ icon: MapPin, label: 'Location', value: job.location }] : []),
    ...(job.salary_range ? [{ icon: Banknote, label: 'Salary', value: job.salary_range }] : []),
    ...(job.industry ? [{ icon: Building2, label: 'Industry', value: job.industry }] : []),
    ...(job.course_program_fit ? [{ icon: GraduationCap, label: 'Program Fit', value: job.course_program_fit }] : []),
  ];

  return (
    <article
      ref={elementRef}
      className={`group min-w-0 overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition duration-200 hover:border-blue-200 hover:shadow-md dark:bg-slate-900 sm:p-5 ${highlighted ? 'border-blue-300 ring-2 ring-blue-100 dark:border-blue-500 dark:ring-blue-500/20' : 'border-slate-200 dark:border-slate-700 dark:hover:border-blue-500/50'}`}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <button type="button" onClick={() => job.poster_graduate_id && onOpenProfile(job.poster_graduate_id)} disabled={!job.poster_graduate_id} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left disabled:cursor-default">
          <span className="shrink-0 rounded-full ring-2 ring-white shadow-sm dark:ring-slate-800">
            <Avatar src={resolveAssetUrl(job.poster_profile_image_path)} label={posterName} size="md" />
          </span>
          <span className="min-w-0">
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="max-w-full truncate text-sm font-bold text-slate-900 transition group-hover:text-blue-800 dark:text-slate-100 dark:group-hover:text-blue-300 sm:text-[15px]">{posterName}</span>
              {officialPost && (
                <span title="Official GradTrack personnel" className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-blue-700 dark:text-blue-300">
                  <BadgeCheck className="h-4 w-4 fill-blue-600 text-white drop-shadow-sm dark:fill-blue-500" aria-hidden="true" />
                  Official
                </span>
              )}
            </span>
            <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">{posterProgram} <span aria-hidden="true">&bull;</span> {getJobPostedLabel(job)}</span>
          </span>
        </button>
        <span className="max-w-[42%] shrink-0 break-words rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-center text-[11px] font-bold leading-4 text-blue-700 dark:border-blue-500/30 dark:bg-blue-950/30 dark:text-blue-200">{formatEmploymentType(job.job_type)}</span>
      </div>

      <div className="mt-4 min-w-0">
        <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-600 dark:border-blue-500/30 dark:bg-blue-950/40 dark:text-blue-300"><Building2 className="h-4 w-4" /></span>
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">{job.company || 'Company not specified'}</span>
        </p>
        <h3 className="mt-2 overflow-hidden break-words text-lg font-bold leading-snug tracking-tight text-slate-950 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [overflow-wrap:anywhere] dark:text-white sm:text-xl">{job.title}</h3>
      </div>

      <p className="mt-2.5 overflow-hidden whitespace-pre-line break-words text-sm leading-6 text-slate-600 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [overflow-wrap:anywhere] dark:text-slate-300">{job.description || 'No description provided yet.'}</p>

      {detailItems.length > 0 && <div className="mt-3.5 flex min-w-0 flex-wrap gap-2">{detailItems.map((item) => <JobInfoChip key={`${job.id}-${item.label}`} icon={item.icon} label={item.label} value={item.value} />)}</div>}

      {hasApplicationDetails && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <FileText className="h-3.5 w-3.5 text-blue-600 dark:text-blue-300" />
          {externalApplication ? 'External application' : 'Application details available'}
        </p>
      )}

      <div className="mt-4 flex min-w-0 flex-col gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
        <div className={`flex min-w-0 items-center gap-2 text-xs font-semibold ${deadlinePassed ? 'text-rose-600 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400'}`}>
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${deadlinePassed ? 'bg-rose-50 dark:bg-rose-950/40' : 'bg-slate-50 dark:bg-slate-800'}`}><CalendarDays className="h-4 w-4" /></span>
          <span className="min-w-0 break-words">{job.application_deadline ? `Deadline: ${formatDate(job.application_deadline)}` : 'No deadline specified'}</span>
          {deadlinePassed && <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase dark:bg-rose-950/40">Closed</span>}
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end lg:shrink-0">
          <button type="button" onClick={() => void onToggleSave(job)} disabled={saving} aria-pressed={saved} aria-label={`${saved ? 'Remove' : 'Save'} ${job.title} ${saved ? 'from' : 'to'} Saved Jobs`} className={`inline-flex h-11 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border px-3 text-sm font-semibold transition duration-200 disabled:cursor-wait disabled:opacity-60 ${saved ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-500/40 dark:bg-blue-950/30 dark:text-blue-200' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'}`}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className={`h-4 w-4 transition-transform duration-200 ${saved ? 'fill-current' : ''}`} />}{saved ? 'Saved' : 'Save'}
          </button>
          <button type="button" onClick={() => onShare(job)} aria-label={`Share ${job.title}`} className="inline-flex h-11 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"><Share2 className="h-4 w-4" /> Share</button>
          <button type="button" onClick={() => void onViewDetails(job)} className="col-span-2 inline-flex h-11 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 focus-visible:ring-2 focus-visible:ring-blue-300 sm:col-auto">View Details <ArrowRight className="h-4 w-4" /></button>
        </div>
      </div>
    </article>
  );
}

function JobCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-5" aria-hidden="true">
      <div className="flex items-center gap-3"><div className="h-11 w-11 rounded-full bg-slate-200 dark:bg-slate-700" /><div className="flex-1 space-y-2"><div className="h-3 w-32 rounded bg-slate-200 dark:bg-slate-700" /><div className="h-2.5 w-24 rounded bg-slate-100 dark:bg-slate-800" /></div><div className="h-6 w-20 rounded-full bg-blue-100 dark:bg-blue-950" /></div>
      <div className="mt-4 h-8 w-44 rounded-lg bg-slate-100 dark:bg-slate-800" /><div className="mt-2.5 h-6 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
      <div className="mt-3 space-y-2"><div className="h-3 w-full rounded bg-slate-100 dark:bg-slate-800" /><div className="h-3 w-4/5 rounded bg-slate-100 dark:bg-slate-800" /></div>
      <div className="mt-4 flex flex-wrap gap-2"><div className="h-8 w-36 rounded-full bg-blue-50 dark:bg-blue-950/40" /><div className="h-8 w-40 rounded-full bg-blue-50 dark:bg-blue-950/40" /><div className="h-8 w-28 rounded-full bg-blue-50 dark:bg-blue-950/40" /></div>
      <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"><div className="h-9 w-40 rounded-lg bg-slate-100 dark:bg-slate-800" /><div className="flex gap-2"><div className="h-10 w-20 rounded-xl bg-slate-100 dark:bg-slate-800" /><div className="h-10 w-20 rounded-xl bg-slate-100 dark:bg-slate-800" /><div className="h-10 w-32 rounded-xl bg-blue-100 dark:bg-blue-950" /></div></div>
    </div>
  );
}

function JobResultsSkeleton() {
  return <div className="grid min-w-0 grid-cols-1 gap-4" aria-label="Loading job opportunities"><JobCardSkeleton /><JobCardSkeleton /><JobCardSkeleton /></div>;
}

function JobsPageSkeleton() {
  return (
    <section className="min-w-0 space-y-5 animate-pulse" aria-label="Loading Browse Jobs">
      <div className="flex min-h-[140px] items-center rounded-[28px] border border-blue-100 bg-blue-950 px-5 sm:min-h-[160px] sm:px-8"><div className="space-y-3"><div className="h-3 w-36 rounded bg-blue-700" /><div className="h-8 w-48 rounded bg-blue-800" /><div className="h-4 w-80 max-w-[70vw] rounded bg-blue-800" /></div></div>
      <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[264px_minmax(0,1fr)]"><div className="hidden h-96 rounded-2xl border border-slate-200 bg-white md:block" /><div><div className="mb-4 h-20 rounded-2xl border border-slate-200 bg-white" /><JobResultsSkeleton /></div></div>
    </section>
  );
}

function JobInfoChip({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="inline-flex min-w-0 max-w-full items-start gap-1.5 rounded-2xl border border-slate-200 bg-[#f8fbff] px-2.5 py-1.5 text-xs leading-5 text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-300" />
      <span className="shrink-0 font-semibold text-slate-500 dark:text-slate-400">{label}:</span>
      <span className="min-w-0 break-words font-medium text-slate-700 [overflow-wrap:anywhere] dark:text-slate-200">{value}</span>
    </div>
  );
}

function JobDetailsModal({
  job,
  loading,
  onClose,
  onOpenProfile,
}: {
  job: JobPost;
  loading: boolean;
  onClose: () => void;
  onOpenProfile: (graduateId: number) => void;
}) {
  const posterName = getJobPosterName(job);
  const applicationLink = normalizeApplicationLink(job.application_link);
  const requirementsLink = resolveAssetUrl(job.requirements_file_path);
  const hasApplyDetails = Boolean(job.contact_email || applicationLink || job.application_method || requirementsLink);

  const detailItems = [
    { icon: Building2, label: 'Company', value: job.company || 'Not specified' },
    { icon: Briefcase, label: 'Type', value: formatEmploymentType(job.job_type) },
    { icon: MapPin, label: 'Location', value: job.location || 'Not specified' },
    { icon: GraduationCap, label: 'Program Fit', value: getJobProgramFit(job) },
    { icon: Building2, label: 'Industry', value: job.industry || 'Not specified' },
    { icon: Briefcase, label: 'Salary', value: job.salary_range || 'Not specified' },
    { icon: CalendarDays, label: 'Deadline', value: job.application_deadline ? formatDate(job.application_deadline) : 'Not specified' },
    { icon: Clock3, label: 'Posted', value: job.created_at ? formatDateTime(job.created_at) : 'Not specified' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-3 py-4 sm:px-4 sm:py-6">
      <div className="flex max-h-[92vh] w-full max-w-4xl min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl sm:rounded-[32px] dark:border-slate-700 dark:bg-slate-900">
        <div className="flex min-w-0 flex-col items-start gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:justify-between sm:px-6 sm:py-5 dark:border-slate-700">
          <button
            type="button"
            onClick={() => job.poster_graduate_id && onOpenProfile(job.poster_graduate_id)}
            disabled={!job.poster_graduate_id}
            className="flex w-full min-w-0 items-center gap-3 pr-10 text-left sm:w-auto sm:flex-1 sm:pr-0"
          >
            <Avatar src={resolveAssetUrl(job.poster_profile_image_path)} label={posterName} size="md" />
            <span className="min-w-0">
              <span className="block break-words text-sm font-semibold text-slate-900 transition [overflow-wrap:anywhere] hover:text-blue-700 dark:text-slate-100 dark:hover:text-blue-300 sm:truncate">{posterName}</span>
              <span className="block break-words text-xs text-slate-500 [overflow-wrap:anywhere] dark:text-slate-400">
                {getJobPosterProgram(job)} - {getJobPostedLabel(job)}
              </span>
            </span>
          </button>

          <div className="flex max-w-full shrink-0 items-center gap-2">
            <span className="max-w-full break-words rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-700 [overflow-wrap:anywhere] dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200">
              {formatEmploymentType(job.job_type)}
            </span>
            <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200" aria-label="Close job details">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {loading && (
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading complete job details...
            </div>
          )}

          <div className="min-w-0">
            <p className="flex min-w-0 items-start gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-500 dark:text-blue-300" />
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">{job.company || 'Company not specified'}</span>
            </p>
            <h2 className="mt-2 break-words text-xl font-bold leading-tight text-slate-950 [overflow-wrap:anywhere] sm:text-3xl dark:text-slate-50">{job.title || 'Job Post'}</h2>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {detailItems.map((item) => (
              <JobInfoChip key={`modal-${item.label}`} icon={item.icon} label={item.label} value={item.value} />
            ))}
          </div>

          <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-5">
              <section>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Description</h3>
                <p className="mt-2 whitespace-pre-line break-words text-sm leading-7 text-slate-700 [overflow-wrap:anywhere] dark:text-slate-300">{job.description || 'No description provided yet.'}</p>
              </section>

              {hasDisplayValue(job.qualifications) && (
                <section>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Qualifications</h3>
                  <p className="mt-2 whitespace-pre-line break-words text-sm leading-7 text-slate-700 [overflow-wrap:anywhere] dark:text-slate-300">{job.qualifications}</p>
                </section>
              )}

              {hasDisplayValue(job.required_skills) && (
                <section>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Required Skills</h3>
                  <p className="mt-2 whitespace-pre-line break-words text-sm leading-7 text-slate-700 [overflow-wrap:anywhere] dark:text-slate-300">{job.required_skills}</p>
                </section>
              )}
            </div>

            <aside className="space-y-4 rounded-[24px] border border-slate-200 bg-[#fafbff] p-4 dark:border-slate-700 dark:bg-slate-950/60">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">How to Apply</h3>
                {hasApplyDetails ? (
                  <div className="mt-3 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                    {job.contact_email && (
                      <a href={`mailto:${job.contact_email}`} className="flex min-w-0 items-start gap-2 font-medium text-blue-700 hover:underline dark:text-blue-300">
                        <Mail className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 break-all">{job.contact_email}</span>
                      </a>
                    )}
                    {applicationLink && (
                      <a href={applicationLink} target="_blank" rel="noreferrer" className="flex min-w-0 items-start gap-2 font-medium text-blue-700 hover:underline dark:text-blue-300">
                        <FileText className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 break-words [overflow-wrap:anywhere]">Open application link</span>
                      </a>
                    )}
                    {requirementsLink && (
                      <a href={requirementsLink} target="_blank" rel="noreferrer" className="flex min-w-0 items-start gap-2 font-medium text-blue-700 hover:underline dark:text-blue-300">
                        <FileText className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 break-words [overflow-wrap:anywhere]">{job.requirements_file_name || 'Requirements file'}</span>
                      </a>
                    )}
                    {job.application_method && <p className="whitespace-pre-line break-words leading-6 [overflow-wrap:anywhere]">{job.application_method}</p>}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Application details are not specified.</p>
                )}
              </div>

              <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Posted By</p>
                <button
                  type="button"
                  onClick={() => job.poster_graduate_id && onOpenProfile(job.poster_graduate_id)}
                  disabled={!job.poster_graduate_id}
                  className="mt-3 flex min-w-0 items-center gap-3 text-left"
                >
                  <Avatar src={resolveAssetUrl(job.poster_profile_image_path)} label={posterName} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900 transition hover:text-blue-700 dark:text-slate-100 dark:hover:text-blue-300">{posterName}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{getJobPosterProgram(job)}</span>
                  </span>
                </button>
              </div>
            </aside>
          </div>
        </div>
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
  const singleMediaMaxHeight = compact ? 'max-h-[32rem]' : 'max-h-[min(70vh,42rem)]';
  const wrapperClass = single
    ? `${detail ? 'mt-6' : 'mt-4'} overflow-hidden rounded-lg border border-slate-200 bg-slate-950`
    : `${detail ? 'mt-6' : 'mt-4'} grid grid-cols-2 gap-1 overflow-hidden rounded-lg border border-slate-200 bg-slate-200`;

  return (
    <div className={wrapperClass}>
      {visibleMedia.map((item, index) => (
        <button
          key={`${item.file_path}-${index}`}
          type="button"
          onClick={() => onOpen(index)}
          className={`group relative flex w-full items-center justify-center overflow-hidden bg-slate-950 text-left ${single ? '' : 'aspect-square'}`}
          aria-label={`Open ${item.original_name || post.title || 'forum media'}`}
        >
          {isVideoMedia(item) ? (
            <>
              <video
                src={resolveAssetUrl(item.file_path)}
                muted
                playsInline
                preload="metadata"
                className={single
                  ? `block h-auto w-auto max-w-full ${singleMediaMaxHeight} object-contain`
                  : 'block h-auto w-auto max-h-full max-w-full object-contain'}
              />
              <span className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-black/55">
                  <Video className="h-5 w-5" />
                </span>
              </span>
            </>
          ) : (
            <SafeImage
              src={resolveAssetUrl(item.file_path)}
              alt={item.original_name || post.title || 'Forum media'}
              logContext="forum image preview"
              className={single
                ? `gradtrack-media-image block h-auto w-auto max-w-full ${singleMediaMaxHeight} object-contain`
                : 'gradtrack-media-image block h-auto w-auto max-h-full max-w-full object-contain'}
              fallback={(
                <span className="flex h-full min-h-40 w-full flex-col items-center justify-center gap-2 bg-slate-100 px-4 text-center text-sm font-semibold text-slate-500">
                  <ImagePlus className="h-6 w-6 text-slate-400" />
                  Image unavailable
                </span>
              )}
            />
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
          <div className="flex aspect-video items-center justify-center bg-slate-950">
            {isVideoFile(preview.file) ? (
              <video src={preview.url} muted playsInline preload="metadata" className="h-full w-full object-contain" />
            ) : (
              <SafeImage src={preview.url} alt={preview.file.name} logContext="selected forum image preview" className="gradtrack-media-image block h-auto w-auto max-h-full max-w-full object-contain" />
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
          <div className="flex aspect-video items-center justify-center bg-slate-950">
            {isVideoMedia(item) ? (
              <video src={resolveAssetUrl(item.file_path)} muted playsInline preload="metadata" className="h-full w-full object-contain" />
            ) : (
              <SafeImage src={resolveAssetUrl(item.file_path)} alt={item.original_name || 'Forum attachment'} logContext="forum attachment preview" className="gradtrack-media-image block h-auto w-auto max-h-full max-w-full object-contain" />
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

function ForumCommentCard({
  comment,
  currentGraduateId,
  highlighted = false,
  compact = false,
  elementRef,
  onOpenProfile,
  onDelete,
  onMessage,
  onReport,
}: {
  comment: ForumComment;
  currentGraduateId: number;
  highlighted?: boolean;
  compact?: boolean;
  elementRef?: (element: HTMLElement | null) => void;
  onOpenProfile: (graduateId: number) => void;
  onDelete: (comment: ForumComment) => void;
  onMessage?: (graduateId: number) => void;
  onReport?: (comment: ForumComment) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isMine = comment.graduate_id === currentGraduateId;

  return (
    <article
      ref={elementRef}
      className={`relative border transition ${compact ? 'rounded-lg px-4 py-3' : 'rounded-[24px] p-4'} ${
        highlighted ? 'border-blue-300 bg-blue-50 shadow-md' : 'border-slate-200 bg-white shadow-sm'
      }`}
    >
      {isMine && (
        <div className="absolute right-2 top-2 z-10">
          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label="Comment options"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 top-9 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(comment);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-rose-700 hover:bg-rose-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Comment
              </button>
            </div>
          )}
        </div>
      )}

      <div className={`flex items-start gap-3 ${isMine ? 'pr-8' : ''}`}>
        <button type="button" onClick={() => onOpenProfile(comment.graduate_id)} className="shrink-0" aria-label={`Open ${comment.commenter_name} profile`}>
          <Avatar src={resolveAssetUrl(comment.commenter_profile_image_path)} label={comment.commenter_name} size="sm" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onOpenProfile(comment.graduate_id)} className="text-left text-sm font-semibold text-slate-900 transition hover:text-blue-700">
              {comment.commenter_name}
            </button>
            <span className="text-xs text-slate-400">{formatRelativeTime(comment.created_at)}</span>
          </div>
          <p className="text-xs text-slate-500">{comment.commenter_program_code || comment.commenter_program_name || 'Graduate'}</p>
          <p className={`mt-2 whitespace-pre-line text-sm text-slate-700 ${compact ? 'leading-6' : 'leading-7'}`}>{comment.comment}</p>
          {!isMine && (onMessage || onReport) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {onMessage && (
                <button type="button" onClick={() => onMessage(comment.graduate_id)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Message
                </button>
              )}
              {onReport && (
                <button type="button" onClick={() => onReport(comment)} className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100">
                  <Flag className="h-3.5 w-3.5" />
                  Report
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function ForumMediaViewer({
  viewer,
  zoom,
  comments,
  commentsLoading,
  commentDraft,
  commentSubmitting,
  currentGraduateId,
  newCommentId,
  onClose,
  onMove,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onCommentDraftChange,
  onCommentSubmit,
  onDeleteComment,
  onNewCommentShown,
  onOpenProfile,
}: {
  viewer: { post: ForumPost; mediaIndex: number };
  zoom: number;
  comments: ForumComment[];
  commentsLoading: boolean;
  commentDraft: string;
  commentSubmitting: boolean;
  currentGraduateId: number;
  newCommentId: number | null;
  onClose: () => void;
  onMove: (direction: 1 | -1) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onCommentDraftChange: (value: string) => void;
  onCommentSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDeleteComment: (comment: ForumComment) => void;
  onNewCommentShown: () => void;
  onOpenProfile: (graduateId?: number | null) => void;
}) {
  const commentsContainerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!newCommentId || !comments.some((comment) => comment.id === newCommentId)) return;
    const frame = window.requestAnimationFrame(() => {
      const container = commentsContainerRef.current;
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
      }
      onNewCommentShown();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [comments, newCommentId, onNewCommentShown]);

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

      <div className="grid h-full grid-rows-[minmax(220px,52vh)_minmax(0,1fr)] overflow-hidden lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-1">
        <div className="relative flex min-h-0 cursor-zoom-out items-center justify-center overflow-hidden px-3 pb-3 pt-16 lg:px-4 lg:py-20" onClick={onClose}>
          {canMove && (
            <>
              <button type="button" onClick={(event) => { event.stopPropagation(); onMove(-1); }} className="absolute left-4 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 backdrop-blur transition hover:bg-white/20" aria-label="Previous media">
                <ChevronLeft className="h-7 w-7" />
              </button>
              <button type="button" onClick={(event) => { event.stopPropagation(); onMove(1); }} className="absolute right-4 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 backdrop-blur transition hover:bg-white/20" aria-label="Next media">
                <ChevronRight className="h-7 w-7" />
              </button>
            </>
          )}

          {isVideo ? (
            <video src={resolveAssetUrl(current.file_path)} controls autoPlay className="max-h-full max-w-full cursor-default rounded-lg bg-black object-contain" onClick={(event) => event.stopPropagation()} />
          ) : (
            <SafeImage
              src={resolveAssetUrl(current.file_path)}
              alt={current.original_name || viewer.post.title || 'Forum media'}
              logContext="full forum image"
              className="gradtrack-media-image max-h-full max-w-full cursor-default select-none rounded-lg object-contain transition-transform duration-150"
              style={{ transform: `scale(${zoom})` }}
              onClick={(event) => event.stopPropagation()}
              fallback={(
                <div className="cursor-default rounded-2xl border border-white/15 bg-white/10 px-6 py-8 text-center text-sm font-semibold text-white/80" onClick={(event) => event.stopPropagation()}>
                  This image is currently unavailable.
                </div>
              )}
            />
          )}
        </div>

        <aside className="flex min-h-0 flex-col border-t border-white/10 bg-white text-slate-900 lg:border-l lg:border-t-0">
          <div className="border-b border-slate-200 px-5 py-5">
            <button type="button" onClick={() => onOpenProfile(viewer.post.graduate_id)} className="text-left text-sm font-semibold text-slate-900 transition hover:text-blue-700">
              {viewer.post.author_name}
            </button>
            <p className="mt-1 text-xs text-slate-500">{viewer.post.author_program_code || viewer.post.author_program_name || 'Graduate'} - {formatDateTime(viewer.post.created_at)}</p>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-5">
            {viewer.post.title && <h2 className="text-lg font-bold text-slate-900">{viewer.post.title}</h2>}
            <p className={`${viewer.post.title ? 'mt-3' : ''} whitespace-pre-line text-sm leading-7 text-slate-700`}>{viewer.post.content}</p>
            {isVideo && (
              <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="truncate text-sm font-semibold text-slate-800">{current.original_name || 'Forum video'}</p>
                <p className="mt-1 text-xs text-slate-500">Video {formatBytes(current.file_size_bytes)}</p>
              </div>
            )}
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
                      <SafeImage src={resolveAssetUrl(item.file_path)} alt={item.original_name || `Attachment ${index + 1}`} logContext="forum image thumbnail" className="gradtrack-media-image h-full w-full object-cover" />
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

              <div ref={commentsContainerRef} className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
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
                    <ForumCommentCard
                      key={comment.id}
                      comment={comment}
                      currentGraduateId={currentGraduateId}
                      compact
                      onOpenProfile={(graduateId) => onOpenProfile(graduateId)}
                      onDelete={onDeleteComment}
                    />
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
