import { FormEvent, KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  ImageOff,
  Info,
  LogOut,
  Loader2,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  Smile,
  Upload,
  Users,
  X,
} from 'lucide-react';
import type {
  MessageAttachment,
  ConversationInformation,
  MessagingMessage,
  MessagingParticipant,
  MessagingRoom,
  SelectedAttachment,
} from './types';
import type { RealtimeChatStatus } from '../../services/realtimeChat';
import ProfileAvatar from '../ProfileAvatar';

interface CurrentGraduate {
  graduate_id: number;
  full_name: string;
  profile_image_path?: string | null;
  program_code?: string | null;
  program_name?: string | null;
}

interface RealtimeMessagingWorkspaceProps {
  currentGraduate: CurrentGraduate;
  rooms: MessagingRoom[];
  selectedRoomId: number | null;
  activeRoom: MessagingRoom | null;
  messages: MessagingMessage[];
  search: string;
  draft: string;
  roomLoading: boolean;
  initialLoading: boolean;
  connectionStatus: RealtimeChatStatus;
  loadingOlder: boolean;
  hasMoreOlder: boolean;
  typingNames: string[];
  selectedAttachment: SelectedAttachment | null;
  newMessageAvailable: boolean;
  mobileChatOpen: boolean;
  resolveAssetUrl: (path?: string | null) => string;
  onSearchChange: (value: string) => void;
  onSelectRoom: (roomId: number) => void;
  onBackToList: () => void;
  onDraftChange: (value: string) => void;
  onTypingStop: () => void;
  onSend: (event?: FormEvent<HTMLFormElement>) => void;
  onRetryMessage: (message: MessagingMessage) => void;
  onLoadOlder: () => Promise<void> | void;
  onNearBottomChange: (nearBottom: boolean) => void;
  onScrollToNewest: () => void;
  onAttachmentSelected: (file: File) => void;
  onRemoveAttachment: () => void;
  onRetryAttachment: () => void;
  onOpenNewConversation: () => void;
  onOpenProfile?: (graduateId?: number | null) => void;
  conversationInfoOpen: boolean;
  conversationInfo: ConversationInformation | null;
  conversationInfoLoading: boolean;
  conversationActionLoading: boolean;
  onToggleConversationInfo: () => void;
  onCloseConversationInfo: () => void;
  onBlockToggle: () => void;
  onLeaveGroup: () => void;
  onGroupPhotoSelected: (file: File) => void;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isSameDay(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
}

function formatMessageDate(value?: string | null) {
  const parsed = parseDate(value);
  if (!parsed) return 'Unknown';

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(parsed, today)) return 'Today';
  if (isSameDay(parsed, yesterday)) return 'Yesterday';

  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: parsed.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

function formatShortTime(value?: string | null) {
  const parsed = parseDate(value);
  if (!parsed) return '';

  return parsed.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatConversationTime(value?: string | null) {
  const parsed = parseDate(value);
  if (!parsed) return '';

  const today = new Date();
  const yesterday = new Date();

  if (isSameDay(parsed, today)) return formatShortTime(value);
  yesterday.setDate(today.getDate() - 1);
  if (isSameDay(parsed, yesterday)) return 'Yesterday';

  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function formatLastActiveTime(value?: string | null) {
  const parsed = parseDate(value);
  if (!parsed) return '';

  const seconds = Math.max(0, Math.floor((Date.now() - parsed.getTime()) / 1000));
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(parsed, yesterday)) return `yesterday at ${formatShortTime(value)}`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;

  return `${parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: parsed.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })} at ${formatShortTime(value)}`;
}

function formatBytes(value?: number | null) {
  if (!value || value <= 0) return '';
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function getOtherParticipants(room: MessagingRoom, currentGraduateId: number) {
  return room.participants.filter((participant) => participant.graduate_id !== currentGraduateId);
}

function getRoomLabel(room: MessagingRoom, currentGraduateId: number) {
  if (room.is_group) return room.name?.trim() || 'Group Chat';
  return getOtherParticipants(room, currentGraduateId)[0]?.full_name || 'Direct Chat';
}

function getRoomAvatar(room: MessagingRoom, currentGraduateId: number) {
  if (room.is_group && room.group_image_url) return room.group_image_url;
  const participant = getOtherParticipants(room, currentGraduateId)[0] || room.participants[0];
  return participant?.profile_image_path || null;
}

function getRecipient(room: MessagingRoom | null, currentGraduateId: number) {
  if (!room) return null;
  return getOtherParticipants(room, currentGraduateId)[0] || room.participants[0] || null;
}

function getPresenceLabel(participant: MessagingParticipant | null) {
  if (!participant) return 'Offline';
  if (participant.is_online) return 'Online';
  const lastActive = parseDate(participant.last_active_at);
  if (!lastActive) return 'Offline';
  return `Last active ${formatLastActiveTime(participant.last_active_at)}`;
}

function PresenceText({ participant }: { participant?: MessagingParticipant | null }) {
  const [, updateClock] = useState(0);

  useEffect(() => {
    if (!participant?.last_active_at || participant.is_online) return undefined;
    const interval = window.setInterval(() => updateClock((current) => current + 1), 30000);
    return () => window.clearInterval(interval);
  }, [participant?.is_online, participant?.last_active_at]);

  return <>{getPresenceLabel(participant || null)}</>;
}

function safePreview(value?: string | null) {
  const clean = (value || '').replace(/\s+/g, ' ').trim();
  return clean || 'No messages yet';
}

function Avatar({
  src,
  label,
  size = 'md',
  resolveAssetUrl,
}: {
  src?: string | null;
  label?: string | null;
  size?: 'sm' | 'md' | 'lg';
  resolveAssetUrl: (path?: string | null) => string;
}) {
  const className = size === 'sm' ? 'h-10 w-10 text-xs' : size === 'lg' ? 'h-12 w-12 text-base' : 'h-11 w-11 text-sm';
  return (
    <ProfileAvatar
      src={src}
      label={label}
      resolveUrl={resolveAssetUrl}
      imageClassName={`${className} shrink-0 rounded-full object-cover`}
      fallbackClassName={`${className} flex shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-200`}
    />
  );
}

function ConversationItem({
  room,
  active,
  currentGraduateId,
  resolveAssetUrl,
  onSelect,
  onOpenProfile,
}: {
  room: MessagingRoom;
  active: boolean;
  currentGraduateId: number;
  resolveAssetUrl: (path?: string | null) => string;
  onSelect: () => void;
  onOpenProfile?: (graduateId?: number | null) => void;
}) {
  const label = getRoomLabel(room, currentGraduateId);
  const recipient = getRecipient(room, currentGraduateId);
  const unread = Math.max(0, Number(room.unread_count || 0));
  const canOpenRecipient = !room.is_group && !!recipient?.graduate_id && recipient.graduate_id !== currentGraduateId;
  const handleIdentityClick = () => {
    if (canOpenRecipient && onOpenProfile) {
      onOpenProfile(recipient?.graduate_id);
      return;
    }

    onSelect();
  };

  return (
    <div
      className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-3 py-3 text-left transition ${
        active
          ? 'border-blue-200 bg-blue-50 shadow-sm'
          : 'border-transparent bg-white hover:border-slate-200 hover:bg-slate-50'
      }`}
      aria-current={active ? 'true' : undefined}
    >
      <button type="button" onClick={handleIdentityClick} className="relative shrink-0" aria-label={canOpenRecipient ? `Open ${label} profile` : `Open ${label}`}>
        <Avatar src={getRoomAvatar(room, currentGraduateId)} label={label} size="sm" resolveAssetUrl={resolveAssetUrl} />
        {room.is_group
          ? <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-blue-700 text-white"><Users className="h-2.5 w-2.5" /></span>
          : recipient?.is_online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />}
      </button>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={handleIdentityClick} className={`truncate text-left text-sm text-slate-900 transition hover:text-blue-700 ${unread > 0 ? 'font-bold' : 'font-semibold'}`}>{label}</button>
        </div>
        <button type="button" onClick={onSelect} className={`mt-0.5 block w-full truncate text-left text-xs ${unread > 0 ? 'font-bold text-slate-800' : 'text-slate-500'}`}>{safePreview(room.last_message)}</button>
      </div>

      <button type="button" onClick={onSelect} className="flex flex-col items-end gap-2 text-right">
        <span className="text-[11px] font-semibold text-slate-400">{formatConversationTime(room.last_message_at || room.updated_at)}</span>
        {unread > 0 && (
          <span className="min-w-5 rounded-full bg-blue-700 px-1.5 py-0.5 text-center text-[11px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </div>
  );
}

function ConversationList({
  currentGraduate,
  rooms,
  selectedRoomId,
  search,
  initialLoading,
  resolveAssetUrl,
  onSearchChange,
  onSelectRoom,
  onOpenNewConversation,
  onOpenProfile,
}: {
  currentGraduate: CurrentGraduate;
  rooms: MessagingRoom[];
  selectedRoomId: number | null;
  search: string;
  initialLoading: boolean;
  resolveAssetUrl: (path?: string | null) => string;
  onSearchChange: (value: string) => void;
  onSelectRoom: (roomId: number) => void;
  onOpenNewConversation: () => void;
  onOpenProfile?: (graduateId?: number | null) => void;
}) {
  const query = search.trim().toLowerCase();
  const filteredRooms = useMemo(() => {
    if (!query) return rooms;
    return rooms.filter((room) => {
      const haystack = [
        getRoomLabel(room, currentGraduate.graduate_id),
        room.last_message,
        ...room.participants.map((participant) => participant.full_name),
      ].join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }, [currentGraduate.graduate_id, query, rooms]);

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-slate-200 bg-[#f8fafc]">
      <div className="border-b border-slate-200 px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar src={currentGraduate.profile_image_path} label={currentGraduate.full_name} size="md" resolveAssetUrl={resolveAssetUrl} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">{currentGraduate.full_name}</p>
            <p className="truncate text-xs text-slate-500">{currentGraduate.program_code || currentGraduate.program_name || 'Graduate'}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <label className="relative block min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search conversations"
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-10 text-sm outline-none transition focus:border-blue-500"
              aria-label="Search conversations"
            />
          </label>
          <button
            type="button"
            onClick={onOpenNewConversation}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-700 px-3 text-sm font-bold text-white transition hover:bg-blue-800"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Message</span>
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {initialLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-lg bg-white px-3 py-3">
                <div className="h-10 w-10 animate-pulse rounded-full bg-slate-200" />
                <div className="space-y-2">
                  <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
                  <div className="h-3 w-full animate-pulse rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
            {rooms.length === 0 ? 'No conversations yet.' : 'No conversations match your search.'}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredRooms.map((room) => (
              <ConversationItem
                key={room.id}
                room={room}
                active={selectedRoomId === room.id}
                currentGraduateId={currentGraduate.graduate_id}
                resolveAssetUrl={resolveAssetUrl}
                onSelect={() => onSelectRoom(room.id)}
                onOpenProfile={onOpenProfile}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function ChatHeader({
  room,
  currentGraduateId,
  resolveAssetUrl,
  onBack,
  onOpenProfile,
  onOpenInfo,
  infoOpen = false,
}: {
  room: MessagingRoom | null;
  currentGraduateId: number;
  resolveAssetUrl: (path?: string | null) => string;
  onBack: () => void;
  onOpenProfile?: (graduateId?: number | null) => void;
  onOpenInfo?: () => void;
  infoOpen?: boolean;
}) {
  const recipient = getRecipient(room, currentGraduateId);
  const label = room ? getRoomLabel(room, currentGraduateId) : 'Select a conversation';
  const canOpenRecipient = !!room && !room.is_group && !!recipient?.graduate_id && recipient.graduate_id !== currentGraduateId;
  const handleIdentityClick = () => {
    if (canOpenRecipient && onOpenProfile) {
      onOpenProfile(recipient?.graduate_id);
    }
  };

  return (
    <header className="flex min-h-[76px] items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
      <button type="button" onClick={onBack} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Back to conversations">
        <ArrowLeft className="h-5 w-5" />
      </button>
      {room ? (
        <>
          <button type="button" onClick={handleIdentityClick} disabled={!canOpenRecipient} className="relative shrink-0 disabled:cursor-default" aria-label={canOpenRecipient ? `Open ${label} profile` : undefined}>
            <Avatar src={getRoomAvatar(room, currentGraduateId)} label={label} size="lg" resolveAssetUrl={resolveAssetUrl} />
            {room.is_group
              ? <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-blue-700 text-white"><Users className="h-3 w-3" /></span>
              : recipient?.is_online && <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />}
          </button>
          <div className="min-w-0">
            <button type="button" onClick={handleIdentityClick} disabled={!canOpenRecipient} className="max-w-full truncate text-left text-base font-bold text-slate-900 transition hover:text-blue-700 disabled:cursor-default disabled:hover:text-slate-900">{label}</button>
            <p className="truncate text-xs font-semibold text-slate-500">
              {room.is_group ? `${room.participant_count} member${room.participant_count === 1 ? '' : 's'}` : <PresenceText participant={recipient} />}
            </p>
          </div>
          {onOpenInfo && (
            <button
              type="button"
              onClick={onOpenInfo}
              className={`ml-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${infoOpen ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-100 hover:text-blue-700'}`}
              aria-label="Conversation information"
              title="Conversation information"
              aria-pressed={infoOpen}
            >
              <Info className="h-5 w-5" />
            </button>
          )}
        </>
      ) : (
        <div>
          <p className="text-base font-bold text-slate-900">{label}</p>
          <p className="text-xs text-slate-500">Your messages will appear here.</p>
        </div>
      )}
    </header>
  );
}

