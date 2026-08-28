export interface AnnouncementGalleryImage {
  id: number;
  file_path: string;
  original_name: string;
  sort_order: number;
}

export interface Announcement {
  id: number;
  title: string;
  summary: string;
  content: string;
  category: string;
  event_date?: string | null;
  cover_image_path?: string | null;
  status: string;
  published_at?: string | null;
  created_at: string;
  updated_at: string;
  author_name: string;
  author_program_name?: string | null;
  author_program_code?: string | null;
  author_profile_image_path?: string | null;
  author_type?: 'graduate' | 'admin';
  images?: AnnouncementGalleryImage[];
}

interface CategoryCount {
  category: string;
  count: number;
}

interface Pagination {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
}

export interface AnnouncementResponse {
  success: boolean;
  data?: Announcement | Announcement[];
  category_counts?: CategoryCount[];
  recent?: Announcement[];
  pagination?: Pagination;
  error?: string;
}

export async function fetchAnnouncements(url: string): Promise<AnnouncementResponse> {
  const response = await fetch(url, { credentials: 'include' });
  const text = await response.text();
  let data: AnnouncementResponse;

  try {
    data = text ? JSON.parse(text) as AnnouncementResponse : { success: false };
  } catch {
    throw new Error('The announcement service returned an invalid response.');
  }

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Unable to load announcements.');
  }

  return data;
}
