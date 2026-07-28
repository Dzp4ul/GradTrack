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

const collectionCache = new Map<string, Promise<PsgcLocation[]>>();

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
    getCollection('regions', signal),

  getProvincesByRegion: (regionCode: string, signal?: AbortSignal) =>
    getCollection(`regions/${encodeCode(regionCode)}/provinces`, signal),

  getCitiesMunicipalitiesByProvince: (provinceCode: string, signal?: AbortSignal) =>
    getCollection(`provinces/${encodeCode(provinceCode)}/cities-municipalities`, signal),

  getCitiesMunicipalitiesByRegion: (regionCode: string, signal?: AbortSignal) =>
    getCollection(`regions/${encodeCode(regionCode)}/cities-municipalities`, signal),

  getBarangaysByCityMunicipality: (cityMunicipalityCode: string, signal?: AbortSignal) =>
    getCollection(`cities-municipalities/${encodeCode(cityMunicipalityCode)}/barangays`, signal),
};
