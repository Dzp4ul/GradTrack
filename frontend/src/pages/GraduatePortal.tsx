import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, Dispatch, ImgHTMLAttributes, SetStateAction } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Award,
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
  Flag,
  GraduationCap,
  Heart,
  ImagePlus,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Maximize2,
  Megaphone,
  Menu,
  MessageCircle,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  User,
  Users,
  Video,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Socket } from 'socket.io-client';
import { API_BASE_URL, API_ENDPOINTS } from '../config/api';
import RealtimeMessagingWorkspace, {
  ImagePreviewModal as ChatImagePreviewModal,
  MessageComposer,
  MessageList,
  PresenceText,
} from '../components/messaging/RealtimeMessagingWorkspace';
import type {
  MessageAttachment,
  MessagePagination,
  MessagingMessage,
  MessagingParticipant,
  MessagingRoom,
  SelectedAttachment,
} from '../components/messaging/types';
import MessageBox from '../components/MessageBox';
import FeatureUnavailable from '../components/FeatureUnavailable';
import NotificationBell from '../components/NotificationBell';
import ThemeToggle from '../components/ThemeToggle';
import GraduateAnnouncements from '../components/graduate/GraduateAnnouncements';
import { useGraduateAuth } from '../contexts/GraduateAuthContext';
import type { GraduateUser } from '../contexts/GraduateAuthContext';
import { useSystemSettings } from '../contexts/SystemSettingsContext';
import { destroyRealtimeChatSocket, emitWithAck, getRealtimeChatSocket } from '../services/realtimeChat';
import type { RealtimeChatStatus } from '../services/realtimeChat';

type PortalTab = 'announcements' | 'dashboard' | 'community_forum' | 'messages' | 'group_chats' | 'jobs' | 'job_posting' | 'my_profile';
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

interface ReportTarget {
  target_type: 'post' | 'comment';
  target_id: number;
  label: string;
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
  onConfirm?: () => void;
}

const portalTabs: PortalTab[] = ['announcements', 'dashboard', 'community_forum', 'messages', 'group_chats', 'jobs', 'job_posting', 'my_profile'];
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
const profileEditSections: Array<{ key: ProfileEditSection; label: string; icon: LucideIcon }> = [
  { key: 'basic', label: 'Basic Profile', icon: Contact },
  { key: 'employment', label: 'Employment', icon: Briefcase },
  { key: 'education', label: 'Education', icon: GraduationCap },
  { key: 'photo', label: 'Profile Photo', icon: Camera },
  { key: 'cover', label: 'Cover Photo', icon: ImagePlus },
  { key: 'security', label: 'Security', icon: ShieldCheck },
];

