import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCheck,
  Download,
  FileText,
  Loader2,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  Smile,
  X,
} from 'lucide-react';
import type {
  MessageAttachment,
  MessagingMessage,
  MessagingParticipant,
  MessagingRoom,
  SelectedAttachment,
} from './types';
import type { RealtimeChatStatus } from '../../services/realtimeChat';

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
  directory: MessagingParticipant[];
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
  newConversationOpen: boolean;
  newConversationSearch: string;
  newConversationCreating: boolean;
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
  onCloseNewConversation: () => void;
  onNewConversationSearchChange: (value: string) => void;
  onStartConversation: (graduateId: number) => void;
  onOpenProfile?: (graduateId?: number | null) => void;
}

function getInitials(value?: string | null) {
  const text = (value || '').trim();
  if (!text) return 'G';
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
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

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;

  return formatConversationTime(value);
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

  if (src) {
    return <img src={resolveAssetUrl(src)} alt={label || 'Profile'} className={`${className} shrink-0 rounded-full object-cover`} />;
  }

  return (
    <div className={`${className} flex shrink-0 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-800`}>
      {getInitials(label)}
    </div>
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
        {recipient?.is_online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />}
      </button>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={handleIdentityClick} className="truncate text-left text-sm font-bold text-slate-900 transition hover:text-blue-700">{label}</button>
        </div>
        <button type="button" onClick={onSelect} className="mt-0.5 block w-full truncate text-left text-xs text-slate-500">{safePreview(room.last_message)}</button>
      </div>

      <button type="button" onClick={onSelect} className="flex flex-col items-end gap-2 text-right">
        <span className="text-[11px] font-semibold text-slate-400">{formatConversationTime(room.last_message_at || room.updated_at)}</span>
        {(room.unread_count || 0) > 0 && (
          <span className="min-w-5 rounded-full bg-blue-700 px-1.5 py-0.5 text-center text-[11px] font-bold text-white">
            {room.unread_count && room.unread_count > 9 ? '9+' : room.unread_count}
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
}: {
  room: MessagingRoom | null;
  currentGraduateId: number;
  resolveAssetUrl: (path?: string | null) => string;
  onBack: () => void;
  onOpenProfile?: (graduateId?: number | null) => void;
}) {
  const recipient = getRecipient(room, currentGraduateId);
  const label = room ? getRoomLabel(room, currentGraduateId) : 'Select a conversation';
  const canOpenRecipient = !!room && !room.is_group && !!recipient?.graduate_id && recipient.graduate_id !== currentGraduateId;
  const [, updatePresenceClock] = useState(0);

  useEffect(() => {
    if (!recipient?.last_active_at || recipient.is_online) return undefined;
    const interval = window.setInterval(() => updatePresenceClock((current) => current + 1), 30000);
    return () => window.clearInterval(interval);
  }, [recipient?.is_online, recipient?.last_active_at]);

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
            <Avatar src={recipient?.profile_image_path} label={label} size="lg" resolveAssetUrl={resolveAssetUrl} />
            {recipient?.is_online && <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500" />}
          </button>
          <div className="min-w-0">
            <button type="button" onClick={handleIdentityClick} disabled={!canOpenRecipient} className="max-w-full truncate text-left text-base font-bold text-slate-900 transition hover:text-blue-700 disabled:cursor-default disabled:hover:text-slate-900">{label}</button>
            <p className="truncate text-xs font-semibold text-slate-500">{getPresenceLabel(recipient)}</p>
          </div>
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

  if (attachment.attachment_type === 'image') {
    return (
      <button type="button" onClick={() => onImageOpen(attachment)} className="mt-2 block overflow-hidden rounded-lg border border-white/20 bg-black/10 text-left" aria-label={`Open ${attachment.original_name}`}>
        <img src={url} alt={attachment.original_name} className="max-h-64 w-full object-cover" />
      </button>
    );
  }

  return (
    <a href={downloadUrl} className="mt-2 flex items-center gap-3 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-slate-700 transition hover:bg-white" download>
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

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[82%] sm:max-w-[72%] ${isMine ? 'items-end' : 'items-start'}`}>
        <div className={`rounded-lg px-4 py-3 text-sm shadow-sm ${
          isMine
            ? message.status === 'failed'
              ? 'border border-rose-200 bg-rose-50 text-rose-800'
              : 'bg-blue-700 text-white'
            : 'border border-slate-200 bg-white text-slate-800'
        }`}>
          {!isMine && (
            <button type="button" onClick={() => onOpenProfile?.(message.graduate_id)} className="mb-1 block text-left text-xs font-bold text-slate-500 transition hover:text-blue-700">
              {message.sender_name}
            </button>
          )}
          {message.message && <p className="whitespace-pre-wrap break-words leading-6">{message.message}</p>}
          {(message.attachments || []).map((attachment) => (
            <AttachmentTile key={attachment.id} attachment={attachment} resolveAssetUrl={resolveAssetUrl} onImageOpen={onImageOpen} />
          ))}
          <div className={`mt-2 flex items-center gap-1 text-[11px] ${isMine ? 'justify-end text-blue-100' : 'text-slate-400'}`}>
            <span>{formatShortTime(message.created_at)}</span>
            {isMine && <StatusIcon message={message} />}
          </div>
        </div>
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
  const preserveScrollRef = useRef<{ height: number; top: number } | null>(null);

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

    if (!newMessageAvailable) {
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
      requestAnimationFrame(() => {
        element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
      });
    }
  }, [typingNames.length]);

  return (
    <div className="relative min-h-0 flex-1 bg-[#f8fafc]">
      <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto px-4 py-5">
        {loading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((item) => (
              <div key={item} className={`flex ${item % 2 ? 'justify-end' : 'justify-start'}`}>
                <div className="h-16 w-2/3 animate-pulse rounded-lg bg-slate-200" />
              </div>
            ))}
          </div>
        ) : !room ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
            Pick a conversation to read and send messages.
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col justify-center gap-4 px-6">
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

      {newMessageAvailable && (
        <button
          type="button"
          onClick={() => {
            const element = scrollRef.current;
            if (element) {
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
          placeholder="Type a message"
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
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 px-4 py-6" role="dialog" aria-modal="true">
      <button type="button" onClick={onClose} className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/20" aria-label="Close image preview">
        <X className="h-6 w-6" />
      </button>
      <div className="max-h-full max-w-5xl">
        <img src={resolveAssetUrl(attachment.url)} alt={attachment.original_name} className="max-h-[82vh] rounded-lg object-contain" />
        <div className="mt-3 flex items-center justify-between gap-3 text-sm text-white">
          <span className="truncate">{attachment.original_name}</span>
          <a href={resolveAssetUrl(attachment.download_url)} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 font-bold text-slate-900" download>
            <Download className="h-4 w-4" />
            Download
          </a>
        </div>
      </div>
    </div>
  );
}

function NewConversationModal({
  open,
  directory,
  search,
  creating,
  resolveAssetUrl,
  onClose,
  onSearchChange,
  onStartConversation,
  onOpenProfile,
}: {
  open: boolean;
  directory: MessagingParticipant[];
  search: string;
  creating: boolean;
  resolveAssetUrl: (path?: string | null) => string;
  onClose: () => void;
  onSearchChange: (value: string) => void;
  onStartConversation: (graduateId: number) => void;
  onOpenProfile?: (graduateId?: number | null) => void;
}) {
  const query = search.trim().toLowerCase();
  const [programFilter, setProgramFilter] = useState('all');
  const [batchFilter, setBatchFilter] = useState('all');
  const programOptions = useMemo(() => (
    Array.from(new Set(directory.map((participant) => participant.program_code?.trim()).filter(Boolean) as string[]))
      .sort((first, second) => first.localeCompare(second))
  ), [directory]);
  const batchOptions = useMemo(() => (
    Array.from(new Set(
      directory
        .map((participant) => participant.year_graduated)
        .filter((year): year is number => typeof year === 'number' && Number.isFinite(year)),
    )).sort((first, second) => second - first)
  ), [directory]);
  const filtered = useMemo(() => {
    return directory.filter((participant) => {
      const participantProgram = participant.program_code?.trim() || '';
      const participantBatch = participant.year_graduated ? String(participant.year_graduated) : '';
      const matchesProgram = programFilter === 'all' || participantProgram === programFilter;
      const matchesBatch = batchFilter === 'all' || participantBatch === batchFilter;
      if (!matchesProgram || !matchesBatch) return false;
      if (!query) return true;

      return [participant.full_name, participantProgram, participantBatch ? `Batch ${participantBatch}` : ''].join(' ').toLowerCase().includes(query);
    });
  }, [batchFilter, directory, programFilter, query]);

  useEffect(() => {
    if (!open) return;
    setProgramFilter('all');
    setBatchFilter('all');
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/55 px-4 py-6" role="dialog" aria-modal="true">
      <div className="flex max-h-[88vh] w-full max-w-xl flex-col rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">New Message</h2>
            <p className="text-sm text-slate-500">Choose a graduate to message.</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close new message">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-slate-100 px-5 py-4">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search graduates"
              className="h-11 w-full rounded-lg border border-slate-200 bg-[#f8fafc] px-10 text-sm outline-none transition focus:border-blue-500"
              aria-label="Search graduates"
            />
          </label>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Program</span>
              <select value={programFilter} onChange={(event) => setProgramFilter(event.target.value)} className="h-11 w-full rounded-lg border border-slate-200 bg-[#f8fafc] px-3 text-sm outline-none transition focus:border-blue-500">
                <option value="all">All Programs</option>
                {programOptions.map((program) => (
                  <option key={program} value={program}>
                    {program}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Batch</span>
              <select value={batchFilter} onChange={(event) => setBatchFilter(event.target.value)} className="h-11 w-full rounded-lg border border-slate-200 bg-[#f8fafc] px-3 text-sm outline-none transition focus:border-blue-500">
                <option value="all">All Batches</option>
                {batchOptions.map((year) => (
                  <option key={year} value={String(year)}>
                    Batch {year}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
              No graduates match your filters.
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((participant) => (
                <div
                  key={participant.graduate_id}
                  className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 text-left transition hover:bg-slate-50"
                >
                  <button type="button" onClick={() => onOpenProfile?.(participant.graduate_id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <Avatar src={participant.profile_image_path} label={participant.full_name} size="sm" resolveAssetUrl={resolveAssetUrl} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-900 transition hover:text-blue-700">{participant.full_name}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {participant.program_code || 'Graduate'}{participant.year_graduated ? ` - Batch ${participant.year_graduated}` : ''}
                      </span>
                    </span>
                  </button>
                  <button type="button" disabled={creating} onClick={() => onStartConversation(participant.graduate_id)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
                    {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Message
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RealtimeMessagingWorkspace({
  currentGraduate,
  rooms,
  directory,
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
  newConversationOpen,
  newConversationSearch,
  newConversationCreating,
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
  onCloseNewConversation,
  onNewConversationSearchChange,
  onStartConversation,
  onOpenProfile,
}: RealtimeMessagingWorkspaceProps) {
  const [previewAttachment, setPreviewAttachment] = useState<MessageAttachment | null>(null);

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
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

        <div className={`${mobileChatOpen ? 'flex' : 'hidden lg:flex'} min-h-0 flex-col bg-white`}>
          <ChatHeader room={activeRoom} currentGraduateId={currentGraduate.graduate_id} resolveAssetUrl={resolveAssetUrl} onBack={onBackToList} onOpenProfile={onOpenProfile} />
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
            disabled={!activeRoom}
            selectedAttachment={selectedAttachment}
            onDraftChange={onDraftChange}
            onTypingStop={onTypingStop}
            onSend={onSend}
            onAttachmentSelected={onAttachmentSelected}
            onRemoveAttachment={onRemoveAttachment}
            onRetryAttachment={onRetryAttachment}
          />
        </div>
      </div>

      <NewConversationModal
        open={newConversationOpen}
        directory={directory}
        search={newConversationSearch}
        creating={newConversationCreating}
        resolveAssetUrl={resolveAssetUrl}
        onClose={onCloseNewConversation}
        onSearchChange={onNewConversationSearchChange}
        onStartConversation={onStartConversation}
        onOpenProfile={onOpenProfile}
      />

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
  ImagePreviewModal,
  MessageBubble,
  MessageComposer,
  MessageList,
  NewConversationModal,
  TypingIndicator,
};
