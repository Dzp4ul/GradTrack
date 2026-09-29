<?php
declare(strict_types=1);

require_once __DIR__ . '/../api/config/graduate_record_validation.php';

function graduate_optional_contacts_assert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException('Assertion failed: ' . $message);
    }
}

graduate_optional_contacts_assert(
    gradtrack_optional_graduate_email_is_valid(null),
    'a missing graduate email is accepted'
);
graduate_optional_contacts_assert(
    gradtrack_optional_graduate_email_is_valid('graduate@example.com'),
    'a valid graduate email is accepted'
);
graduate_optional_contacts_assert(
    !gradtrack_optional_graduate_email_is_valid('invalid-email'),
    'an invalid non-empty graduate email is rejected'
);
graduate_optional_contacts_assert(
    gradtrack_optional_graduate_phone_is_valid(null),
    'a missing graduate contact number is accepted'
);
graduate_optional_contacts_assert(
    gradtrack_optional_graduate_phone_is_valid('09123456789'),
    'a valid graduate contact number is accepted'
);
graduate_optional_contacts_assert(
    !gradtrack_optional_graduate_phone_is_valid('9123456789'),
    'a malformed non-empty graduate contact number is rejected'
);

echo "Graduate optional contact validation tests passed.\n";
