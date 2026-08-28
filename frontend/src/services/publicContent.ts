import { API_BASE_URL, API_ENDPOINTS } from '../config/api';

export type AboutSection = {
  id: number;
  section_key: 'mission' | 'challenge' | 'solution' | 'impact' | 'cta' | string;
  title: string;
  subtitle: string | null;
  content: string;
  image_path: string | null;
  default_image_path: string | null;
  image_alt: string | null;
  display_order: number;
  is_active: number | boolean;
};

export type FaqItem = {
  id: number | string;
  category_id?: number;
  question: string;
  answer: string;
  display_order: number;
  is_active: number | boolean;
};

export type FaqCategory = {
  id: number | string;
  name: string;
  display_order: number;
  is_active: number | boolean;
  items: FaqItem[];
};

export type PrivacyMeta = {
  introductory_statement: string;
  effective_date: string;
  last_updated_date: string;
};

export type PrivacySection = {
  id: number | string;
  heading: string;
  content_html: string;
  display_order: number;
  is_active: number | boolean;
};

export type PublicContentPage = 'about' | 'faq' | 'privacy';

export const publicContentUrl = (page: PublicContentPage, admin = false) =>
  `${API_ENDPOINTS.PUBLIC_CONTENT}?page=${page}${admin ? '&scope=admin' : ''}`;

export function resolvePublicContentAsset(path?: string | null) {
  if (!path) return '';
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) return path;
  if (path.startsWith('/')) return path;
  return `${API_BASE_URL}/${path.replace(/^\/+/, '')}`;
}

export async function fetchPublicContent<T>(page: PublicContentPage, admin = false): Promise<T> {
  const response = await fetch(publicContentUrl(page, admin), { credentials: 'include' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || `Unable to load ${page} content.`);
  return data as T;
}

export async function savePublicContent<T>(page: PublicContentPage, payload: unknown): Promise<T> {
  const response = await fetch(publicContentUrl(page, true), {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.error || `Unable to save ${page} content.`);
  return data as T;
}
