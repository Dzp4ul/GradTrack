export interface MessagingParticipant {
  graduate_id: number;
  full_name: string;
  program_code?: string | null;
  profile_image_path?: string | null;
  last_active_at?: string | null;
  is_online?: boolean;
}

export interface MessageAttachment {
  id: number;
  message_id?: number | null;
  room_id: number;
  original_name: string;
  stored_name: string;
  mime_type: string;
  file_size: number;
  attachment_type: 'image' | 'file';
  created_at?: string | null;
  url: string;
  download_url: string;
}

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'received';
export type RealtimeChatStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export interface MessagingRoom {
  id: number;
  created_by: number;
  name?: string | null;
  is_group: boolean;
  created_at: string;
  updated_at: string;
  last_message?: string | null;
  last_message_type?: 'text' | 'image' | 'file' | 'mixed' | null;
  last_message_at?: string | null;
  last_message_sender_id?: number | null;
  unread_count?: number;
  participants: MessagingParticipant[];
  participant_count: number;
}

export interface MessagingMessage {
  id: number;
  room_id: number;
  graduate_id: number;
  message: string;
  message_type?: 'text' | 'image' | 'file' | 'mixed';
  client_message_id?: string | null;
  created_at: string;
  updated_at?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
  sender_name: string;
  sender_program_code?: string | null;
  sender_profile_image_path?: string | null;
  is_mine: boolean;
  attachments?: MessageAttachment[];
  status?: MessageStatus;
  error?: string;
}

export interface SelectedAttachment {
  file: File;
  preview_url?: string;
  uploaded?: MessageAttachment;
  progress: number;
  status: 'selected' | 'uploading' | 'uploaded' | 'failed';
  error?: string;
}

export interface MessagePagination {
  limit: number;
  has_more_older: boolean;
  has_more_newer: boolean;
  oldest_id: number | null;
  newest_id: number | null;
}
