<?php

if (!function_exists('gradtrack_uppercase_name')) {
    function gradtrack_uppercase_name($value): string
    {
        $name = preg_replace('/\s+/u', ' ', trim((string) ($value ?? '')));
        if ($name === null || $name === '') {
            return '';
        }

        if (function_exists('mb_strtoupper')) {
            return mb_strtoupper($name, 'UTF-8');
        }

        return strtoupper($name);
    }
}

if (!function_exists('gradtrack_uppercase_nullable_name')) {
    function gradtrack_uppercase_nullable_name($value): ?string
    {
        $name = gradtrack_uppercase_name($value);
        return $name !== '' ? $name : null;
    }
}
