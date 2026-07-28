import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PsgcAddressPayload, PsgcLocation, psgcService } from '../services/psgc';

type AddressLevel = 'regions' | 'provinces' | 'cities' | 'barangays';

type LoadingState = Record<AddressLevel, boolean>;
type ErrorState = Partial<Record<AddressLevel, string>>;
type RetryState = Record<AddressLevel, number>;

interface PsgcAddressSelection {
  regionCode: string;
  regionName: string;
  provinceCode: string | null;
  provinceName: string | null;
  cityMunicipalityCode: string;
  cityMunicipalityName: string;
  barangayCode: string;
  barangayName: string;
}

const emptySelection: PsgcAddressSelection = {
  regionCode: '',
  regionName: '',
  provinceCode: null,
  provinceName: null,
  cityMunicipalityCode: '',
  cityMunicipalityName: '',
  barangayCode: '',
  barangayName: '',
};

const loadingDefaults: LoadingState = {
  regions: false,
  provinces: false,
  cities: false,
  barangays: false,
};

const retryDefaults: RetryState = {
  regions: 0,
  provinces: 0,
  cities: 0,
  barangays: 0,
};

const unavailableMessage =
  'Philippine address information is temporarily unavailable. Please try again.';

const setLevelLoading = (level: AddressLevel, value: boolean) => (state: LoadingState) => ({
  ...state,
  [level]: value,
});

const clearLevelError = (level: AddressLevel) => (state: ErrorState) => {
  if (!state[level]) return state;
  const next = { ...state };
  delete next[level];
  return next;
};

const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === 'AbortError';

const findByCode = (items: PsgcLocation[], code: string | null | undefined) =>
  items.find((item) => item.code === code);

const normalizeIncomingAddress = (
  value?: Partial<PsgcAddressPayload> | null,
): PsgcAddressSelection => ({
  regionCode: String(value?.region_code || '').trim(),
  regionName: String(value?.region_name || '').trim(),
  provinceCode: value?.province_code ? String(value.province_code).trim() : null,
  provinceName: value?.province_name ? String(value.province_name).trim() : null,
  cityMunicipalityCode: String(value?.city_municipality_code || '').trim(),
  cityMunicipalityName: String(value?.city_municipality_name || '').trim(),
  barangayCode: String(value?.barangay_code || '').trim(),
  barangayName: String(value?.barangay_name || '').trim(),
});

