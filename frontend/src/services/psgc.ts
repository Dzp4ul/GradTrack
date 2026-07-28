import { PSGC_API_BASE_URL } from '../config/api';

export interface PsgcLocation {
  code: string;
  name: string;
  [key: string]: unknown;
}

export interface PsgcAddressPayload {
  region_code: string;
  region_name: string;
  province_code: string | null;
  province_name: string | null;
  city_municipality_code: string;
  city_municipality_name: string;
  barangay_code: string;
  barangay_name: string;
}

export const FALLBACK_PSGC_REGIONS: PsgcLocation[] = [
  { code: '0100000000', name: 'Region I (Ilocos Region)' },
  { code: '0200000000', name: 'Region II (Cagayan Valley)' },
  { code: '0300000000', name: 'Region III (Central Luzon)' },
  { code: '0400000000', name: 'Region IV-A (CALABARZON)' },
  { code: '1700000000', name: 'MIMAROPA Region' },
  { code: '0500000000', name: 'Region V (Bicol Region)' },
  { code: '0600000000', name: 'Region VI (Western Visayas)' },
  { code: '0700000000', name: 'Region VII (Central Visayas)' },
  { code: '0800000000', name: 'Region VIII (Eastern Visayas)' },
  { code: '0900000000', name: 'Region IX (Zamboanga Peninsula)' },
  { code: '1000000000', name: 'Region X (Northern Mindanao)' },
  { code: '1100000000', name: 'Region XI (Davao Region)' },
  { code: '1200000000', name: 'Region XII (SOCCSKSARGEN)' },
  { code: '1300000000', name: 'National Capital Region (NCR)' },
  { code: '1400000000', name: 'Cordillera Administrative Region (CAR)' },
  { code: '1600000000', name: 'Region XIII (Caraga)' },
  { code: '1900000000', name: 'Bangsamoro Autonomous Region in Muslim Mindanao (BARMM)' },
];

const collectionCache = new Map<string, Promise<PsgcLocation[]>>();

const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === 'AbortError';

const getCollection = async (path: string, signal?: AbortSignal): Promise<PsgcLocation[]> => {
  const normalizedPath = path.replace(/^\/+/, '');
  const cached = collectionCache.get(normalizedPath);

  if (cached) {
    return cached;
  }

  const request = fetch(`${PSGC_API_BASE_URL}/${normalizedPath}`, {
    headers: { Accept: 'application/json' },
    signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error('PSGC_REQUEST_FAILED');
      }

      const payload = await response.json();
      const items = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
        ? payload
        : [];

      return items
        .filter((item: unknown): item is PsgcLocation => {
          const record = item as Partial<PsgcLocation>;
          return Boolean(record?.code && record?.name);
        })
        .map((item: PsgcLocation) => ({
          ...item,
          code: String(item.code),
          name: String(item.name),
        }));
    })
    .catch((error) => {
      collectionCache.delete(normalizedPath);
      throw error;
    });

  collectionCache.set(normalizedPath, request);
  return request;
};

const encodeCode = (code: string) => encodeURIComponent(code.trim());

export const psgcService = {
  getRegions: (signal?: AbortSignal) =>
    getCollection('regions', signal)
      .then((items) => (items.length > 0 ? items : FALLBACK_PSGC_REGIONS))
      .catch((error) => {
        if (isAbortError(error)) {
          throw error;
        }

        return FALLBACK_PSGC_REGIONS;
      }),

  getProvincesByRegion: (regionCode: string, signal?: AbortSignal) =>
    getCollection(`regions/${encodeCode(regionCode)}/provinces`, signal),

  getCitiesMunicipalitiesByProvince: (provinceCode: string, signal?: AbortSignal) =>
    getCollection(`provinces/${encodeCode(provinceCode)}/cities-municipalities`, signal),

  getCitiesMunicipalitiesByRegion: (regionCode: string, signal?: AbortSignal) =>
    getCollection(`regions/${encodeCode(regionCode)}/cities-municipalities`, signal),

  getBarangaysByCityMunicipality: (cityMunicipalityCode: string, signal?: AbortSignal) =>
    getCollection(`cities-municipalities/${encodeCode(cityMunicipalityCode)}/barangays`, signal),
};