function getPortalTab(rawValue: string | null): PortalTab {
  if (rawValue && portalTabs.includes(rawValue as PortalTab)) {
    return rawValue as PortalTab;
  }
  return 'announcements';
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

const chatAttachmentAccept = '.jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.pptx,.txt,.csv';
const chatImageMaxBytes = 10 * 1024 * 1024;
const chatDocumentMaxBytes = 25 * 1024 * 1024;
const chatImageExtensions = ['jpg', 'jpeg', 'png', 'webp'];
const chatDocumentExtensions = ['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'csv'];
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
  return job.poster_program_code || job.poster_program_name || 'Graduate';
}

function getJobProgramFit(job: JobPost) {
  return job.course_program_fit || job.poster_program_code || job.poster_program_name || 'Open to eligible graduates';
}

function getJobPostedLabel(job: JobPost) {
  return job.created_at ? `Posted ${formatRelativeTime(job.created_at)}` : 'Recently posted';
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileDetails, setProfileDetails] = useState<GraduateProfilePayload | null>(null);
  const [profileDetailsLoaded, setProfileDetailsLoaded] = useState(false);
  const [profileDetailsLoading, setProfileDetailsLoading] = useState(false);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [profileEditSection, setProfileEditSection] = useState<ProfileEditSection>('basic');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState('');
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
  const [highlightedCommentId, setHighlightedCommentId] = useState<number | null>(null);
  const [mediaViewer, setMediaViewer] = useState<{ post: ForumPost; mediaIndex: number } | null>(null);
  const [mediaViewerZoom, setMediaViewerZoom] = useState(1);
  const [mediaViewerComments, setMediaViewerComments] = useState<ForumComment[]>([]);
  const [mediaViewerCommentsLoading, setMediaViewerCommentsLoading] = useState(false);
  const [mediaViewerCommentDraft, setMediaViewerCommentDraft] = useState('');
  const [mediaViewerCommentSubmitting, setMediaViewerCommentSubmitting] = useState(false);
  const [profileImageViewer, setProfileImageViewer] = useState<{ src: string; alt: string } | null>(null);
  const [postComments, setPostComments] = useState<ForumComment[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [myPostedJobs, setMyPostedJobs] = useState<JobPost[]>([]);
  const [jobSearch, setJobSearch] = useState('');
  const [highlightedJobId, setHighlightedJobId] = useState<number | null>(null);
  const [selectedJob, setSelectedJob] = useState<JobPost | null>(null);
  const [selectedJobLoading, setSelectedJobLoading] = useState(false);
  const [showJobPostForm, setShowJobPostForm] = useState(false);
  const [jobSubmitting, setJobSubmitting] = useState(false);
  const [myJobForm, setMyJobForm] = useState<JobForm>(() => createDefaultJobForm(user));

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [directory, setDirectory] = useState<ChatParticipant[]>([]);
  const [chatSearch, setChatSearch] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [activeRoom, setActiveRoom] = useState<ChatRoom | null>(null);
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
  const [forumChatWindowOpen, setForumChatWindowOpen] = useState(false);
  const [chatPreviewAttachment, setChatPreviewAttachment] = useState<MessageAttachment | null>(null);
  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [chatModalMode, setChatModalMode] = useState<'direct' | 'group'>('direct');
  const [chatModalName, setChatModalName] = useState('');
  const [chatModalSelectedIds, setChatModalSelectedIds] = useState<number[]>([]);
  const [chatModalSearch, setChatModalSearch] = useState('');
  const [chatModalProgramFilter, setChatModalProgramFilter] = useState('all');
  const [chatModalBatchFilter, setChatModalBatchFilter] = useState('all');
  const [chatCreating, setChatCreating] = useState(false);

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
  const chatJoinedRoomIdRef = useRef<number | null>(null);
  const selectedRoomIdRef = useRef<number | null>(null);
  const previousSelectedRoomIdRef = useRef<number | null>(null);
  const roomMessagesRef = useRef<ChatMessage[]>([]);
  const chatPresenceByGraduateRef = useRef<Map<number, ChatPresenceStatus>>(new Map());
  const retryAttachmentsRef = useRef<Record<string, SelectedAttachment>>({});
  const chatSelectedAttachmentRef = useRef<SelectedAttachment | null>(null);
  const chatTypingExpiryTimeoutsRef = useRef<Map<string, number>>(new Map());
  const roomLoadRequestRef = useRef(0);
  const loadMissedRoomMessagesRef = useRef<(roomId: number) => Promise<void>>(async () => undefined);
  const markVisibleMessagesAsReadRef = useRef<(roomId?: number, messages?: ChatMessage[]) => Promise<void>>(async () => undefined);
  const bootStartedRef = useRef(false);
  const routePostTargetRef = useRef('');
  const routeJobTargetRef = useRef('');
  const commentRefs = useRef<Record<number, HTMLElement | null>>({});
  const jobCardRefs = useRef<Record<number, HTMLElement | null>>({});

  const currentGraduateId = user?.graduate_id ?? 0;
  const profileTargetGraduateId = isCommunityProfileRoute ? routeProfileGraduateId : currentGraduateId;
  const isViewingOwnProfile = profileTargetGraduateId > 0 && profileTargetGraduateId === currentGraduateId;
  const profileRecord = profileDetails?.profile || null;
  const profileBaseUser = profileDetails?.user || (isViewingOwnProfile ? user : null);
  const profileUser = useMemo<GraduateUser | null>(() => {
    if (!profileBaseUser) return null;
    if (!profileRecord) return profileBaseUser;

    const fullName = [profileRecord.first_name, profileRecord.middle_name, profileRecord.last_name]
      .filter((part) => hasDisplayValue(part))
      .join(' ');

    return {
      ...profileBaseUser,
      first_name: profileRecord.first_name,
      middle_name: profileRecord.middle_name,
      last_name: profileRecord.last_name,
      full_name: fullName || profileBaseUser.full_name,
      phone: profileRecord.phone_number,
      address: profileRecord.current_location,
      program_name: profileRecord.program_course,
      year_graduated: profileRecord.graduation_year,
    };
  }, [profileBaseUser, profileRecord]);
  const profileSurvey = profileDetails?.survey_profile || null;
  const profilePersonalFields = profileSurvey?.personal?.fields || [];
  const profileWorkFields = profileSurvey?.work?.fields || [];
  const profileEducationFields = profileSurvey?.education?.fields || [];
  const profileGraduateStudyFields = profileSurvey?.education?.graduate_studies || [];
  const profileTrainings = profileSurvey?.trainings || [];
  const currentProfileImageUrl = resolveAssetUrl(user?.profile_image_path);
  const profileImageUrl = isViewingOwnProfile
    ? (profileImagePreview || resolveAssetUrl(profileUser?.profile_image_path) || currentProfileImageUrl)
    : resolveAssetUrl(profileUser?.profile_image_path);
  const currentCoverImageUrl = resolveAssetUrl(profileUser?.cover_image_path);
  const profileCoverImageUrl = isViewingOwnProfile
    ? (coverRemoveRequested ? '' : (coverImagePreview || currentCoverImageUrl))
    : currentCoverImageUrl;
  const profileJobTitle = profileRecord?.job_title || '';
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
      job.poster_full_name,
      job.first_name,
      job.last_name,
      job.poster_program_code,
      job.poster_program_name,
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

  const pendingForumPostsCount = myForumPosts.filter((post) => post.status === 'pending').length;
  const approvedForumPostsCount = myForumPosts.filter((post) => post.status === 'approved').length;
  const hiddenForumPostsCount = myForumPosts.filter((post) => post.status === 'hidden').length;
  const directChatCount = directRooms.length;
  const groupChatCount = groupRooms.length;

  const unavailableForTab = useCallback(
    (tab: PortalTab) => {
      if (tab === 'community_forum' && !communityAvailable) {
        return {
          title: 'Community Forum is currently unavailable.',
          message: getSetting('community_default_announcement', 'This feature is currently unavailable.'),
        };
      }

      if (['messages', 'group_chats'].includes(tab) && !messagingAvailable) {
        return {
          title: 'Messages are currently unavailable.',
          message: 'This feature is currently unavailable.',
        };
      }

      if (['jobs', 'job_posting'].includes(tab) && !jobsAvailable) {
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

  const selectTab = useCallback(
    (tab: PortalTab) => {
      setActiveTab(tab);
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
    const roomList = sortChatRooms(
      (Array.isArray(response.data?.rooms) ? (response.data.rooms as ChatRoom[]) : [])
        .map((room) => mergeKnownPresenceIntoRoom(room, chatPresenceByGraduateRef.current)),
    );
    const directoryList = (Array.isArray(response.data?.directory) ? (response.data.directory as ChatParticipant[]) : [])
      .map((participant) => mergeKnownPresenceIntoParticipant(participant, chatPresenceByGraduateRef.current));

    setRooms(roomList);
    setDirectory(directoryList);

    if (roomList.length === 0) {
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
      return roomList[0].id;
    });
  }, [authenticatedFetch]);

  const loadGraduateProfile = useCallback(async () => {
    if (profileTargetGraduateId <= 0) {
      return;
    }

    setProfileDetailsLoading(true);

    try {
      const endpoint = isViewingOwnProfile
        ? API_ENDPOINTS.GRADUATE_PROFILE
        : `${API_ENDPOINTS.GRADUATE_PROFILE}?graduate_id=${profileTargetGraduateId}`;
      const response = await authenticatedFetch(endpoint);
      setProfileDetails((response.data as GraduateProfilePayload | undefined) || null);
      setProfileDetailsLoaded(true);
    } finally {
      setProfileDetailsLoading(false);
    }
  }, [authenticatedFetch, isViewingOwnProfile, profileTargetGraduateId]);

  const loadProfileForumPosts = useCallback(async () => {
    if (!communityAvailable || profileTargetGraduateId <= 0) {
      setProfileForumPosts([]);
      return;
    }

    if (isViewingOwnProfile) {
      await loadMyForumPosts();
      return;
    }

    const response = await authenticatedFetch(`${API_ENDPOINTS.FORUM.POSTS}?graduate_id=${profileTargetGraduateId}`);
    setProfileForumPosts(Array.isArray(response.data) ? (response.data as ForumPost[]) : []);
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
        if (requestId !== roomLoadRequestRef.current) return;

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

      const newestIncoming = [...messages].reverse().find((message) => !message.is_mine && message.id > 0);
      if (!newestIncoming || newestIncoming.read_at) return;

      try {
        const socket = chatSocketRef.current;
        if (socket?.connected) {
          const response = await emitWithAck(socket, 'message:read', {
            room_id: roomId,
            up_to_message_id: newestIncoming.id,
          });

          if (!response.success) {
            throw new Error(response.error || 'Unable to mark messages as read');
          }
        } else {
          await authenticatedFetch(API_ENDPOINTS.FORUM.CHAT_MESSAGES, {
            method: 'POST',
            body: JSON.stringify({
              action: 'read',
              room_id: roomId,
              up_to_message_id: newestIncoming.id,
            }),
          });
        }

        const localReadAt = new Date().toISOString();
        setRoomMessages((current) => {
          if (selectedRoomIdRef.current !== roomId) return current;
          const next = current.map((message) => (
            !message.is_mine && message.id > 0 && message.id <= newestIncoming.id
              ? { ...message, read_at: message.read_at || localReadAt }
              : message
          ));
          roomMessagesRef.current = next;
          return next;
        });
        setRooms((current) => current.map((room) => (room.id === roomId ? { ...room, unread_count: 0 } : room)));
      } catch {
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

    setRooms((current) => {
      const exists = current.some((room) => room.id === synchronizedConversation.id);
      const next = exists
        ? current.map((room) => (room.id === synchronizedConversation.id ? { ...room, ...synchronizedConversation } : room))
        : [synchronizedConversation, ...current];
      return sortChatRooms(next);
    });

    setActiveRoom((current) => (
      current?.id === synchronizedConversation.id ? { ...current, ...synchronizedConversation } : current
    ));
  }, []);

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
        group_chats: messagingAvailable ? ['chats'] : [],
        jobs: jobsAvailable ? ['jobs', 'rating'] : [],
        job_posting: jobsAvailable ? ['my_jobs', 'rating'] : [],
        my_profile: communityAvailable ? ['rating', 'activity'] : ['rating'],
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
    [communityAvailable, jobsAvailable, loadChats, loadForumFeed, loadJobs, loadMyForumPosts, loadMyJobs, loadRatingSummary, messagingAvailable, notify],
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
    setProfileDetails(null);
    setProfileDetailsLoaded(false);
    setProfileDetailsLoading(false);
    setProfileForumPosts([]);
    setProfileEditOpen(false);
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
      setActiveTab('announcements');
      navigate('/graduate/announcements', { replace: true });
      return;
    }

    setActiveTab(getPortalTab(searchParams.get('tab')));
  }, [isAnnouncementRoute, isCommunityProfileRoute, navigate, searchParams]);

  useEffect(() => {
    if (activeTab !== 'my_profile' || profileTargetGraduateId <= 0 || profileDetailsLoaded || profileDetailsLoading) {
      return;
    }

    void loadGraduateProfile().catch((error) => {
      notify('warning', error instanceof Error ? error.message : 'Unable to load profile details', 'My Profile');
    });
  }, [activeTab, loadGraduateProfile, notify, profileDetailsLoaded, profileDetailsLoading, profileTargetGraduateId]);

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
      setJobSearch('');
    }

    if (activeTab !== 'jobs' || jobs.length === 0 || !jobs.some((job) => job.id === jobId)) {
      return;
    }

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
  }, [activeTab, jobs, jobsAvailable, searchParams]);

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
      setMessagePagination(null);
      setChatMobileConversationOpen(false);
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
    setProfileForm(createProfileForm(profileRecord, profileUser));
  }, [profileRecord, profileUser]);

  useEffect(() => {
    if (!profileImageFile) {
      setProfileImagePreview(resolveAssetUrl(profileUser?.profile_image_path));
    }
  }, [profileImageFile, profileUser?.profile_image_path]);

  useEffect(() => {
    if (!coverImageFile && !coverRemoveRequested) {
      setCoverImagePreview(resolveAssetUrl(profileUser?.cover_image_path));
    }
  }, [coverImageFile, coverRemoveRequested, profileUser?.cover_image_path]);

  useEffect(() => {
    return () => {
      if (profileImagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(profileImagePreview);
      }
    };
  }, [profileImagePreview]);

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
    selectedRoomIdRef.current = selectedRoomId;
  }, [selectedRoomId]);

  const chatRealtimeEnabled = messagingAvailable;
  const chatSurfaceOpen = messagingAvailable && ['community_forum', 'messages', 'group_chats'].includes(activeTab);
  const chatConversationSurfaceOpen = messagingAvailable && (
    activeTab === 'messages'
    || activeTab === 'group_chats'
    || (activeTab === 'community_forum' && forumChatWindowOpen)
  );

  useEffect(() => {
    chatConversationSurfaceOpenRef.current = chatConversationSurfaceOpen;
  }, [chatConversationSurfaceOpen]);

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
    if (activeTab === 'messages') {
      setChatMobileConversationOpen(true);
    }
    void loadRoomMessages(selectedRoomId);

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
  }, [activeTab, chatConversationSurfaceOpen, loadRoomMessages, selectedRoomId]);

  useEffect(() => {
    roomMessagesRef.current = roomMessages;
  }, [roomMessages]);

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
      if (isReconnect) {
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
      if (selectedRoomIdRef.current !== incoming.room_id) return;

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
    };

    const handleUnreadUpdated = (payload: { rooms?: Record<string, number> }) => {
      if (!payload.rooms) return;
      setRooms((current) => current.map((room) => {
        const unreadCount = payload.rooms?.[String(room.id)];
        return typeof unreadCount === 'number' ? { ...room, unread_count: unreadCount } : room;
      }));
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
    socket.on('message:delivered', applyMessageDelivery);
    socket.on('message:read', applyMessageRead);
    socket.on('typing:update', handleTypingUpdate);
    socket.on('conversation:updated', handleConversationUpdated);
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
      socket.off('message:delivered', applyMessageDelivery);
      socket.off('message:read', applyMessageRead);
      socket.off('typing:update', handleTypingUpdate);
      socket.off('conversation:updated', handleConversationUpdated);
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
  }, [applyMessageDelivery, applyMessageRead, applyPresenceStatus, applyPresenceStatuses, chatRealtimeEnabled, currentGraduateId, loadChats, upsertConversation]);

  useEffect(() => {
    if (!chatSurfaceOpen || chatConnectionStatus === 'connected') return undefined;

    const roomInterval = window.setInterval(() => {
      void loadChats();
    }, 15000);

    const messageInterval = window.setInterval(() => {
      const roomId = selectedRoomIdRef.current;
      if (roomId) {
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
    if (activeTab !== 'messages' || !chatNearBottomRef.current) return;
    void markVisibleMessagesAsRead();
  }, [activeTab, markVisibleMessagesAsRead, roomMessages]);

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
    const handleNotificationUpdate = () => {
      void loadBootData(true, activeTab);
      if (selectedRoomId) {
        void loadRoomMessages(selectedRoomId, true);
      }
    };

    window.addEventListener('gradtrack:notifications-updated', handleNotificationUpdate);
    return () => window.removeEventListener('gradtrack:notifications-updated', handleNotificationUpdate);
  }, [activeTab, loadBootData, loadRoomMessages, selectedRoomId]);

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

    if (!communityAvailable) {
      notify('info', 'This feature is currently unavailable.', 'Community Forum');
      return;
    }

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
      await Promise.all([loadForumFeed(), loadMyForumPosts(), loadProfileForumPosts()]);
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
          await Promise.all([loadForumFeed(), loadMyForumPosts(), loadProfileForumPosts()]);
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
      setProfileForumPosts((current) =>
        current.map((post) => (post.id === postId ? { ...post, is_liked: liked, like_count: likeCount } : post)),
      );
      setSelectedPost((current) =>
        current && current.id === postId ? { ...current, is_liked: liked, like_count: likeCount } : current,
      );
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to update reaction', 'Community Forum');
    } finally {
      setForumActionKey('');
    }
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
      await Promise.all([loadForumFeed(), loadMyForumPosts(), loadProfileForumPosts()]);
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

      await Promise.all([loadForumFeed(), loadMyForumPosts(), loadProfileForumPosts()]);
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
          await Promise.all([loadForumFeed(), loadMyForumPosts(), loadProfileForumPosts()]);
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

  const openForumChatWindow = (roomId: number) => {
    if (!messagingAvailable) {
      notify('info', 'This feature is currently unavailable.', 'Messages');
      return;
    }

    setSelectedRoomId(roomId);
    setForumChatWindowOpen(true);
  };

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
    setProfileMenuOpen(false);
    setMobileNavOpen(false);
    setActiveTab('my_profile');
    navigate(`/graduate/community/profile/${targetId}`);
  }, [navigate]);

  const createDirectChat = async (graduateId: number) => {
    if (!messagingAvailable) {
      notify('info', 'This feature is currently unavailable.', 'Messages');
      return;
    }

    setChatCreating(true);

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
        setChatMobileConversationOpen(true);
        await loadRoomMessages(roomId);
      }
      setSelectedPostOpen(false);
      setChatModalOpen(false);
      selectTab('messages');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to start direct chat', 'Chats');
    } finally {
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
        setChatMobileConversationOpen(true);
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
  ): Promise<MessageAttachment> => {
    if (attachment.uploaded) return attachment.uploaded;
    retryAttachmentsRef.current[clientMessageId] = {
      ...attachment,
      status: 'uploading',
      progress: 0,
      error: undefined,
    };

    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('room_id', String(roomId));
      formData.append('attachment', attachment.file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', API_ENDPOINTS.FORUM.CHAT_ATTACHMENTS);
      xhr.withCredentials = true;

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
          data = {};
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

  const sendMessageToServer = async (payload: {
    room_id: number;
    message: string;
    client_message_id: string;
    attachment_ids: number[];
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
      return canonicalMessages;
    }

    return savedMessages;
  };

  const handleSendMessage = async (event?: FormEvent<HTMLFormElement>, retryMessage?: ChatMessage) => {
    event?.preventDefault();

    const roomId = retryMessage?.room_id || selectedRoomId;
    if (!roomId) {
      notify('warning', 'Select a chat room first.', 'Chats');
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
        ? await uploadChatAttachment(selectedAttachment, roomId, clientMessageId)
        : null;
      const existingAttachmentIds = retryMessage?.attachments
        ?.filter((attachment) => attachment.id > 0)
        .map((attachment) => attachment.id) || [];
      const attachmentIds = existingAttachmentIds.length > 0
        ? existingAttachmentIds
        : (uploadedAttachment ? [uploadedAttachment.id] : []);

      const savedMessages = await sendMessageToServer({
        room_id: roomId,
        message,
        client_message_id: clientMessageId,
        attachment_ids: attachmentIds,
      });

      const normalizedMessages = savedMessages.map((savedMessage) => normalizeChatMessage(savedMessage, currentGraduateId));
      const newestMessage = normalizedMessages[normalizedMessages.length - 1];
      if (selectedRoomIdRef.current === roomId) {
        const nextMessages = mergeChatMessages(roomMessagesRef.current, normalizedMessages);
        setRoomMessages(nextMessages);
        roomMessagesRef.current = nextMessages;
      }
      setRooms((current) => sortChatRooms(current.map((room) => (
        room.id === newestMessage.room_id
          ? {
              ...room,
              last_message: getChatMessagePreview(newestMessage),
              last_message_type: newestMessage.message_type || 'text',
              last_message_at: newestMessage.created_at,
              last_message_sender_id: newestMessage.graduate_id,
              updated_at: newestMessage.created_at,
              unread_count: 0,
            }
          : room
      ))));
      const completedAttachment = retryAttachmentsRef.current[clientMessageId];
      if (completedAttachment?.preview_url) {
        URL.revokeObjectURL(completedAttachment.preview_url);
      }
      delete retryAttachmentsRef.current[clientMessageId];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unable to send message';
      if (selectedRoomIdRef.current === roomId) {
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

  const handleRetryAttachment = () => {
    const roomId = selectedRoomIdRef.current;
    if (!chatSelectedAttachment || !roomId) return;
    const attachment = chatSelectedAttachment;
    const retryId = createClientMessageId(currentGraduateId);
    void uploadChatAttachment(attachment, roomId, retryId)
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

  const resetProfileEditorFiles = () => {
    setProfileImageFile(null);
    setProfileImagePreview(resolveAssetUrl(profileUser?.profile_image_path));
    setCoverImageFile(null);
    setCoverImagePreview(resolveAssetUrl(profileUser?.cover_image_path));
    setCoverRemoveRequested(false);
    if (profileImageInputRef.current) {
      profileImageInputRef.current.value = '';
    }
    if (coverImageInputRef.current) {
      coverImageInputRef.current.value = '';
    }
  };

  const openProfileEditor = (section: ProfileEditSection = 'basic') => {
    if (!isViewingOwnProfile) {
      return;
    }

    setProfileEditSection(section);
    setProfileEditOpen(true);
  };

  const cancelProfileEditing = () => {
    setProfileEditOpen(false);
    resetProfileEditorFiles();
    setProfileForm(createProfileForm(profileRecord, profileUser));
  };

  const submitProfileUpdate = async ({
    profileFile = profileImageFile,
    coverFile = coverImageFile,
    removeCover = coverRemoveRequested,
    includeProfileFields = false,
    includePassword = false,
    closeEditor = false,
  }: {
    profileFile?: File | null;
    coverFile?: File | null;
    removeCover?: boolean;
    includeProfileFields?: boolean;
    includePassword?: boolean;
    closeEditor?: boolean;
  } = {}) => {
    if (!isViewingOwnProfile) {
      notify('info', 'You can only edit your own profile.', 'Community Profile');
      return;
    }

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
      formData.append('program_course', profileForm.program_course.trim());
      formData.append('graduation_year', profileForm.graduation_year.trim());
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

    if (profileFile) {
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
      setProfileDetails(nextProfile);
      setProfileDetailsLoaded(true);
      await checkAuth();
      setProfileImageFile(null);
      setCoverImageFile(null);
      setCoverRemoveRequested(false);
      setProfileImagePreview(resolveAssetUrl(nextProfile?.user?.profile_image_path));
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
      if (closeEditor) {
        setProfileEditOpen(false);
      }
      notify('success', 'Profile updated successfully.', 'My Profile');
    } catch (error) {
      setProfileImageFile(null);
      setCoverImageFile(null);
      setCoverRemoveRequested(false);
      setProfileImagePreview(resolveAssetUrl(profileUser?.profile_image_path));
      setCoverImagePreview(resolveAssetUrl(profileUser?.cover_image_path));
      notify('error', error instanceof Error ? error.message : 'Unable to update profile', 'My Profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleProfileAssetSelection = (file: File | null, kind: 'profile' | 'cover') => {
    if (!isViewingOwnProfile) {
      return;
    }

    if (!file) return;

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

    const previewUrl = URL.createObjectURL(file);
    if (kind === 'profile') {
      setProfileImageFile(file);
      setProfileImagePreview(previewUrl);
      void submitProfileUpdate({ profileFile: file, coverFile: null, removeCover: false });
      return;
    }

    setCoverImageFile(file);
    setCoverImagePreview(previewUrl);
    setCoverRemoveRequested(false);
    void submitProfileUpdate({ profileFile: null, coverFile: file, removeCover: false });
  };

  const handleRemoveCoverImage = () => {
    if (!isViewingOwnProfile) {
      return;
    }

    setCoverRemoveRequested(true);
    setCoverImageFile(null);
    setCoverImagePreview('');
    void submitProfileUpdate({ profileFile: null, coverFile: null, removeCover: true });
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

      if (profileForm.graduation_year.trim()) {
        const graduationYear = Number(profileForm.graduation_year);
        const maximumYear = new Date().getFullYear() + 1;
        if (!Number.isInteger(graduationYear) || graduationYear < 1900 || graduationYear > maximumYear) {
          notify('warning', `Graduation year must be between 1900 and ${maximumYear}.`, 'My Profile');
          return;
        }
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
      closeEditor: true,
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

  const navItems: Array<{ key: PortalTab; label: string; shortLabel: string; icon: LucideIcon; badge?: number }> = [
    { key: 'announcements', label: 'Announcements', shortLabel: 'News', icon: Megaphone },
    { key: 'community_forum', label: 'Community Forum', shortLabel: 'Forum', icon: MessageSquare, badge: forumPosts.length },
    { key: 'messages', label: 'Messages', shortLabel: 'Chats', icon: MessageCircle, badge: directChatCount },
    { key: 'group_chats', label: 'Group Chats', shortLabel: 'Groups', icon: Users, badge: groupChatCount },
    { key: 'jobs', label: 'Browse Jobs', shortLabel: 'Jobs', icon: Briefcase, badge: jobs.length },
    { key: 'job_posting', label: 'Job Posting', shortLabel: 'Post Job', icon: Pencil, badge: myPostedJobs.length },
    { key: 'my_profile', label: 'My Profile', shortLabel: 'Profile', icon: User },
  ];
  const primaryNavItems = navItems.filter((item) => item.key !== 'my_profile');
  const activeNavItem = navItems.find((item) => item.key === activeTab);

  const profileInputClass = 'w-full rounded-2xl border border-[var(--border-strong)] bg-[var(--input)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-blue-500';

  const renderChatWorkspace = (mode: 'direct' | 'group') => {
    const isGroupMode = mode === 'group';
    {
      const activeTypingNames = selectedRoomId
        ? Object.values(chatTypingUsers[selectedRoomId] || {})
            .filter((typing) => typing.expiresAt > Date.now())
            .map((typing) => typing.name)
        : [];

      return (
        <RealtimeMessagingWorkspace
          currentGraduate={{
            graduate_id: currentGraduateId,
            full_name: user?.full_name || 'Graduate',
            profile_image_path: user?.profile_image_path,
            program_code: user?.program_code,
            program_name: user?.program_name,
          }}
          rooms={isGroupMode ? groupRooms : directRooms}
          directory={directory}
          selectedRoomId={selectedRoomId}
          activeRoom={activeRoom && activeRoom.id === selectedRoomId && activeRoom.is_group === isGroupMode ? activeRoom : null}
          messages={activeRoom && activeRoom.id === selectedRoomId && activeRoom.is_group === isGroupMode ? roomMessages : []}
          search={chatSearch}
          draft={chatMessageDraft}
          roomLoading={roomLoading}
          initialLoading={loading && (isGroupMode ? groupRooms.length : directRooms.length) === 0}
          connectionStatus={chatConnectionStatus}
          loadingOlder={olderMessagesLoading}
          hasMoreOlder={!!messagePagination?.has_more_older}
          typingNames={activeTypingNames}
          selectedAttachment={chatSelectedAttachment}
          newMessageAvailable={chatNewMessageAvailable}
          mobileChatOpen={chatMobileConversationOpen}
          newConversationOpen={!isGroupMode && chatModalOpen && chatModalMode === 'direct' && activeTab === 'messages'}
          newConversationSearch={chatModalSearch}
          newConversationCreating={chatCreating}
          resolveAssetUrl={resolveAssetUrl}
          onSearchChange={setChatSearch}
          onSelectRoom={(roomId) => {
            setSelectedRoomId(roomId);
            setChatMobileConversationOpen(true);
          }}
          onBackToList={() => setChatMobileConversationOpen(false)}
          onDraftChange={handleChatDraftInput}
          onTypingStop={() => stopChatTyping()}
          onSend={handleSendMessage}
          onRetryMessage={handleRetryMessage}
          onLoadOlder={loadOlderRoomMessages}
          onNearBottomChange={handleChatNearBottomChange}
          onScrollToNewest={handleScrollToNewest}
          onAttachmentSelected={handleChatAttachmentSelected}
          onRemoveAttachment={removeChatAttachment}
          onRetryAttachment={handleRetryAttachment}
          onOpenNewConversation={() => openChatModal(mode)}
          onCloseNewConversation={() => setChatModalOpen(false)}
          onNewConversationSearchChange={setChatModalSearch}
          onStartConversation={(graduateId) => void createDirectChat(graduateId)}
          onOpenProfile={openCommunityProfile}
        />
      );
    }

  };

  const ActiveNavIcon = activeNavItem?.icon || MessageSquare;
  const selectedForumChatRoom = selectedRoomId
    ? (activeRoom?.id === selectedRoomId ? activeRoom : rooms.find((room) => room.id === selectedRoomId) || null)
    : null;
  const selectedForumChatReady = !!activeRoom && activeRoom.id === selectedRoomId;
  const selectedForumChatTypingNames = selectedRoomId
    ? Object.values(chatTypingUsers[selectedRoomId] || {})
        .filter((typing) => typing.expiresAt > Date.now())
        .map((typing) => typing.name)
    : [];
  const selectedForumChatRecipient = selectedForumChatRoom
    ? getRoomOtherParticipants(selectedForumChatRoom, currentGraduateId)[0] || selectedForumChatRoom.participants[0] || null
    : null;

  useEffect(() => {
    setChatPreviewAttachment(null);
  }, [activeTab, location.key, selectedRoomId]);

  return (
    <div className="min-h-screen overflow-x-clip bg-[#f4f6fb] text-slate-900" style={graduatePortalLayoutStyle}>
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto grid max-w-screen-2xl grid-cols-[auto_minmax(0,1fr)] items-center gap-3 px-4 py-2 sm:px-6 xl:grid-cols-[minmax(180px,1fr)_auto_minmax(340px,1fr)] xl:gap-5">
          <button
            type="button"
            onClick={() => selectTab('announcements')}
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
            {notificationsEnabled && <NotificationBell audience="graduate" expandLabel />}

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
                <div className="hidden min-w-0 flex-1 text-left 2xl:block">
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
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 xl:hidden"
              aria-label="Toggle mobile navigation"
              aria-expanded={mobileNavOpen}
            >
              {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileNavOpen && (
          <div className="border-t border-gray-200 xl:hidden">
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

      <main className="relative z-0 mx-auto max-w-screen-2xl px-3 py-4 pb-10 sm:px-6 sm:py-6">
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
              {activeTab === 'announcements' && (
                <GraduateAnnouncements announcementId={routeAnnouncementId || undefined} />
              )}

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

              {activeTab === 'community_forum' && unavailableForTab(activeTab) && (
                <FeatureUnavailable compact {...unavailableForTab(activeTab)!} />
              )}

              {activeTab === 'community_forum' && !unavailableForTab(activeTab) && (
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
                              <button type="button" onClick={() => openCommunityProfile(post.graduate_id)} className="flex min-w-0 items-center gap-3 text-left">
                                <Avatar src={resolveAssetUrl(post.author_profile_image_path)} label={post.author_name} size="md" />
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
                                <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-700">{post.category}</span>
                                {messagingAvailable && post.graduate_id !== currentGraduateId && (
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

                    <div className="min-w-0 space-y-5">
                      <aside className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-[calc(var(--graduate-portal-header-height)_+_var(--graduate-portal-sticky-gap))] lg:z-10 lg:max-h-[calc(100vh_-_var(--graduate-portal-header-height)_-_2rem)] lg:overflow-y-auto lg:overscroll-contain">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h2 className="text-xl font-bold text-slate-900">Chats</h2>
                            <p className="text-sm text-slate-500">Direct and group conversations inside the forum.</p>
                          </div>
                          {messagingAvailable && (
                            <div className="flex gap-2">
                              <button type="button" onClick={() => openChatModal('direct')} className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                New Chat
                              </button>
                              <button type="button" onClick={() => openChatModal('group')} className="rounded-full bg-blue-700 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-800">
                                Group Chat
                              </button>
                            </div>
                          )}
                        </div>

                        {!messagingAvailable ? (
                          <FeatureUnavailable compact title="Messages are currently unavailable." message="This feature is currently unavailable." />
                        ) : (
                        <div className="mt-4 rounded-3xl bg-[#fafbff] p-3">
                          <label className="relative block">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input value={chatSearch} onChange={(event) => setChatSearch(event.target.value)} placeholder="Search chats" className="w-full rounded-2xl border border-slate-200 bg-white px-10 py-2.5 text-sm outline-none transition focus:border-blue-500" />
                          </label>

                          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1 lg:max-h-[calc(100vh_-_var(--graduate-portal-header-height)_-_14rem)]">
                            {filteredRooms.length === 0 ? (
                              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                                No chat rooms yet. Start a direct message or create a group chat.
                              </div>
                            ) : (
                              filteredRooms.map((room) => {
                                const active = selectedRoomId === room.id;

                                return (
                                  <button key={room.id} type="button" onClick={() => openForumChatWindow(room.id)} className={`flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition ${active && forumChatWindowOpen ? 'border-blue-200 bg-blue-50' : 'border-transparent bg-white hover:border-slate-200 hover:bg-slate-50'}`}>
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
                        )}
                      </aside>
                    </div>
                  </div>
                </section>
              )}

              {activeTab === 'messages' && (
                unavailableForTab(activeTab)
                  ? <FeatureUnavailable compact {...unavailableForTab(activeTab)!} />
                  : renderChatWorkspace('direct')
              )}

              {activeTab === 'group_chats' && (
                unavailableForTab(activeTab)
                  ? <FeatureUnavailable compact {...unavailableForTab(activeTab)!} />
                  : renderChatWorkspace('group')
              )}

              {activeTab === 'jobs' && unavailableForTab(activeTab) && (
                <FeatureUnavailable compact {...unavailableForTab(activeTab)!} />
              )}

              {activeTab === 'jobs' && !unavailableForTab(activeTab) && (
                <section className="space-y-5">
                  <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Browse Jobs</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Approved job opportunities stay separate from Community Forum discussions.</p>
                      </div>
                      <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {filteredJobs.length} job{filteredJobs.length === 1 ? '' : 's'}
                      </div>
                    </div>

                    <label className="relative mt-4 block">
                      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
                      <input value={jobSearch} onChange={(event) => setJobSearch(event.target.value)} placeholder="Search jobs by title, company, skills, location, or program fit" className="w-full rounded-2xl border border-slate-200 bg-[#fafbff] px-11 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500" />
                    </label>
                  </div>

                  {filteredJobs.length === 0 ? (
                    <div className="rounded-[32px] border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                      No approved jobs match your search right now.
                    </div>
                  ) : (
                    <div className="grid gap-5 lg:grid-cols-2">
                      {filteredJobs.map((job) => {
                        const applicationLink = normalizeApplicationLink(job.application_link);
                        const posterName = getJobPosterName(job);
                        const posterProgram = getJobPosterProgram(job);
                        const hasApplyDetails = Boolean(job.contact_email || applicationLink || job.application_method);
                        const detailItems = [
                          { icon: MapPin, label: 'Location', value: job.location || 'Not specified' },
                          { icon: GraduationCap, label: 'Program Fit', value: getJobProgramFit(job) },
                          ...(job.industry ? [{ icon: Building2, label: 'Industry', value: job.industry }] : []),
                          ...(job.salary_range ? [{ icon: Briefcase, label: 'Salary', value: job.salary_range }] : []),
                        ];

                        return (
                          <article
                            key={job.id}
                            ref={(element) => { jobCardRefs.current[job.id] = element; }}
                            className={`flex h-full flex-col rounded-[28px] border p-5 shadow-sm transition sm:p-6 ${
                              highlightedJobId === job.id
                                ? 'border-blue-300 bg-blue-50/50 ring-2 ring-blue-200 dark:border-blue-500/70 dark:bg-blue-950/30 dark:ring-blue-500/30'
                                : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <button
                                type="button"
                                onClick={() => job.poster_graduate_id && openCommunityProfile(job.poster_graduate_id)}
                                className="flex min-w-0 items-center gap-3 text-left"
                                disabled={!job.poster_graduate_id}
                              >
                                <Avatar src={resolveAssetUrl(job.poster_profile_image_path)} label={posterName} size="md" />
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-semibold text-slate-900 transition hover:text-blue-700 dark:text-slate-100 dark:hover:text-blue-300">{posterName}</span>
                                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                                    {posterProgram} - {getJobPostedLabel(job)}
                                  </span>
                                </span>
                              </button>

                              <span className="shrink-0 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200">
                                {formatEmploymentType(job.job_type)}
                              </span>
                            </div>

                            <div className="mt-5 min-w-0">
                              <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400">
                                <Building2 className="h-4 w-4 text-blue-500 dark:text-blue-300" />
                                <span className="truncate">{job.company || 'Company not specified'}</span>
                              </p>
                              <h3 className="mt-2 text-xl font-bold leading-snug text-slate-950 dark:text-slate-50">{job.title}</h3>
                            </div>

                            <p className="mt-3 min-h-[4.5rem] whitespace-pre-line text-sm leading-6 text-slate-600 dark:text-slate-300">
                              {previewText(job.description || 'No description provided yet.', 180)}
                            </p>

                            <div className="mt-5 flex flex-wrap gap-2">
                              {detailItems.map((item) => (
                                <JobInfoChip key={`${job.id}-${item.label}`} icon={item.icon} label={item.label} value={item.value} />
                              ))}
                            </div>

                            <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-700">
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">How to Apply</p>
                              {hasApplyDetails ? (
                                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600 dark:text-slate-300">
                                  {job.contact_email && (
                                    <a href={`mailto:${job.contact_email}`} className="inline-flex min-w-0 items-center gap-1.5 font-medium text-blue-700 hover:underline dark:text-blue-300">
                                      <Mail className="h-4 w-4 shrink-0" />
                                      <span className="truncate">{job.contact_email}</span>
                                    </a>
                                  )}
                                  {applicationLink && (
                                    <a href={applicationLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-blue-700 hover:underline dark:text-blue-300">
                                      <FileText className="h-4 w-4" />
                                      Application link
                                    </a>
                                  )}
                                  {job.application_method && <p className="w-full whitespace-pre-line text-slate-600 dark:text-slate-300">{previewText(job.application_method, 120)}</p>}
                                </div>
                              ) : (
                                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Application details are not specified.</p>
                              )}
                            </div>

                            <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-5">
                              {job.application_deadline ? (
                                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                                  <CalendarDays className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                                  Deadline {formatDate(job.application_deadline)}
                                </span>
                              ) : (
                                <span className="text-xs font-medium text-slate-400 dark:text-slate-500">No deadline specified</span>
                              )}
                              <button type="button" onClick={() => void openJobDetails(job)} className="inline-flex items-center gap-2 rounded-full bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800">
                                <FileText className="h-4 w-4" />
                                View Details
                              </button>
                            </div>
                          </article>
                        );
                      })}
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
                  {isViewingOwnProfile && (
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

                  {profileDetailsLoading && !profileDetailsLoaded ? (
                    <ProfileSkeleton />
                  ) : (
                    <ProfileWorkspace
                      user={profileUser}
                      profile={profileRecord}
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
                      onEdit={openProfileEditor}
                      onChangeProfilePhoto={() => profileImageInputRef.current?.click()}
                      onChangeCoverPhoto={() => coverImageInputRef.current?.click()}
                      onRemoveCoverPhoto={handleRemoveCoverImage}
                      onOpenProfileImage={(src, alt) => setProfileImageViewer({ src, alt })}
                      onMessage={() => profileUser?.graduate_id && void createDirectChat(profileUser.graduate_id)}
                      onOpenPost={(post) => void loadPostDetail(post.id)}
                      onOpenMedia={openMediaViewer}
                      onToggleLike={(postId) => void toggleLike(postId)}
                      onEditPost={openForumComposer}
                      onDeletePost={handleForumDelete}
                      onOpenProfile={openCommunityProfile}
                    />
                  )}
                </section>
              )}
            </>
          )}
      </main>

      {activeTab === 'community_forum' && forumChatWindowOpen && selectedRoomId && (
        <div className="fixed bottom-4 left-4 right-4 z-40 flex h-[32rem] max-h-[calc(100vh_-_7rem)] flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-2xl sm:left-auto sm:w-96">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3">
            {selectedForumChatRoom ? (
              <button type="button" onClick={() => openCommunityProfile(selectedForumChatRecipient?.graduate_id)} disabled={selectedForumChatRoom.is_group || !selectedForumChatRecipient?.graduate_id} className="flex min-w-0 items-center gap-3 text-left disabled:cursor-default">
                <div className="relative shrink-0">
                  <Avatar src={resolveAssetUrl(selectedForumChatRecipient?.profile_image_path)} label={getRoomLabel(selectedForumChatRoom, currentGraduateId)} size="md" />
                  {!selectedForumChatRoom.is_group && selectedForumChatRecipient?.is_online && (
                    <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900 transition hover:text-blue-700">{getRoomLabel(selectedForumChatRoom, currentGraduateId)}</p>
                  <p className="truncate text-xs text-slate-500">
                    {selectedForumChatRoom.is_group
                      ? getRoomSubtitle(selectedForumChatRoom, currentGraduateId)
                      : <PresenceText participant={selectedForumChatRecipient} />}
                  </p>
                </div>
              </button>
            ) : (
              <div>
                <p className="font-semibold text-slate-900">Loading chat</p>
                <p className="text-xs text-slate-500">Opening conversation...</p>
              </div>
            )}
            <button type="button" onClick={() => { setForumChatWindowOpen(false); removeChatAttachment(); }} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100" aria-label="Close chat window">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex flex-1 flex-col">
            <MessageList
              room={selectedForumChatReady ? activeRoom : null}
              messages={selectedForumChatReady ? roomMessages : []}
              loading={roomLoading || !selectedForumChatReady}
              loadingOlder={olderMessagesLoading}
              hasMoreOlder={!!messagePagination?.has_more_older}
              typingNames={selectedForumChatTypingNames}
              newMessageAvailable={chatNewMessageAvailable}
              resolveAssetUrl={resolveAssetUrl}
              onRetryMessage={handleRetryMessage}
              onLoadOlder={loadOlderRoomMessages}
              onNearBottomChange={handleChatNearBottomChange}
              onScrollToNewest={handleScrollToNewest}
              onImageOpen={setChatPreviewAttachment}
            />
            <MessageComposer
              draft={chatMessageDraft}
              disabled={!selectedForumChatReady || roomLoading}
              selectedAttachment={chatSelectedAttachment}
              onDraftChange={handleChatDraftInput}
              onTypingStop={() => stopChatTyping()}
              onSend={handleSendMessage}
              onAttachmentSelected={handleChatAttachmentSelected}
              onRemoveAttachment={removeChatAttachment}
              onRetryAttachment={handleRetryAttachment}
            />
          </div>
        </div>
      )}

      {chatPreviewAttachment && (
        <ChatImagePreviewModal attachment={chatPreviewAttachment} resolveAssetUrl={resolveAssetUrl} onClose={() => setChatPreviewAttachment(null)} />
      )}

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
          onOpenProfile={openCommunityProfile}
        />
      )}

      {profileImageViewer && (
        <ImageLightbox
          src={profileImageViewer.src}
          alt={profileImageViewer.alt}
          onClose={() => setProfileImageViewer(null)}
        />
      )}

      {isViewingOwnProfile && profileEditOpen && (
        <ProfileEditModal
          activeSection={profileEditSection}
          user={profileUser}
          survey={profileSurvey}
          form={profileForm}
          inputClassName={profileInputClass}
          profileImageUrl={profileImageUrl}
          coverImageUrl={profileCoverImageUrl}
          saving={profileSaving}
          onSectionChange={setProfileEditSection}
          onFormChange={setProfileForm}
          onSubmit={handleProfileSave}
          onClose={cancelProfileEditing}
          onChangeProfilePhoto={() => profileImageInputRef.current?.click()}
          onChangeCoverPhoto={() => coverImageInputRef.current?.click()}
          onRemoveCoverPhoto={handleRemoveCoverImage}
        />
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
                    <button type="button" onClick={() => openCommunityProfile(selectedPost.graduate_id)} className="flex items-center gap-3 text-left">
                      <Avatar src={resolveAssetUrl(selectedPost.author_profile_image_path)} label={selectedPost.author_name} size="md" />
                      <div>
                        <p className="font-semibold text-slate-900 transition hover:text-blue-700">{selectedPost.author_name}</p>
                        <p className="text-xs text-slate-500">{selectedPost.category}</p>
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
                        <article
                          key={comment.id}
                          ref={(element) => { commentRefs.current[comment.id] = element; }}
                          className={`rounded-[24px] border p-4 transition ${
                            highlightedCommentId === comment.id
                              ? 'border-blue-300 bg-blue-50 shadow-md'
                              : 'border-slate-200 bg-white shadow-sm'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <button type="button" onClick={() => openCommunityProfile(comment.graduate_id)} className="flex items-start gap-3 text-left">
                                <Avatar src={resolveAssetUrl(comment.commenter_profile_image_path)} label={comment.commenter_name} size="sm" />
                                <span className="min-w-0">
                                  <span className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-slate-900 transition hover:text-blue-700">{comment.commenter_name}</span>
                                    <span className="text-xs text-slate-400">{formatRelativeTime(comment.created_at)}</span>
                                  </span>
                                  <span className="block text-xs text-slate-500">{comment.commenter_program_code || comment.commenter_program_name || 'Graduate'}</span>
                                </span>
                              </button>
                              <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-700">{comment.comment}</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {comment.graduate_id !== currentGraduateId && (
                                  <>
                                    {messagingAvailable && (
                                      <button type="button" onClick={() => void createDirectChat(comment.graduate_id)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                        Message
                                      </button>
                                    )}
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

      {chatModalOpen && !(activeTab === 'messages' && chatModalMode === 'direct') && (
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

                    return (
                      <div key={participant.graduate_id} className={`flex items-center gap-3 rounded-2xl border px-4 py-3 transition ${selected ? 'border-blue-200 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
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
                        <button type="button" onClick={() => openCommunityProfile(participant.graduate_id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                          <Avatar src={resolveAssetUrl(participant.profile_image_path)} label={participant.full_name} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-slate-900 transition hover:text-blue-700">{participant.full_name}</span>
                            <span className="block text-xs text-slate-500">
                              {participant.program_code || 'Graduate'}{participant.year_graduated ? ` - Batch ${participant.year_graduated}` : ''}
                            </span>
                          </span>
                        </button>
                      </div>
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
  onChangeCoverPhoto: () => void;
  onRemoveCoverPhoto: () => void;
  onOpenProfileImage: (src: string, alt: string) => void;
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
        onEdit={() => onEdit('basic')}
        onChangeProfilePhoto={onChangeProfilePhoto}
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
        canEdit={canEdit}
        onEdit={onEdit}
      />

      <ProfilePostsSection
        posts={posts}
        profileImageUrl={profileImageUrl}
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
  onEdit,
  onChangeProfilePhoto,
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
  onEdit: () => void;
  onChangeProfilePhoto: () => void;
  onChangeCoverPhoto: () => void;
  onRemoveCoverPhoto: () => void;
  onOpenImage: (src: string, alt: string) => void;
  onMessage: () => void;
}) {
  const fullName = getGraduateFullName(user);
  const program = profile ? (profile.program_course || '') : (user?.program_name || user?.program_code || '');
  const batch = getBatchLabel(profile ? profile.graduation_year : user?.year_graduated);
  const location = buildProfileLocation(profile, user, survey);
  const employmentStatus = profile
    ? (profile.professional_status || '')
    : (survey?.work?.summary?.employment_status || '');
  const company = profile ? (profile.company_name || '') : (survey?.work?.summary?.company || '');
  const headline = [jobTitle || employmentStatus, company].filter(hasDisplayValue).join(' at ');
  const metaItems = [program, batch, jobTitle || employmentStatus].filter(hasDisplayValue);
  const canMessage = messagingAvailable && !canEdit && !!user?.graduate_id && user.graduate_id !== currentGraduateId;

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="relative h-64 w-full overflow-hidden rounded-t-[28px] bg-[#071735] text-white sm:h-80 lg:h-96">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#071735_0%,#123a7a_56%,#0f172a_100%)]" />
        {coverImageUrl && (
          <button
            type="button"
            onClick={() => onOpenImage(coverImageUrl, `${fullName} profile cover`)}
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
          <div className="relative rounded-full border-4 border-white bg-white shadow-lg">
            {profileImageUrl ? (
              <button
                type="button"
                onClick={() => onOpenImage(profileImageUrl, `${fullName} profile photo`)}
                className="block cursor-zoom-in rounded-full"
                aria-label={`View ${fullName} profile photo`}
              >
                <Avatar src={profileImageUrl} label={fullName} size="xl" />
              </button>
            ) : (
              <Avatar src="" label={fullName} size="xl" />
            )}
            {canEdit && (
              <button type="button" onClick={onChangeProfilePhoto} disabled={saving} className="absolute bottom-1 right-1 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60" aria-label="Change profile photo" title="Change profile photo">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </button>
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

          {(canEdit || canMessage) && (
            <div className="flex flex-wrap gap-3 lg:justify-end">
              {canEdit && (
                <button type="button" onClick={onEdit} className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800">
                  <Pencil className="h-4 w-4" />
                  Edit Profile
                </button>
              )}
              {canMessage && (
                <button type="button" onClick={onMessage} className="inline-flex items-center justify-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-bold text-blue-800 transition hover:bg-blue-100">
                  <MessageCircle className="h-4 w-4" />
                  Message
                </button>
              )}
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
  canEdit,
  onEdit,
}: {
  user?: GraduateUser | null;
  profile?: GraduateEditableProfile | null;
  survey?: GraduateSurveyProfile | null;
  personalFields: GraduateProfileField[];
  workFields: GraduateProfileField[];
  educationFields: GraduateProfileField[];
  canEdit: boolean;
  onEdit: (section?: ProfileEditSection) => void;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <ProfileContactsCard user={user} profile={profile} survey={survey} personalFields={personalFields} canEdit={canEdit} onEdit={onEdit} />
      <ProfileInformationCard user={user} profile={profile} personalFields={personalFields} educationFields={educationFields} />
      <ProfileWorkCard profile={profile} survey={survey} fields={workFields} onEdit={canEdit ? () => onEdit('employment') : undefined} />
    </div>
  );
}

function ProfileContactsCard({
  user,
  profile,
  survey,
  personalFields,
  canEdit,
  onEdit,
}: {
  user?: GraduateUser | null;
  profile?: GraduateEditableProfile | null;
  survey?: GraduateSurveyProfile | null;
  personalFields: GraduateProfileField[];
  canEdit: boolean;
  onEdit: (section?: ProfileEditSection) => void;
}) {
  const surveyTelephone = getProfileFieldValue(personalFields, 'telephone');
  const rows = [
    { icon: Mail, label: 'Email Address', value: user?.email },
    { icon: Phone, label: 'Phone Number', value: profile ? profile.phone_number : (user?.phone || surveyTelephone) },
    { icon: MapPin, label: 'Current Location', value: buildProfileLocation(profile, user, survey) },
  ];

  return (
    <section className="flex h-full min-w-0 flex-col rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <ProfileCardHeader icon={Contact} title="Contacts" actionLabel={canEdit ? 'Edit' : undefined} onAction={canEdit ? () => onEdit('basic') : undefined} />
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
    { icon: GraduationCap, label: 'Program / Course', value: profile ? profile.program_course : (getProfileFieldValue(educationFields, 'degree_program') || user?.program_name || user?.program_code) },
    { icon: CalendarDays, label: 'Graduation Year / Batch', value: profile ? profile.graduation_year : (getProfileFieldValue(educationFields, 'year_graduated') || (user?.year_graduated ? String(user.year_graduated) : '')) },
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
            <Pencil className="h-4 w-4" />
            Update Details
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
  onEdit,
}: {
  profile?: GraduateEditableProfile | null;
  survey?: GraduateSurveyProfile | null;
  fields: GraduateProfileField[];
  onEdit?: () => void;
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
      <ProfileCardHeader icon={Briefcase} title="Work" actionLabel={onEdit ? 'View' : undefined} onAction={onEdit} />
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
  profileImageUrl,
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
  profileImageUrl: string;
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
            profileImageUrl={profileImageUrl}
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
  profileImageUrl,
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
  profileImageUrl: string;
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
          <Avatar src={resolveAssetUrl(post.author_profile_image_path) || profileImageUrl} label={post.author_name} size="md" />
          <div className="min-w-0">
            <p className="font-semibold text-slate-950 transition hover:text-blue-700">{post.author_name}</p>
            <p className="truncate text-xs text-slate-500">
              {post.author_program_code || post.author_program_name || 'Graduate'} - {formatRelativeTime(post.created_at)}
            </p>
          </div>
        </button>
        <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${forumStatusClass(post.status)}`}>{post.status.toUpperCase()}</span>
      </div>

      <button type="button" onClick={() => onOpenPost(post)} className="mt-4 block w-full text-left">
        <h4 className="text-lg font-bold text-slate-950">{post.title}</h4>
        <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-700">{previewText(post.content, 360)}</p>
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

function ProfileEditModal({
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
  onClose,
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
  onClose: () => void;
  onChangeProfilePhoto: () => void;
  onChangeCoverPhoto: () => void;
  onRemoveCoverPhoto: () => void;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const canSubmit = ['basic', 'employment', 'education', 'security'].includes(activeSection);
  const professionalStatusOptions = ['Currently Employed', 'Self-Employed', 'Freelance', 'Not Employed'];

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6">
      <form
        onSubmit={onSubmit}
        className="flex h-[calc(100dvh-1.5rem)] max-h-[46rem] w-full max-w-5xl flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl sm:h-[calc(100dvh-3rem)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-editor-title"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-5">
          <div>
            <h2 id="profile-editor-title" className="text-2xl font-bold text-slate-950">Edit Profile</h2>
            <p className="text-sm text-slate-500">{user?.full_name || 'Graduate User'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100" aria-label="Close profile editor">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden lg:grid-cols-[260px_minmax(0,1fr)] lg:grid-rows-1">
          <aside className="min-h-0 overflow-y-auto border-b border-slate-100 bg-slate-50 p-3 sm:p-4 lg:border-b-0 lg:border-r">
            <div className="grid grid-cols-2 gap-1 lg:grid-cols-1">
              {profileEditSections.map((section) => {
                const active = activeSection === section.key;
                const SectionIcon = section.icon;
                return (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => onSectionChange(section.key)}
                    className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                      active ? 'bg-blue-700 text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-950'
                    }`}
                  >
                    <SectionIcon className="h-4 w-4" />
                    {section.label}
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="min-h-0 overscroll-contain overflow-y-auto px-4 py-5 sm:px-6">
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
                  Profile education changes do not modify the program and graduation year submitted in your tracer survey.
                </div>
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
                  <Field label="Program / Course">
                    <input maxLength={180} value={form.program_course} onChange={(event) => onFormChange((current) => ({ ...current, program_course: event.target.value }))} className={inputClassName} />
                  </Field>
                  <Field label="Graduation Year / Batch">
                    <input type="number" min={1900} max={new Date().getFullYear() + 1} value={form.graduation_year} onChange={(event) => onFormChange((current) => ({ ...current, graduation_year: event.target.value }))} className={inputClassName} />
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
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-slate-100 bg-white px-4 py-4 sm:px-6">
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            {canSubmit ? 'Cancel' : 'Done'}
          </button>
          {canSubmit && (
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-blue-700 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </button>
          )}
        </div>
      </form>
    </div>
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

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
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
      className="fixed inset-0 z-[80] flex cursor-zoom-out items-center justify-center bg-black/95 p-4 sm:p-8"
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
        className="gradtrack-media-image max-h-full max-w-full cursor-default select-none object-contain"
        fallback={(
          <div className="cursor-default rounded-2xl border border-white/15 bg-white/10 px-6 py-8 text-center text-sm font-semibold text-white/80" onClick={(event) => event.stopPropagation()}>
            This image is currently unavailable.
          </div>
        )}
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

  const fallback = (
    <div className={`${sizeClass} flex items-center justify-center rounded-full bg-blue-100 font-bold text-blue-800`}>
      {getInitials(label)}
    </div>
  );

  if (src) {
    return (
      <SafeImage
        src={src}
        alt={label || 'Avatar'}
        logContext="avatar"
        className={`${sizeClass} gradtrack-media-image rounded-full object-cover object-center`}
        fallback={fallback}
      />
    );
  }

  return fallback;
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
    <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-[#f8fbff] px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
      <Icon className="h-3.5 w-3.5 shrink-0 text-blue-500 dark:text-blue-300" />
      <span className="shrink-0 font-semibold text-slate-500 dark:text-slate-400">{label}:</span>
      <span className="truncate font-medium text-slate-700 dark:text-slate-200">{value}</span>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6 dark:border-slate-700">
          <button
            type="button"
            onClick={() => job.poster_graduate_id && onOpenProfile(job.poster_graduate_id)}
            disabled={!job.poster_graduate_id}
            className="flex min-w-0 items-center gap-3 text-left"
          >
            <Avatar src={resolveAssetUrl(job.poster_profile_image_path)} label={posterName} size="md" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-slate-900 transition hover:text-blue-700 dark:text-slate-100 dark:hover:text-blue-300">{posterName}</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                {getJobPosterProgram(job)} - {getJobPostedLabel(job)}
              </span>
            </span>
          </button>

          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200">
              {formatEmploymentType(job.job_type)}
            </span>
            <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200" aria-label="Close job details">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {loading && (
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-200">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading complete job details...
            </div>
          )}

          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400">
              <Building2 className="h-4 w-4 text-blue-500 dark:text-blue-300" />
              <span className="truncate">{job.company || 'Company not specified'}</span>
            </p>
            <h2 className="mt-2 text-2xl font-bold leading-tight text-slate-950 sm:text-3xl dark:text-slate-50">{job.title || 'Job Post'}</h2>
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
                <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-700 dark:text-slate-300">{job.description || 'No description provided yet.'}</p>
              </section>

              {hasDisplayValue(job.qualifications) && (
                <section>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Qualifications</h3>
                  <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-700 dark:text-slate-300">{job.qualifications}</p>
                </section>
              )}

              {hasDisplayValue(job.required_skills) && (
                <section>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Required Skills</h3>
                  <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-700 dark:text-slate-300">{job.required_skills}</p>
                </section>
              )}
            </div>

            <aside className="space-y-4 rounded-[24px] border border-slate-200 bg-[#fafbff] p-4 dark:border-slate-700 dark:bg-slate-950/60">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">How to Apply</h3>
                {hasApplyDetails ? (
                  <div className="mt-3 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                    {job.contact_email && (
                      <a href={`mailto:${job.contact_email}`} className="flex min-w-0 items-center gap-2 font-medium text-blue-700 hover:underline dark:text-blue-300">
                        <Mail className="h-4 w-4 shrink-0" />
                        <span className="truncate">{job.contact_email}</span>
                      </a>
                    )}
                    {applicationLink && (
                      <a href={applicationLink} target="_blank" rel="noreferrer" className="flex items-center gap-2 font-medium text-blue-700 hover:underline dark:text-blue-300">
                        <FileText className="h-4 w-4" />
                        Open application link
                      </a>
                    )}
                    {requirementsLink && (
                      <a href={requirementsLink} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 font-medium text-blue-700 hover:underline dark:text-blue-300">
                        <FileText className="h-4 w-4 shrink-0" />
                        <span className="truncate">{job.requirements_file_name || 'Requirements file'}</span>
                      </a>
                    )}
                    {job.application_method && <p className="whitespace-pre-line leading-6">{job.application_method}</p>}
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
          aria-label={`Open ${item.original_name || post.title}`}
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
              alt={item.original_name || post.title}
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
  onOpenProfile,
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
  onOpenProfile: (graduateId?: number | null) => void;
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
        <div className="relative flex min-h-0 cursor-zoom-out items-center justify-center overflow-hidden px-4 py-20" onClick={onClose}>
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
              alt={current.original_name || viewer.post.title}
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

        <aside className="hidden min-h-0 border-l border-white/10 bg-white text-slate-900 lg:flex lg:flex-col">
          <div className="border-b border-slate-200 px-5 py-5">
            <button type="button" onClick={() => onOpenProfile(viewer.post.graduate_id)} className="text-left text-sm font-semibold text-slate-900 transition hover:text-blue-700">
              {viewer.post.author_name}
            </button>
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
                        <button type="button" onClick={() => onOpenProfile(comment.graduate_id)} className="shrink-0" aria-label={`Open ${comment.commenter_name} profile`}>
                          <Avatar src={resolveAssetUrl(comment.commenter_profile_image_path)} label={comment.commenter_name} size="sm" />
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => onOpenProfile(comment.graduate_id)} className="text-left text-sm font-semibold text-slate-900 transition hover:text-blue-700">{comment.commenter_name}</button>
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
