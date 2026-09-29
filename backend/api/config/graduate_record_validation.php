<?php
declare(strict_types=1);

function gradtrack_optional_graduate_email_is_valid(?string $email): bool
{
    return $email === null || filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
}

function gradtrack_optional_graduate_phone_is_valid(?string $phone): bool
{
    return $phone === null || preg_match('/^09\d{9}$/D', $phone) === 1;
}