function StatusIcon({ message }: { message: MessagingMessage }) {
  if (message.status === 'failed') {
    return <AlertCircle className="h-3.5 w-3.5" aria-label="Failed" />;
  }
  if (message.status === 'sending') {
    return <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Sending" />;
  }
  if (message.read_at || message.status === 'read') {
    return <CheckCheck className="h-3.5 w-3.5 text-emerald-300" aria-label="Read" />;
  }
  if (message.delivered_at || message.status === 'delivered') {
    return <CheckCheck className="h-3.5 w-3.5" aria-label="Delivered" />;
  }
  return <Check className="h-3.5 w-3.5" aria-label="Sent" />;
}

function AttachmentTile({
  attachment,
  resolveAssetUrl,
  onImageOpen,
}: {
  attachment: MessageAttachment;
  resolveAssetUrl: (path?: string | null) => string;
  onImageOpen: (attachment: MessageAttachment) => void;
}) {
  const url = resolveAssetUrl(attachment.url);
  const downloadUrl = resolveAssetUrl(attachment.download_url);
  const [imageFailed, setImageFailed] = useState(false);

  if (attachment.attachment_type === 'image') {
    if (imageFailed || !url) {
      return (
        <div className="flex h-32 w-56 max-w-[78vw] flex-col items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-4 text-center text-xs font-semibold text-slate-500" role="img" aria-label={`${attachment.original_name} could not be loaded`}>
          <ImageOff className="h-7 w-7" />
          <span>Image unavailable</span>
        </div>
      );
    }

    return (
      <button type="button" onClick={() => onImageOpen(attachment)} className="block max-w-[78vw] overflow-hidden rounded-lg border border-slate-200 bg-white p-1 text-left shadow-sm transition hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:max-w-sm" aria-label={`Open ${attachment.original_name}`}>
        <img
          src={url}
          alt={attachment.original_name}
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
          className="block h-auto max-h-72 w-auto max-w-full rounded-md object-contain"
        />
      </button>
    );
  }

  return (
    <a href={downloadUrl} className="flex w-72 max-w-[78vw] items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-slate-700 shadow-sm transition hover:border-blue-300 hover:bg-slate-50" download>
      <FileText className="h-5 w-5 shrink-0 text-blue-700" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{attachment.original_name}</span>
        <span className="block text-xs text-slate-500">{attachment.mime_type} {formatBytes(attachment.file_size)}</span>
      </span>
      <Download className="h-4 w-4 shrink-0" />
    </a>
  );
}

