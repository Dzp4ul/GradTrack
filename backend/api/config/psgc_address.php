<?php

class GradTrackPsgcUnavailableException extends RuntimeException
{
}

class GradTrackPsgcValidationException extends RuntimeException
{
}

function gradtrack_psgc_base_url(): string
{
    $baseUrl = getenv('PSGC_API_BASE_URL') ?: 'https://psgc.cloud/api/v2';
    return rtrim(trim((string) $baseUrl), '/');
}

function gradtrack_psgc_is_list(array $value): bool
{
    if ($value === []) {
        return true;
    }

    return array_keys($value) === range(0, count($value) - 1);
}

function gradtrack_psgc_fetch_collection(string $path): array
{
    static $cache = [];

    $normalizedPath = ltrim($path, '/');
    if (isset($cache[$normalizedPath])) {
        return $cache[$normalizedPath];
    }

    $url = gradtrack_psgc_base_url() . '/' . $normalizedPath;
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 8,
            'ignore_errors' => true,
            'header' => "Accept: application/json\r\nUser-Agent: GRADTRACK/1.0\r\n",
        ],
    ]);

    $body = @file_get_contents($url, false, $context);
    $statusCode = 0;

    if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $matches)) {
        $statusCode = (int) $matches[1];
    }

    if ($body === false || $statusCode >= 500 || $statusCode === 429) {
        throw new GradTrackPsgcUnavailableException('PSGC API unavailable');
    }

    if ($statusCode >= 400) {
        return [];
    }

    $decoded = json_decode((string) $body, true);
    if (!is_array($decoded)) {
        throw new GradTrackPsgcUnavailableException('PSGC API returned an invalid response');
    }

    $items = isset($decoded['data']) && is_array($decoded['data'])
        ? $decoded['data']
        : (gradtrack_psgc_is_list($decoded) ? $decoded : []);

    $locations = [];
    foreach ($items as $item) {
        if (!is_array($item) || empty($item['code']) || empty($item['name'])) {
            continue;
        }

        $locations[] = [
            'code' => trim((string) $item['code']),
            'name' => trim((string) $item['name']),
        ];
    }

    $cache[$normalizedPath] = $locations;
    return $locations;
}

function gradtrack_psgc_find_by_code(array $items, string $code): ?array
{
    foreach ($items as $item) {
        if (($item['code'] ?? '') === $code) {
            return $item;
        }
    }

    return null;
}

function gradtrack_psgc_clean_code($value): string
{
    return trim((string) ($value ?? ''));
}

function gradtrack_psgc_validate_address($address): array
{
    if (!is_array($address)) {
        throw new GradTrackPsgcValidationException('Please select a valid Philippine address.');
    }

    $regionCode = gradtrack_psgc_clean_code($address['region_code'] ?? null);
    $provinceCode = gradtrack_psgc_clean_code($address['province_code'] ?? null);
    $cityMunicipalityCode = gradtrack_psgc_clean_code($address['city_municipality_code'] ?? null);
    $barangayCode = gradtrack_psgc_clean_code($address['barangay_code'] ?? null);

    if ($regionCode === '') {
        throw new GradTrackPsgcValidationException('Region is required.');
    }

    $regions = gradtrack_psgc_fetch_collection('regions');
    $region = gradtrack_psgc_find_by_code($regions, $regionCode);
    if (!$region) {
        throw new GradTrackPsgcValidationException('Please select a valid region.');
    }

    $provinces = gradtrack_psgc_fetch_collection('regions/' . rawurlencode($regionCode) . '/provinces');
    $hasProvince = count($provinces) > 0;
    $province = null;

    if ($hasProvince) {
        if ($provinceCode === '') {
            throw new GradTrackPsgcValidationException('Province is required for the selected region.');
        }

        $province = gradtrack_psgc_find_by_code($provinces, $provinceCode);
        if (!$province) {
            throw new GradTrackPsgcValidationException('The selected province does not belong to the selected region.');
        }

        $citiesMunicipalities = gradtrack_psgc_fetch_collection('provinces/' . rawurlencode($provinceCode) . '/cities-municipalities');
    } else {
        if ($provinceCode !== '') {
            throw new GradTrackPsgcValidationException('Province is not applicable for the selected region.');
        }

        $citiesMunicipalities = gradtrack_psgc_fetch_collection('regions/' . rawurlencode($regionCode) . '/cities-municipalities');
    }

    if ($cityMunicipalityCode === '') {
        throw new GradTrackPsgcValidationException('City or municipality is required.');
    }

    if (count($citiesMunicipalities) === 0) {
        throw new GradTrackPsgcValidationException('No cities or municipalities were found for the selected location.');
    }

    $cityMunicipality = gradtrack_psgc_find_by_code($citiesMunicipalities, $cityMunicipalityCode);
    if (!$cityMunicipality) {
        $message = $hasProvince
            ? 'The selected city or municipality does not belong to the selected province.'
            : 'The selected city or municipality does not belong to the selected region.';
        throw new GradTrackPsgcValidationException($message);
    }

    if ($barangayCode === '') {
        throw new GradTrackPsgcValidationException('Barangay is required.');
    }

    $barangays = gradtrack_psgc_fetch_collection('cities-municipalities/' . rawurlencode($cityMunicipalityCode) . '/barangays');
    if (count($barangays) === 0) {
        throw new GradTrackPsgcValidationException('No barangays were found for the selected city or municipality.');
    }

    $barangay = gradtrack_psgc_find_by_code($barangays, $barangayCode);
    if (!$barangay) {
        throw new GradTrackPsgcValidationException('The selected barangay does not belong to the selected city or municipality.');
    }

    return [
        'region_code' => $region['code'],
        'region_name' => $region['name'],
        'province_code' => $province ? $province['code'] : null,
        'province_name' => $province ? $province['name'] : null,
        'city_municipality_code' => $cityMunicipality['code'],
        'city_municipality_name' => $cityMunicipality['name'],
        'barangay_code' => $barangay['code'],
        'barangay_name' => $barangay['name'],
    ];
}
