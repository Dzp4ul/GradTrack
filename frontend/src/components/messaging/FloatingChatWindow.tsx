import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Minus, Users, X } from 'lucide-react';
import ProfileAvatar from '../ProfileAvatar';
import {
  ImagePreviewModal,
  MessageComposer,
  MessageList,
  PresenceText,
} from './RealtimeMessagingWorkspace';
import type {
  ConversationInformation,
  MessageAttachment,
  MessagingMessage,
  MessagingRoom,
  SelectedAttachment,
} from './types';

interface FloatingChatWindowProps {
  currentGraduateId: number;
  room: MessagingRoom | null;
  messages: MessagingMessage[];
  draft: string;
  loading: boolean;
  minimized: boolean;
  loadingOlder: boolean;
  hasMoreOlder: boolean;
  typingNames: string[];
  selectedAttachment: SelectedAttachment | null;
  newMessageAvailable: boolean;
  conversationInfo: ConversationInformation | null;
  resolveAssetUrl: (path?: string | null) => string;
  onMinimize: () => void;
  onReopen: () => void;
  onClose: () => void;
  onOpenFull: () => void;
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
  onOpenProfile?: (graduateId?: number | null) => void;
}

export default function FloatingChatWindow({
  currentGraduateId,
  room,
  messages,
  draft,
  loading,
  minimized,
  loadingOlder,
  hasMoreOlder,
  typingNames,
  selectedAttachment,
  newMessageAvailable,
  conversationInfo,
  resolveAssetUrl,
  onMinimize,
  onReopen,
  onClose,
  onOpenFull,
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
  onOpenProfile,
}: FloatingChatWindowProps) {
  const [previewAttachment, setPreviewAttachment] = useState<MessageAttachment | null>(null);
  const recipient = useMemo(() => room?.participants.find((participant) => participant.graduate_id !== currentGraduateId)
    || room?.participants[0]
    || null, [currentGraduateId, room]);
  const label = room?.is_group ? room.name?.trim() || 'Group Chat' : recipient?.full_name || 'Direct Chat';
  const avatar = room?.is_group && room.group_image_url ? room.group_image_url : recipient?.profile_image_path;

  useEffect(() => setPreviewAttachment(null), [room?.id]);

  if (!room) return null;

  const headerIdentity = (
    <button type="button" onClick={() => { if (minimized) onReopen(); else if (!room.is_group) onOpenProfile?.(recipient?.graduate_id); }} disabled={!minimized && (room.is_group || !recipient)} className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default">
      <span className="relative shrink-0">
        <ProfileAvatar
          src={avatar}
          label={label}
          resolveUrl={resolveAssetUrl}
          imageClassName="h-10 w-10 rounded-full object-cover"
          fallbackClassName="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800"
        />
        {room.is_group
          ? <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-blue-700 text-white"><Users className="h-2.5 w-2.5" /></span>
          : recipient?.is_online && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-slate-900">{label}</span>
        <span className="block truncate text-[11px] font-semibold text-slate-500">{room.is_group ? `${room.participant_count} members` : <PresenceText participant={recipient} />}</span>
      </span>
    </button>
  );

  if (minimized) {
    return (
      <div className="gradtrack-messaging fixed bottom-0 right-3 z-40 w-[min(22rem,calc(100vw-1.5rem))] rounded-t-xl border border-b-0 border-slate-200 bg-white shadow-2xl sm:right-6">
        <div className="flex items-center gap-2 px-3 py-2">
          {headerIdentity}
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="Close floating chat"><X className="h-4 w-4" /></button>
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="gradtrack-messaging fixed bottom-0 right-3 z-40 flex h-[min(34rem,calc(100vh-7rem))] w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-t-xl border border-b-0 border-slate-200 bg-white shadow-2xl sm:right-6" aria-label={`Floating chat with ${label}`}>
        <header className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
          {headerIdentity}
          <button type="button" onClick={onOpenFull} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="Open full Messages page" title="Open in Messages"><ExternalLink className="h-4 w-4" /></button>
          <button type="button" onClick={onMinimize} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="Minimize floating chat"><Minus className="h-4 w-4" /></button>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="Close floating chat"><X className="h-4 w-4" /></button>
        </header>
        <MessageList
          room={room}
          messages={messages}
          loading={loading}
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
          disabled={!!conversationInfo?.block?.blocked}
          disabledReason={conversationInfo?.block?.blocked ? 'Messaging is unavailable while this conversation is blocked' : undefined}
          selectedAttachment={selectedAttachment}
          onDraftChange={onDraftChange}
          onTypingStop={onTypingStop}
          onSend={onSend}
          onAttachmentSelected={onAttachmentSelected}
          onRemoveAttachment={onRemoveAttachment}
          onRetryAttachment={onRetryAttachment}
        />
      </section>
      {previewAttachment && <ImagePreviewModal attachment={previewAttachment} resolveAssetUrl={resolveAssetUrl} onClose={() => setPreviewAttachment(null)} />}
    </>
  );
}