export const usePsgcAddress = () => {
  const requestSequence = useRef<Record<AddressLevel, number>>({
    regions: 0,
    provinces: 0,
    cities: 0,
    barangays: 0,
  });

  const [selection, setSelection] = useState<PsgcAddressSelection>(emptySelection);
  const [regions, setRegions] = useState<PsgcLocation[]>([]);
  const [provinces, setProvinces] = useState<PsgcLocation[]>([]);
  const [citiesMunicipalities, setCitiesMunicipalities] = useState<PsgcLocation[]>([]);
  const [barangays, setBarangays] = useState<PsgcLocation[]>([]);
  const [provinceApplicable, setProvinceApplicable] = useState(true);
  const [loading, setLoading] = useState<LoadingState>(loadingDefaults);
  const [errors, setErrors] = useState<ErrorState>({});
  const [retryCounts, setRetryCounts] = useState<RetryState>(retryDefaults);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++requestSequence.current.regions;

    setLoading(setLevelLoading('regions', true));
    setErrors(clearLevelError('regions'));

    psgcService
      .getRegions(controller.signal)
      .then((items) => {
        if (requestSequence.current.regions !== requestId) return;
        setRegions(items);
        if (items.length === 0) {
          setErrors((prev) => ({
            ...prev,
            regions: 'No regions were returned. Please try again.',
          }));
        }
      })
      .catch((error) => {
        if (isAbortError(error) || requestSequence.current.regions !== requestId) return;
        setErrors((prev) => ({ ...prev, regions: unavailableMessage }));
      })
      .finally(() => {
        if (requestSequence.current.regions === requestId) {
          setLoading(setLevelLoading('regions', false));
        }
      });

    return () => controller.abort();
  }, [retryCounts.regions]);

  useEffect(() => {
    if (!selection.regionCode) {
      setProvinces([]);
      setCitiesMunicipalities([]);
      setBarangays([]);
      setProvinceApplicable(true);
      return;
    }

    const controller = new AbortController();
    const requestId = ++requestSequence.current.provinces;

    setLoading(setLevelLoading('provinces', true));
    setErrors(clearLevelError('provinces'));

    psgcService
      .getProvincesByRegion(selection.regionCode, controller.signal)
      .then((items) => {
        if (requestSequence.current.provinces !== requestId) return;

        setProvinces(items);
        const hasProvince = items.length > 0;
        setProvinceApplicable(hasProvince);

        setSelection((prev) => {
          if (prev.regionCode !== selection.regionCode) return prev;

          if (!hasProvince) {
            return {
              ...prev,
              provinceCode: null,
              provinceName: null,
            };
          }

          const savedProvince = findByCode(items, prev.provinceCode);
          if (!prev.provinceCode || savedProvince) {
            return savedProvince ? { ...prev, provinceName: savedProvince.name } : prev;
          }

          return {
            ...prev,
            provinceCode: null,
            provinceName: null,
            cityMunicipalityCode: '',
            cityMunicipalityName: '',
            barangayCode: '',
            barangayName: '',
          };
        });
      })
      .catch((error) => {
        if (isAbortError(error) || requestSequence.current.provinces !== requestId) return;
        setErrors((prev) => ({ ...prev, provinces: unavailableMessage }));
        setProvinces([]);
        setProvinceApplicable(true);
      })
      .finally(() => {
        if (requestSequence.current.provinces === requestId) {
          setLoading(setLevelLoading('provinces', false));
        }
      });

    return () => controller.abort();
  }, [selection.regionCode, retryCounts.provinces]);

  useEffect(() => {
    const canLoadByProvince = provinceApplicable && Boolean(selection.provinceCode);
    const canLoadByRegion = !provinceApplicable && Boolean(selection.regionCode);

    if (!canLoadByProvince && !canLoadByRegion) {
      setCitiesMunicipalities([]);
      setBarangays([]);
      return;
    }

    const controller = new AbortController();
    const requestId = ++requestSequence.current.cities;
    const request = canLoadByProvince
      ? psgcService.getCitiesMunicipalitiesByProvince(selection.provinceCode || '', controller.signal)
      : psgcService.getCitiesMunicipalitiesByRegion(selection.regionCode, controller.signal);

    setLoading(setLevelLoading('cities', true));
    setErrors(clearLevelError('cities'));

    request
      .then((items) => {
        if (requestSequence.current.cities !== requestId) return;

        setCitiesMunicipalities(items);
        if (items.length === 0) {
          setErrors((prev) => ({
            ...prev,
            cities: 'No cities or municipalities were found for the selected location.',
          }));
        }

        setSelection((prev) => {
          const savedCity = findByCode(items, prev.cityMunicipalityCode);
          if (!prev.cityMunicipalityCode || savedCity) {
            return savedCity ? { ...prev, cityMunicipalityName: savedCity.name } : prev;
          }

          return {
            ...prev,
            cityMunicipalityCode: '',
            cityMunicipalityName: '',
            barangayCode: '',
            barangayName: '',
          };
        });
      })
      .catch((error) => {
        if (isAbortError(error) || requestSequence.current.cities !== requestId) return;
        setErrors((prev) => ({ ...prev, cities: unavailableMessage }));
        setCitiesMunicipalities([]);
      })
      .finally(() => {
        if (requestSequence.current.cities === requestId) {
          setLoading(setLevelLoading('cities', false));
        }
      });

    return () => controller.abort();
  }, [
    provinceApplicable,
    selection.provinceCode,
    selection.regionCode,
    retryCounts.cities,
  ]);

  useEffect(() => {
    if (!selection.cityMunicipalityCode) {
      setBarangays([]);
      return;
    }

    const controller = new AbortController();
    const requestId = ++requestSequence.current.barangays;

    setLoading(setLevelLoading('barangays', true));
    setErrors(clearLevelError('barangays'));

    psgcService
      .getBarangaysByCityMunicipality(selection.cityMunicipalityCode, controller.signal)
      .then((items) => {
        if (requestSequence.current.barangays !== requestId) return;

        setBarangays(items);
        if (items.length === 0) {
          setErrors((prev) => ({
            ...prev,
            barangays: 'No barangays were found for the selected city or municipality.',
          }));
        }

        setSelection((prev) => {
          const savedBarangay = findByCode(items, prev.barangayCode);
          if (!prev.barangayCode || savedBarangay) {
            return savedBarangay ? { ...prev, barangayName: savedBarangay.name } : prev;
          }

          return {
            ...prev,
            barangayCode: '',
            barangayName: '',
          };
        });
      })
      .catch((error) => {
        if (isAbortError(error) || requestSequence.current.barangays !== requestId) return;
        setErrors((prev) => ({ ...prev, barangays: unavailableMessage }));
        setBarangays([]);
      })
      .finally(() => {
        if (requestSequence.current.barangays === requestId) {
          setLoading(setLevelLoading('barangays', false));
        }
      });

    return () => controller.abort();
  }, [selection.cityMunicipalityCode, retryCounts.barangays]);

  const selectRegion = useCallback((code: string) => {
    const region = findByCode(regions, code);
    setSelection({
      regionCode: region?.code || '',
      regionName: region?.name || '',
      provinceCode: null,
      provinceName: null,
      cityMunicipalityCode: '',
      cityMunicipalityName: '',
      barangayCode: '',
      barangayName: '',
    });
    setProvinces([]);
    setCitiesMunicipalities([]);
    setBarangays([]);
    setProvinceApplicable(true);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.provinces;
      delete next.cities;
      delete next.barangays;
      return next;
    });
  }, [regions]);

  const selectProvince = useCallback((code: string) => {
    const province = findByCode(provinces, code);
    setSelection((prev) => ({
      ...prev,
      provinceCode: province?.code || null,
      provinceName: province?.name || null,
      cityMunicipalityCode: '',
      cityMunicipalityName: '',
      barangayCode: '',
      barangayName: '',
    }));
    setCitiesMunicipalities([]);
    setBarangays([]);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.cities;
      delete next.barangays;
      return next;
    });
  }, [provinces]);

  const selectCityMunicipality = useCallback((code: string) => {
    const cityMunicipality = findByCode(citiesMunicipalities, code);
    setSelection((prev) => ({
      ...prev,
      cityMunicipalityCode: cityMunicipality?.code || '',
      cityMunicipalityName: cityMunicipality?.name || '',
      barangayCode: '',
      barangayName: '',
    }));
    setBarangays([]);
    setErrors((prev) => {
      const next = { ...prev };
      delete next.barangays;
      return next;
    });
  }, [citiesMunicipalities]);

  const selectBarangay = useCallback((code: string) => {
    const barangay = findByCode(barangays, code);
    setSelection((prev) => ({
      ...prev,
      barangayCode: barangay?.code || '',
      barangayName: barangay?.name || '',
    }));
  }, [barangays]);

  const restoreAddress = useCallback((address?: Partial<PsgcAddressPayload> | null) => {
    if (!address) return;
    setSelection(normalizeIncomingAddress(address));
  }, []);

  const resetAddress = useCallback(() => {
    setSelection(emptySelection);
    setProvinces([]);
    setCitiesMunicipalities([]);
    setBarangays([]);
    setProvinceApplicable(true);
  }, []);

  const retry = useCallback((level: AddressLevel) => {
    setRetryCounts((prev) => ({
      ...prev,
      [level]: prev[level] + 1,
    }));
  }, []);

  const payload = useMemo<PsgcAddressPayload | null>(() => {
    if (
      !selection.regionCode ||
      !selection.regionName ||
      !selection.cityMunicipalityCode ||
      !selection.cityMunicipalityName ||
      !selection.barangayCode ||
      !selection.barangayName
    ) {
      return null;
    }

    if (provinceApplicable && (!selection.provinceCode || !selection.provinceName)) {
      return null;
    }

    return {
      region_code: selection.regionCode,
      region_name: selection.regionName,
      province_code: provinceApplicable ? selection.provinceCode : null,
      province_name: provinceApplicable ? selection.provinceName : null,
      city_municipality_code: selection.cityMunicipalityCode,
      city_municipality_name: selection.cityMunicipalityName,
      barangay_code: selection.barangayCode,
      barangay_name: selection.barangayName,
    };
  }, [provinceApplicable, selection]);

  const draftValue = useMemo<Partial<PsgcAddressPayload>>(() => ({
    region_code: selection.regionCode,
    region_name: selection.regionName,
    province_code: provinceApplicable ? selection.provinceCode : null,
    province_name: provinceApplicable ? selection.provinceName : null,
    city_municipality_code: selection.cityMunicipalityCode,
    city_municipality_name: selection.cityMunicipalityName,
    barangay_code: selection.barangayCode,
    barangay_name: selection.barangayName,
  }), [provinceApplicable, selection]);

  return {
    selection,
    regions,
    provinces,
    citiesMunicipalities,
    barangays,
    provinceApplicable,
    loading,
    errors,
    isLoading: Object.values(loading).some(Boolean),
    hasErrors: Object.values(errors).some(Boolean),
    payload,
    draftValue,
    selectRegion,
    selectProvince,
    selectCityMunicipality,
    selectBarangay,
    restoreAddress,
    resetAddress,
    retry,
  };
};
