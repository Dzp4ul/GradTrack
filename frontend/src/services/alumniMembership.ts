import { API_BASE_URL, API_ENDPOINTS } from '../config/api';

export const OFFICIAL_ALUMNI_REGISTRATION_URL = 'https://forms.gle/UWWfnV8LPDG2hwru8';

export type AlumniMembershipAudience = 'registration' | 'registered';
export type AlumniMembershipAssetKey = 'college_logo' | 'alumni_logo' | 'id_card_front' | 'id_card_back';

export type AlumniMembershipConfig = {
  id: number;
  status: 'draft' | 'published' | 'archived';
  association_name: string;
  membership_subtitle: string;
  main_heading: string;
  intro_text: string;
  registered_heading: string;
  registered_intro_text: string;
  registration_instructions: string;
  registration_button_text: string;
  registration_url: string;
  registration_button_enabled: boolean;
  registered_instructions: string;
  contact_information: string;
  footer_text: string;
  total_fee_enabled: boolean;
  published_at: string | null;
  updated_at: string | null;
  college_logo_path: string | null;
  college_logo_url: string | null;
  alumni_logo_path: string | null;
  alumni_logo_url: string | null;
  id_card_front_path: string | null;
  id_card_front_url: string | null;
  id_card_back_path: string | null;
  id_card_back_url: string | null;
};

export type AlumniMembershipBenefit = {
  id?: number | string;
  title: string;
  description: string;
  display_order: number;
  is_active: boolean;
};

export type AlumniMembershipFee = {
  id?: number | string;
  name: string;
  description: string;
  amount: string;
  display_order: number;
  is_active: boolean;
};

export type AlumniMembershipInformation = {
  id?: number | string;
  audience: 'both' | AlumniMembershipAudience;
  title: string;
  content: string;
  display_order: number;
  is_active: boolean;
};

export type AlumniMembershipSection = {
  id?: number | string;
  section_key: 'benefits' | 'fees' | 'id_cards' | 'registration' | 'additional' | 'contact';
  section_title: string;
  display_order: number;
  is_visible: boolean;
};

export type AlumniMembershipContent = {
  config: AlumniMembershipConfig;
  benefits: AlumniMembershipBenefit[];
  fees: AlumniMembershipFee[];
  information_sections: AlumniMembershipInformation[];
  section_settings: AlumniMembershipSection[];
};

export type AlumniMembershipResponse = {
  success: boolean;
  published: boolean;
  data: AlumniMembershipContent | null;
  message?: string;
  published_at?: string | null;
  has_published_content?: boolean;
};

const publicRequests: Partial<Record<AlumniMembershipAudience, Promise<AlumniMembershipResponse>>> = {};
const publicContent: Partial<Record<AlumniMembershipAudience, AlumniMembershipResponse>> = {};

function clearPublicMembershipCache() {
  delete publicContent.registration;
  delete publicContent.registered;
}

export function resolveAlumniMembershipAsset(path?: string | null) {
  if (!path) return '';
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) return path;
  if (path.startsWith('/')) return path;
  return `${API_BASE_URL}/${path.replace(/^\/+/, '')}`;
}

async function parseMembershipResponse(response: Response): Promise<AlumniMembershipResponse> {
  const data = await response.json().catch(() => ({})) as AlumniMembershipResponse & { error?: string };
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Unable to load alumni membership information.');
  }
  return data;
}

export async function fetchAlumniMembership(
  audience: AlumniMembershipAudience,
  adminDraft = false,
): Promise<AlumniMembershipResponse> {
  if (adminDraft) {
    const response = await fetch(`${API_ENDPOINTS.ALUMNI_MEMBERSHIP}?scope=admin&view=${audience}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    return parseMembershipResponse(response);
  }

  if (publicContent[audience]) return publicContent[audience];
  if (publicRequests[audience]) return publicRequests[audience];
  const request = fetch(`${API_ENDPOINTS.ALUMNI_MEMBERSHIP}?view=${audience}`, {
    credentials: 'include',
    cache: 'no-store',
  })
    .then(parseMembershipResponse)
    .then((result) => {
      publicContent[audience] = result;
      return result;
    })
    .finally(() => {
      delete publicRequests[audience];
    });
  publicRequests[audience] = request;
  return request;
}

export async function saveAlumniMembershipDraft(content: AlumniMembershipContent): Promise<AlumniMembershipResponse> {
  const response = await fetch(`${API_ENDPOINTS.ALUMNI_MEMBERSHIP}?scope=admin`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(content),
  });
  return parseMembershipResponse(response);
}

export async function publishAlumniMembership(): Promise<AlumniMembershipResponse> {
  const response = await fetch(`${API_ENDPOINTS.ALUMNI_MEMBERSHIP}?scope=admin&action=publish`, {
    method: 'POST',
    credentials: 'include',
  });
  const result = await parseMembershipResponse(response);
  clearPublicMembershipCache();
  return result;
}

export async function unpublishAlumniMembership(): Promise<AlumniMembershipResponse> {
  const response = await fetch(`${API_ENDPOINTS.ALUMNI_MEMBERSHIP}?scope=admin&action=unpublish`, {
    method: 'POST',
    credentials: 'include',
  });
  const result = await parseMembershipResponse(response);
  clearPublicMembershipCache();
  return result;
}

export async function uploadAlumniMembershipImage(assetKey: AlumniMembershipAssetKey, image: File) {
  const body = new FormData();
  body.append('asset_key', assetKey);
  body.append('image', image);
  const response = await fetch(`${API_ENDPOINTS.ALUMNI_MEMBERSHIP}?scope=admin&action=upload`, {
    method: 'POST',
    credentials: 'include',
    body,
  });
  const data = await response.json().catch(() => ({})) as {
    success?: boolean;
    error?: string;
    path?: string | null;
    url?: string | null;
    message?: string;
  };
  if (!response.ok || !data.success) throw new Error(data.error || 'Unable to upload the image.');
  return data;
}

export async function removeAlumniMembershipImage(assetKey: AlumniMembershipAssetKey) {
  const response = await fetch(`${API_ENDPOINTS.ALUMNI_MEMBERSHIP}?scope=admin&action=remove-image`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset_key: assetKey }),
  });
  const data = await response.json().catch(() => ({})) as {
    success?: boolean;
    error?: string;
    path?: null;
    url?: null;
    message?: string;
  };
  if (!response.ok || !data.success) throw new Error(data.error || 'Unable to remove the image.');
  return data;
}