function MessageBubble({
  message,
  resolveAssetUrl,
  onRetry,
  onImageOpen,
  onOpenProfile,
}: {
  message: MessagingMessage;
  resolveAssetUrl: (path?: string | null) => string;
  onRetry: (message: MessagingMessage) => void;
  onImageOpen: (attachment: MessageAttachment) => void;
  onOpenProfile?: (graduateId?: number | null) => void;
}) {
  const isMine = message.is_mine;
  const attachments = message.attachments || [];
  const hasText = message.message.trim().length > 0;
  const metadataClass = isMine ? 'justify-end text-slate-500' : 'text-slate-400';

  const senderLink = !isMine ? (
    <button type="button" onClick={() => onOpenProfile?.(message.graduate_id)} className="mb-1 block text-left text-xs font-bold text-slate-500 transition hover:text-blue-700">
      {message.sender_name}
    </button>
  ) : null;

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[82%] flex-col gap-2 sm:max-w-[72%] ${isMine ? 'items-end' : 'items-start'}`}>
        {hasText && (
          <div className={`rounded-lg px-4 py-3 text-sm shadow-sm ${
            isMine
              ? message.status === 'failed'
                ? 'border border-rose-200 bg-rose-50 text-rose-800'
                : 'bg-blue-700 text-white'
              : 'border border-slate-200 bg-white text-slate-800'
          }`}>
            {senderLink}
            <p className="whitespace-pre-wrap break-words leading-6">{message.message}</p>
            <div className={`mt-2 flex items-center gap-1 text-[11px] ${isMine ? 'justify-end text-blue-100' : 'text-slate-400'}`}>
              <span>{formatShortTime(message.created_at)}</span>
              {isMine && <StatusIcon message={message} />}
            </div>
          </div>
        )}

        {attachments.map((attachment, index) => (
          <div key={attachment.id} className={`flex max-w-full flex-col ${isMine ? 'items-end' : 'items-start'}`}>
            {!hasText && index === 0 && senderLink}
            <AttachmentTile attachment={attachment} resolveAssetUrl={resolveAssetUrl} onImageOpen={onImageOpen} />
            <div className={`mt-1 flex items-center gap-1 px-1 text-[11px] ${metadataClass}`}>
              <span>{formatShortTime(message.created_at)}</span>
              {isMine && <StatusIcon message={message} />}
            </div>
          </div>
        ))}

        {message.status === 'failed' && (
          <button type="button" onClick={() => onRetry(message)} className="mt-1 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-rose-700 hover:bg-rose-50">
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

function TypingIndicator({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  const label = names.length === 1 ? `${names[0]} is typing...` : 'Several people are typing...';

  return (
    <div className="flex justify-start">
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
        <div className="flex items-center gap-2">
          <span>{label}</span>
          <span className="typing-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </div>
      </div>
    </div>
  );
}

function MessageList({
  room,
  messages,
  loading,
  loadingOlder,
  hasMoreOlder,
  typingNames,
  newMessageAvailable,
  resolveAssetUrl,
  onRetryMessage,
  onLoadOlder,
  onNearBottomChange,
  onScrollToNewest,
  onImageOpen,
  onOpenProfile,
}: {
  room: MessagingRoom | null;
  messages: MessagingMessage[];
  loading: boolean;
  loadingOlder: boolean;
  hasMoreOlder: boolean;
  typingNames: string[];
  newMessageAvailable: boolean;
  resolveAssetUrl: (path?: string | null) => string;
  onRetryMessage: (message: MessagingMessage) => void;
  onLoadOlder: () => Promise<void> | void;
  onNearBottomChange: (nearBottom: boolean) => void;
  onScrollToNewest: () => void;
  onImageOpen: (attachment: MessageAttachment) => void;
  onOpenProfile?: (graduateId?: number | null) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const preserveScrollRef = useRef<{ height: number; top: number } | null>(null);
  const positionedRoomRef = useRef<number | null>(null);
  const stickToBottomRef = useRef(true);
  const resizeFrameRef = useRef<number | null>(null);

  const items = useMemo(() => {
    const output: Array<{ type: 'date'; id: string; label: string } | { type: 'message'; id: string; message: MessagingMessage }> = [];
    let lastDate = '';

    messages.forEach((message) => {
      const label = formatMessageDate(message.created_at);
      if (label !== lastDate) {
        output.push({ type: 'date', id: `date-${message.id}-${label}`, label });
        lastDate = label;
      }
      output.push({ type: 'message', id: `message-${message.client_message_id || message.id}`, message });
    });

    return output;
  }, [messages]);

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 96;
    stickToBottomRef.current = nearBottom;
    onNearBottomChange(nearBottom);

    if (element.scrollTop < 48 && hasMoreOlder && !loadingOlder) {
      void handleLoadOlder();
    }
  };

  const handleLoadOlder = async () => {
    const element = scrollRef.current;
    if (!element || loadingOlder) return;
    preserveScrollRef.current = { height: element.scrollHeight, top: element.scrollTop };
    await onLoadOlder();
  };

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    onNearBottomChange(element.scrollHeight - element.scrollTop - element.clientHeight < 96);
  }, [messages.length, onNearBottomChange]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!room) {
      positionedRoomRef.current = null;
      stickToBottomRef.current = true;
      return undefined;
    }

    if (positionedRoomRef.current !== room.id) {
      stickToBottomRef.current = true;
    }
    if (!element || loading) return undefined;

    // Initial smooth scrolling can be interrupted by rerenders or image
    // decoding. Position synchronously, then confirm after browser layout.
    element.scrollTop = element.scrollHeight;
    positionedRoomRef.current = room.id;
    stickToBottomRef.current = true;
    onNearBottomChange(true);

    const frame = window.requestAnimationFrame(() => {
      if (scrollRef.current && positionedRoomRef.current === room.id) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading, onNearBottomChange, room?.id]);

  useEffect(() => {
    const element = scrollRef.current;
    const content = contentRef.current;
    if (!element || !content || !room || loading || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(() => {
      if (!stickToBottomRef.current || positionedRoomRef.current !== room.id) return;
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
      }
      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        if (scrollRef.current && stickToBottomRef.current && positionedRoomRef.current === room.id) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    });
    observer.observe(content);

    return () => {
      observer.disconnect();
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
    };
  }, [loading, room?.id]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const preserved = preserveScrollRef.current;
    if (preserved) {
      requestAnimationFrame(() => {
        element.scrollTop = element.scrollHeight - preserved.height + preserved.top;
        preserveScrollRef.current = null;
      });
      return;
    }

    if (!newMessageAvailable && stickToBottomRef.current && positionedRoomRef.current === room?.id) {
      requestAnimationFrame(() => {
        element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
      });
    }
  }, [messages.length, newMessageAvailable, room?.id]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || typingNames.length === 0) return;

    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distanceFromBottom < 160) {
      stickToBottomRef.current = true;
      requestAnimationFrame(() => {
        element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
      });
    }
  }, [typingNames.length]);

  return (
    <div className="relative min-h-0 flex-1 bg-[#f8fafc]">
      <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto px-4 py-5">
        <div ref={contentRef} className="min-h-full">
          {loading ? (
            <div className="space-y-4">
            {[0, 1, 2].map((item) => (
              <div key={item} className={`flex ${item % 2 ? 'justify-end' : 'justify-start'}`}>
                <div className="h-16 w-2/3 animate-pulse rounded-lg bg-slate-200" />
              </div>
            ))}
            </div>
          ) : !room ? (
            <div className="flex min-h-full items-center justify-center px-6 text-center text-sm text-slate-500">
              Pick a conversation to read and send messages.
            </div>
          ) : messages.length === 0 ? (
            <div className="flex min-h-full flex-col justify-center gap-4 px-6">
              <div className="rounded-lg border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-sm text-slate-500">
                No messages yet. Say hello and start the conversation.
              </div>
              <TypingIndicator names={typingNames} />
            </div>
          ) : (
            <div className="space-y-4">
              {hasMoreOlder && (
                <div className="flex justify-center">
                  <button type="button" onClick={() => void handleLoadOlder()} disabled={loadingOlder} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60">
                    {loadingOlder && <Loader2 className="h-3 w-3 animate-spin" />}
                    Load older
                  </button>
                </div>
              )}
              {items.map((item) => item.type === 'date' ? (
                <div key={item.id} className="flex justify-center">
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-500 shadow-sm">{item.label}</span>
                </div>
              ) : (
                <MessageBubble key={item.id} message={item.message} resolveAssetUrl={resolveAssetUrl} onRetry={onRetryMessage} onImageOpen={onImageOpen} onOpenProfile={onOpenProfile} />
              ))}
              <TypingIndicator names={typingNames} />
            </div>
          )}
        </div>
      </div>

      {newMessageAvailable && (
        <button
          type="button"
          onClick={() => {
            const element = scrollRef.current;
            if (element) {
              stickToBottomRef.current = true;
              element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
            }
            onScrollToNewest();
          }}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-blue-700 px-4 py-2 text-xs font-bold text-white shadow-lg hover:bg-blue-800"
        >
          New messages
        </button>
      )}
    </div>
  );
}

function AttachmentPreview({
  attachment,
  onRemove,
  onRetry,
}: {
  attachment: SelectedAttachment;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const isImage = attachment.file.type.startsWith('image/') && attachment.preview_url;

  return (
    <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start gap-3">
        {isImage ? (
          <img src={attachment.preview_url} alt={attachment.file.name} className="h-16 w-16 rounded-lg object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-white text-blue-700">
            <FileText className="h-7 w-7" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-900">{attachment.file.name}</p>
          <p className="text-xs text-slate-500">{attachment.file.type || 'File'} {formatBytes(attachment.file.size)}</p>
          {attachment.status === 'uploading' && (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-blue-700 transition-all" style={{ width: `${attachment.progress}%` }} />
            </div>
          )}
          {attachment.status === 'failed' && (
            <p className="mt-1 text-xs font-semibold text-rose-700">{attachment.error || 'Upload failed'}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          {attachment.status === 'failed' && (
            <button type="button" onClick={onRetry} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-rose-700 hover:bg-rose-50" aria-label="Retry attachment upload" title="Retry upload">
              <RefreshCw className="h-4 w-4" />
            </button>
          )}
          <button type="button" onClick={onRemove} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Remove attachment" title="Remove attachment">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageComposer({
  draft,
  disabled,
  selectedAttachment,
  onDraftChange,
  onTypingStop,
  onSend,
  onAttachmentSelected,
  onRemoveAttachment,
  onRetryAttachment,
  disabledReason,
}: {
  draft: string;
  disabled: boolean;
  selectedAttachment: SelectedAttachment | null;
  onDraftChange: (value: string) => void;
  onTypingStop?: () => void;
  onSend: (event?: FormEvent<HTMLFormElement>) => void;
  onAttachmentSelected: (file: File) => void;
  onRemoveAttachment: () => void;
  onRetryAttachment: () => void;
  disabledReason?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const showEmojiButton = draft.length === 0;
  const canSend = !disabled
    && selectedAttachment?.status !== 'uploading'
    && (draft.trim().length > 0 || !!selectedAttachment);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const adjustHeight = () => {
      const styles = window.getComputedStyle(textarea);
      const lineHeight = Number.parseFloat(styles.lineHeight) || 20;
      const paddingY = (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0);
      const borderY = (Number.parseFloat(styles.borderTopWidth) || 0) + (Number.parseFloat(styles.borderBottomWidth) || 0);
      const maxHeight = (lineHeight * 10) + paddingY + borderY;

      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
      textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
    };

    adjustHeight();
    window.addEventListener('resize', adjustHeight);
    return () => window.removeEventListener('resize', adjustHeight);
  }, [draft]);

  const selectFile = (file?: File) => {
    if (!file) return;
    onAttachmentSelected(file);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (canSend) onSend();
    }
  };

  return (
    <form
      onSubmit={(event) => onSend(event)}
      onDragOver={(event) => {
        event.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        selectFile(event.dataTransfer.files?.[0]);
      }}
      className={`border-t border-slate-200 bg-white p-4 ${dragActive ? 'ring-2 ring-inset ring-blue-300' : ''}`}
    >
      {selectedAttachment && (
        <AttachmentPreview attachment={selectedAttachment} onRemove={onRemoveAttachment} onRetry={onRetryAttachment} />
      )}

      <div className="flex items-end gap-2">
        {showEmojiButton && (
          <button
            type="button"
            onClick={() => onDraftChange(`${draft}🙂`)}
            disabled={disabled}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Insert emoji"
            title="Emoji"
          >
            <Smile className="h-5 w-5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Attach file"
          title="Attachment"
        >
          <Paperclip className="h-5 w-5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,image/jpeg,image/png,image/webp,application/pdf,text/plain,text/csv"
          onChange={(event) => {
            selectFile(event.target.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
        <textarea
          ref={textareaRef}
          value={draft}
          disabled={disabled}
          onChange={(event) => onDraftChange(event.target.value)}
          onBlur={onTypingStop}
          onKeyDown={handleKeyDown}
          rows={1}
          maxLength={5000}
          placeholder={disabledReason || 'Type a message'}
          className="max-h-[14.25rem] min-h-11 flex-1 resize-none rounded-lg border border-slate-200 bg-[#f8fafc] px-4 py-3 text-sm leading-5 outline-none transition focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Message"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-700 text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Send message"
          title="Send"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>
    </form>
  );
}

function ImagePreviewModal({
  attachment,
  resolveAssetUrl,
  onClose,
}: {
  attachment: MessageAttachment;
  resolveAssetUrl: (path?: string | null) => string;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCloseRef.current();
    };
    const handleNavigation = () => onCloseRef.current();

    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('popstate', handleNavigation);
    window.addEventListener('pagehide', handleNavigation);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handleNavigation);
      window.removeEventListener('pagehide', handleNavigation);
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.paddingRight = previousBodyPaddingRight;
      previousFocus?.focus();
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/85 px-3 py-16 backdrop-blur-sm sm:px-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Image preview: ${attachment.original_name}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button
        ref={closeButtonRef}
        type="button"
        onClick={onClose}
        className="fixed right-3 top-3 z-[101] inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/40 bg-black/70 text-white shadow-xl transition hover:bg-white hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-white sm:right-6 sm:top-6"
        aria-label="Close image preview"
        title="Close (Esc)"
      >
        <X className="h-7 w-7" />
      </button>

      <div className="flex max-h-full w-full max-w-6xl flex-col items-center" onClick={(event) => event.stopPropagation()}>
        {imageFailed ? (
          <div className="flex h-72 w-full max-w-xl flex-col items-center justify-center gap-3 rounded-xl border border-white/20 bg-white/10 px-6 text-center text-white">
            <ImageOff className="h-10 w-10" />
            <p className="font-semibold">This image could not be loaded.</p>
          </div>
        ) : (
          <img
            src={resolveAssetUrl(attachment.url)}
            alt={attachment.original_name}
            onError={() => setImageFailed(true)}
            className="block h-auto max-h-[calc(100vh-10rem)] w-auto max-w-full rounded-xl object-contain shadow-2xl"
          />
        )}
        <div className="mt-3 flex w-full max-w-5xl flex-col items-stretch justify-between gap-3 text-sm text-white sm:flex-row sm:items-center">
          <span className="min-w-0 truncate text-center sm:text-left">{attachment.original_name}</span>
          <a href={resolveAssetUrl(attachment.download_url)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-3 py-2 font-bold text-slate-900 transition hover:bg-slate-100" download>
            <Download className="h-4 w-4" />
            Download
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ConversationInfoPanel({
  info,
  loading,
  actionLoading,
  currentGraduateId,
  resolveAssetUrl,
  onClose,
  onImageOpen,
  onOpenProfile,
  onBlockToggle,
  onLeaveGroup,
  onGroupPhotoSelected,
}: {
  info: ConversationInformation | null;
  loading: boolean;
  actionLoading: boolean;
  currentGraduateId: number;
  resolveAssetUrl: (path?: string | null) => string;
  onClose: () => void;
  onImageOpen: (attachment: MessageAttachment) => void;
  onOpenProfile?: (graduateId?: number | null) => void;
  onBlockToggle: () => void;
  onLeaveGroup: () => void;
  onGroupPhotoSelected: (file: File) => void;
}) {
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [photosOpen, setPhotosOpen] = useState(true);
  const [filesOpen, setFilesOpen] = useState(true);
  const room = info?.room || null;
  const recipient = getRecipient(room, currentGraduateId);
  const label = room ? getRoomLabel(room, currentGraduateId) : 'Conversation information';
  const avatar = room ? getRoomAvatar(room, currentGraduateId) : null;

  return (
    <aside className="absolute inset-0 z-20 flex min-h-0 flex-col border-l border-slate-200 bg-white shadow-xl xl:static xl:z-auto xl:shadow-none" aria-label="Conversation information">
      <div className="flex min-h-[76px] items-center justify-between border-b border-slate-200 px-4">
        <h2 className="font-bold text-slate-900">Conversation Information</h2>
        <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="Close conversation information">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {loading || !info || !room ? (
          <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-blue-700" /></div>
        ) : (
          <div className="space-y-5">
            <div className="text-center">
              <button type="button" onClick={() => !room.is_group && onOpenProfile?.(recipient?.graduate_id)} disabled={room.is_group || !recipient} className="relative mx-auto block disabled:cursor-default">
                <Avatar src={avatar} label={label} size="lg" resolveAssetUrl={resolveAssetUrl} />
              </button>
              <h3 className="mt-3 truncate text-lg font-bold text-slate-900">{label}</h3>
              <p className="text-sm text-slate-500">
                {room.is_group
                  ? `${room.participant_count} member${room.participant_count === 1 ? '' : 's'}`
                  : recipient?.program_code || 'Graduate'}
              </p>
              {!room.is_group && info.block?.blocked && (
                <span className="mt-3 inline-flex rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">
                  {info.block.blocked_by_me ? 'You blocked this graduate' : 'Messaging is unavailable'}
                </span>
              )}
            </div>

            <section className="border-t border-slate-200 pt-4">
              <button type="button" onClick={() => setPhotosOpen((open) => !open)} className="flex w-full items-center justify-between py-2 text-left font-bold text-slate-900" aria-expanded={photosOpen}>
                <span>Photos <span className="font-medium text-slate-400">({info.photos.length})</span></span>
                {photosOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              {photosOpen && (info.photos.length === 0 ? (
                <p className="py-3 text-sm text-slate-500">No photos shared in this conversation.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 py-2">
                  {info.photos.map((photo) => (
                    <button key={photo.id} type="button" onClick={() => onImageOpen(photo)} className="aspect-square overflow-hidden rounded-lg bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" title={photo.original_name}>
                      <img src={resolveAssetUrl(photo.url)} alt={photo.original_name} className="h-full w-full object-cover" loading="lazy" />
                    </button>
                  ))}
                </div>
              ))}
            </section>

            <section className="border-t border-slate-200 pt-2">
              <button type="button" onClick={() => setFilesOpen((open) => !open)} className="flex w-full items-center justify-between py-2 text-left font-bold text-slate-900" aria-expanded={filesOpen}>
                <span>Files <span className="font-medium text-slate-400">({info.files.length})</span></span>
                {filesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              {filesOpen && (info.files.length === 0 ? (
                <p className="py-3 text-sm text-slate-500">No files shared in this conversation.</p>
              ) : (
                <div className="space-y-2 py-2">
                  {info.files.map((file) => (
                    <a key={file.id} href={resolveAssetUrl(file.download_url)} download className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 transition hover:bg-slate-50">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><FileText className="h-5 w-5" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-slate-900">{file.original_name}</span>
                        <span className="block truncate text-[11px] text-slate-500">{file.mime_type} {formatBytes(file.file_size)} · {formatMessageDate(file.created_at)}</span>
                      </span>
                      <Download className="h-4 w-4 shrink-0 text-slate-400" />
                    </a>
                  ))}
                </div>
              ))}
            </section>

            {room.is_group ? (
              <section className="space-y-2 border-t border-slate-200 pt-4">
                {info.permissions.can_change_group_photo && (
                  <>
                    <button type="button" onClick={() => photoInputRef.current?.click()} disabled={actionLoading} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left font-bold text-blue-700 transition hover:bg-blue-50 disabled:opacity-60">
                      <Upload className="h-5 w-5" /> Change Group Photo
                    </button>
                    <input ref={photoInputRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) onGroupPhotoSelected(file); event.currentTarget.value = ''; }} />
                  </>
                )}
                <button type="button" onClick={onLeaveGroup} disabled={actionLoading || !info.permissions.can_leave_group} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left font-bold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50" title={!info.permissions.can_leave_group ? 'The only remaining member cannot leave this group' : undefined}>
                  <LogOut className="h-5 w-5" /> Leave Group
                </button>
              </section>
            ) : (
              <section className="border-t border-slate-200 pt-4">
                {info.block?.blocked_by_other && !info.block.blocked_by_me ? (
                  <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600">You cannot send messages in this conversation.</p>
                ) : (
                  <button type="button" onClick={onBlockToggle} disabled={actionLoading} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60">
                    <Ban className="h-5 w-5" /> {info.block?.blocked_by_me ? 'Unblock' : 'Block'}
                  </button>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

export default function RealtimeMessagingWorkspace({
  currentGraduate,
  rooms,
  selectedRoomId,
  activeRoom,
  messages,
  search,
  draft,
  roomLoading,
  initialLoading,
  connectionStatus,
  loadingOlder,
  hasMoreOlder,
  typingNames,
  selectedAttachment,
  newMessageAvailable,
  mobileChatOpen,
  resolveAssetUrl,
  onSearchChange,
  onSelectRoom,
  onBackToList,
  onDraftChange,
  onTypingStop,
  onSend,
  onRetryMessage,
  onLoadOlder,
  onNearBottomChange,
  onScrollToNewest,
  onAttachmentSelected,
  onRemoveAttachment,
  onRetryAttachment,
  onOpenNewConversation,
  onOpenProfile,
  conversationInfoOpen,
  conversationInfo,
  conversationInfoLoading,
  conversationActionLoading,
  onToggleConversationInfo,
  onCloseConversationInfo,
  onBlockToggle,
  onLeaveGroup,
  onGroupPhotoSelected,
}: RealtimeMessagingWorkspaceProps) {
  const [previewAttachment, setPreviewAttachment] = useState<MessageAttachment | null>(null);

  useEffect(() => {
    setPreviewAttachment(null);
  }, [selectedRoomId]);

  return (
    <section className="gradtrack-messaging overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="grid h-[calc(100vh-170px)] min-h-[620px] grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className={`${mobileChatOpen ? 'hidden lg:block' : 'block'} min-h-0`}>
          <ConversationList
            currentGraduate={currentGraduate}
            rooms={rooms}
            selectedRoomId={selectedRoomId}
            search={search}
            initialLoading={initialLoading}
            resolveAssetUrl={resolveAssetUrl}
            onSearchChange={onSearchChange}
            onSelectRoom={onSelectRoom}
            onOpenNewConversation={onOpenNewConversation}
            onOpenProfile={onOpenProfile}
          />
        </div>

        <div className={`${mobileChatOpen ? 'grid' : 'hidden lg:grid'} relative min-h-0 grid-cols-1 bg-white ${conversationInfoOpen ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : ''}`}>
          <div className="flex min-h-0 min-w-0 flex-col">
          <ChatHeader room={activeRoom} currentGraduateId={currentGraduate.graduate_id} resolveAssetUrl={resolveAssetUrl} onBack={onBackToList} onOpenProfile={onOpenProfile} onOpenInfo={activeRoom ? onToggleConversationInfo : undefined} infoOpen={conversationInfoOpen} />
          {(connectionStatus === 'reconnecting' || connectionStatus === 'error') && (
            <div className="flex items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800" role="status">
              {connectionStatus === 'reconnecting' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {connectionStatus === 'reconnecting' ? 'Reconnecting...' : 'Realtime unavailable. Messages will sync automatically.'}
            </div>
          )}
          <MessageList
            room={activeRoom}
            messages={messages}
            loading={roomLoading}
            loadingOlder={loadingOlder}
            hasMoreOlder={hasMoreOlder}
            typingNames={typingNames}
            newMessageAvailable={newMessageAvailable}
            resolveAssetUrl={resolveAssetUrl}
            onRetryMessage={onRetryMessage}
            onLoadOlder={onLoadOlder}
            onNearBottomChange={onNearBottomChange}
            onScrollToNewest={onScrollToNewest}
            onImageOpen={setPreviewAttachment}
            onOpenProfile={onOpenProfile}
          />
          <MessageComposer
            draft={draft}
            disabled={!activeRoom || !!conversationInfo?.block?.blocked}
            disabledReason={conversationInfo?.block?.blocked ? 'Messaging is unavailable while this conversation is blocked' : undefined}
            selectedAttachment={selectedAttachment}
            onDraftChange={onDraftChange}
            onTypingStop={onTypingStop}
            onSend={onSend}
            onAttachmentSelected={onAttachmentSelected}
            onRemoveAttachment={onRemoveAttachment}
            onRetryAttachment={onRetryAttachment}
          />
          </div>
          {conversationInfoOpen && (
            <ConversationInfoPanel
              info={conversationInfo}
              loading={conversationInfoLoading}
              actionLoading={conversationActionLoading}
              currentGraduateId={currentGraduate.graduate_id}
              resolveAssetUrl={resolveAssetUrl}
              onClose={onCloseConversationInfo}
              onImageOpen={setPreviewAttachment}
              onOpenProfile={onOpenProfile}
              onBlockToggle={onBlockToggle}
              onLeaveGroup={onLeaveGroup}
              onGroupPhotoSelected={onGroupPhotoSelected}
            />
          )}
        </div>
      </div>

      {previewAttachment && (
        <ImagePreviewModal attachment={previewAttachment} resolveAssetUrl={resolveAssetUrl} onClose={() => setPreviewAttachment(null)} />
      )}
    </section>
  );
}

export {
  AttachmentPreview,
  ChatHeader,
  ConversationItem,
  ConversationList,
  ConversationInfoPanel,
  ImagePreviewModal,
  MessageBubble,
  MessageComposer,
  MessageList,
  PresenceText,
  TypingIndicator,
};
