<?php

if (!function_exists('gradtrack_ensure_graduate_profile_table')) {
    function gradtrack_ensure_graduate_profile_table(PDO $db): void
    {
        $db->exec("CREATE TABLE IF NOT EXISTS graduate_profiles (
            id INT AUTO_INCREMENT PRIMARY KEY,
            graduate_account_id INT NOT NULL UNIQUE,
            first_name VARCHAR(50) NOT NULL,
            middle_name VARCHAR(100) NULL,
            last_name VARCHAR(50) NOT NULL,
            phone_number VARCHAR(30) NULL,
            birthday DATE NULL,
            civil_status VARCHAR(50) NULL,
            sex_gender VARCHAR(50) NULL,
            program_course VARCHAR(180) NULL,
            graduation_year SMALLINT UNSIGNED NULL,
            current_location VARCHAR(500) NULL,
            job_title VARCHAR(200) NULL,
            company_name VARCHAR(200) NULL,
            employment_location VARCHAR(255) NULL,
            professional_status VARCHAR(100) NULL,
            start_date DATE NULL,
            initialized_from_survey_response_id INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_graduate_profiles_survey_response (initialized_from_survey_response_id),
            CONSTRAINT fk_graduate_profiles_account FOREIGN KEY (graduate_account_id) REFERENCES graduate_accounts(id) ON DELETE CASCADE,
            CONSTRAINT fk_graduate_profiles_survey_response FOREIGN KEY (initialized_from_survey_response_id) REFERENCES survey_responses(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    }
}

if (!function_exists('gradtrack_editable_profile_field_value')) {
    function gradtrack_editable_profile_field_value(array $fields, string $key): ?string
    {
        foreach ($fields as $field) {
            if (($field['key'] ?? '') !== $key) {
                continue;
            }

            $value = trim((string) ($field['value'] ?? ''));
            return $value !== '' ? $value : null;
        }

        return null;
    }
}

if (!function_exists('gradtrack_editable_profile_nullable_text')) {
    function gradtrack_editable_profile_nullable_text($value, int $maxLength, string $label): ?string
    {
        $text = trim((string) ($value ?? ''));
        if ($text === '') {
            return null;
        }

        if (strlen($text) > $maxLength) {
            throw new InvalidArgumentException($label . ' must not exceed ' . $maxLength . ' characters');
        }

        return $text;
    }
}

if (!function_exists('gradtrack_editable_profile_date')) {
    function gradtrack_editable_profile_date($value, string $label, bool $allowFuture = false): ?string
    {
        $text = trim((string) ($value ?? ''));
        if ($text === '') {
            return null;
        }

        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $text);
        if (!$date || $date->format('Y-m-d') !== $text) {
            throw new InvalidArgumentException($label . ' must be a valid date');
        }

        $year = (int) $date->format('Y');
        if ($year < 1900 || (!$allowFuture && $date > new DateTimeImmutable('today'))) {
            throw new InvalidArgumentException($label . ' must be a valid past or current date');
        }

        return $text;
    }
}

if (!function_exists('gradtrack_editable_profile_seed_date')) {
    function gradtrack_editable_profile_seed_date($value): ?string
    {
        try {
            return gradtrack_editable_profile_date($value, 'Date');
        } catch (InvalidArgumentException $exception) {
            return null;
        }
    }
}

if (!function_exists('gradtrack_editable_profile_seed')) {
    function gradtrack_editable_profile_seed(array $user, ?array $surveyProfile): array
    {
        $personalFields = is_array($surveyProfile['personal']['fields'] ?? null)
            ? $surveyProfile['personal']['fields']
            : [];
        $educationFields = is_array($surveyProfile['education']['fields'] ?? null)
            ? $surveyProfile['education']['fields']
            : [];
        $workSummary = is_array($surveyProfile['work']['summary'] ?? null)
            ? $surveyProfile['work']['summary']
            : [];

        $graduationYearValue = gradtrack_editable_profile_field_value($educationFields, 'year_graduated')
            ?: ($user['year_graduated'] ?? null);
        $graduationYear = null;
        if (preg_match('/(?:19|20)\d{2}/', (string) $graduationYearValue, $yearMatch)) {
            $graduationYear = (int) $yearMatch[0];
        }
        $accountPhone = trim((string) ($user['phone'] ?? ''));
        $initialPhone = $accountPhone !== ''
            ? $accountPhone
            : gradtrack_editable_profile_field_value($personalFields, 'telephone');

        return [
            'graduate_account_id' => (int) $user['account_id'],
            'first_name' => trim((string) ($user['first_name'] ?? '')),
            'middle_name' => gradtrack_editable_profile_nullable_text($user['middle_name'] ?? null, 100, 'Middle name'),
            'last_name' => trim((string) ($user['last_name'] ?? '')),
            'phone_number' => gradtrack_editable_profile_nullable_text(
                $initialPhone,
                30,
                'Phone number'
            ),
            'birthday' => gradtrack_editable_profile_seed_date(gradtrack_editable_profile_field_value($personalFields, 'birthday')),
            'civil_status' => gradtrack_editable_profile_nullable_text(gradtrack_editable_profile_field_value($personalFields, 'civil_status'), 50, 'Civil status'),
            'sex_gender' => gradtrack_editable_profile_nullable_text(gradtrack_editable_profile_field_value($personalFields, 'sex'), 50, 'Sex / gender'),
            'program_course' => gradtrack_editable_profile_nullable_text(
                gradtrack_editable_profile_field_value($educationFields, 'degree_program')
                    ?: ($user['program_name'] ?? $user['program_code'] ?? null),
                180,
                'Program / course'
            ),
            'graduation_year' => $graduationYear,
            'current_location' => gradtrack_editable_profile_nullable_text(
                gradtrack_editable_profile_field_value($personalFields, 'current_location')
                    ?: ($user['address'] ?? null),
                500,
                'Current location'
            ),
            'job_title' => gradtrack_editable_profile_nullable_text($workSummary['current_job_title'] ?? null, 200, 'Job title'),
            'company_name' => gradtrack_editable_profile_nullable_text($workSummary['company'] ?? null, 200, 'Company name'),
            'employment_location' => gradtrack_editable_profile_nullable_text($workSummary['location'] ?? null, 255, 'Employment location'),
            'professional_status' => gradtrack_editable_profile_nullable_text($workSummary['employment_status'] ?? null, 100, 'Professional status'),
            'start_date' => gradtrack_editable_profile_seed_date($workSummary['start_date'] ?? null),
            'initialized_from_survey_response_id' => isset($surveyProfile['response']['id'])
                ? (int) $surveyProfile['response']['id']
                : null,
        ];
    }
}

if (!function_exists('gradtrack_editable_profile_find')) {
    function gradtrack_editable_profile_find(PDO $db, int $accountId): ?array
    {
        $stmt = $db->prepare('SELECT * FROM graduate_profiles WHERE graduate_account_id = :account_id LIMIT 1');
        $stmt->execute([':account_id' => $accountId]);
        $profile = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$profile) {
            return null;
        }

        $profile['id'] = (int) $profile['id'];
        $profile['graduate_account_id'] = (int) $profile['graduate_account_id'];
        $profile['graduation_year'] = $profile['graduation_year'] !== null ? (int) $profile['graduation_year'] : null;
        $profile['initialized_from_survey_response_id'] = $profile['initialized_from_survey_response_id'] !== null
            ? (int) $profile['initialized_from_survey_response_id']
            : null;

        return $profile;
    }
}

if (!function_exists('gradtrack_editable_profile_ensure')) {
    function gradtrack_editable_profile_ensure(PDO $db, array $user, ?array $surveyProfile): array
    {
        gradtrack_ensure_graduate_profile_table($db);
        $existing = gradtrack_editable_profile_find($db, (int) $user['account_id']);
        if ($existing) {
            return $existing;
        }

        $seed = gradtrack_editable_profile_seed($user, $surveyProfile);
        if ($seed['first_name'] === '' || $seed['last_name'] === '') {
            throw new RuntimeException('Graduate profile cannot be initialized without a full name');
        }

        $stmt = $db->prepare('INSERT IGNORE INTO graduate_profiles
            (graduate_account_id, first_name, middle_name, last_name, phone_number, birthday,
             civil_status, sex_gender, program_course, graduation_year, current_location,
             job_title, company_name, employment_location, professional_status, start_date,
             initialized_from_survey_response_id)
            VALUES
            (:graduate_account_id, :first_name, :middle_name, :last_name, :phone_number, :birthday,
             :civil_status, :sex_gender, :program_course, :graduation_year, :current_location,
             :job_title, :company_name, :employment_location, :professional_status, :start_date,
             :initialized_from_survey_response_id)');
        $stmt->execute([
            ':graduate_account_id' => $seed['graduate_account_id'],
            ':first_name' => $seed['first_name'],
            ':middle_name' => $seed['middle_name'],
            ':last_name' => $seed['last_name'],
            ':phone_number' => $seed['phone_number'],
            ':birthday' => $seed['birthday'],
            ':civil_status' => $seed['civil_status'],
            ':sex_gender' => $seed['sex_gender'],
            ':program_course' => $seed['program_course'],
            ':graduation_year' => $seed['graduation_year'],
            ':current_location' => $seed['current_location'],
            ':job_title' => $seed['job_title'],
            ':company_name' => $seed['company_name'],
            ':employment_location' => $seed['employment_location'],
            ':professional_status' => $seed['professional_status'],
            ':start_date' => $seed['start_date'],
            ':initialized_from_survey_response_id' => $seed['initialized_from_survey_response_id'],
        ]);

        $profile = gradtrack_editable_profile_find($db, (int) $user['account_id']);
        if (!$profile) {
            throw new RuntimeException('Unable to initialize graduate profile');
        }

        return $profile;
    }
}

if (!function_exists('gradtrack_editable_profile_validate_input')) {
    function gradtrack_editable_profile_validate_input(array $input): array
    {
        $firstName = trim((string) ($input['first_name'] ?? ''));
        $lastName = trim((string) ($input['last_name'] ?? ''));
        if ($firstName === '' || $lastName === '') {
            throw new InvalidArgumentException('First name and last name are required');
        }
        if (strlen($firstName) > 50 || strlen($lastName) > 50) {
            throw new InvalidArgumentException('First name and last name must not exceed 50 characters');
        }

        $phone = gradtrack_editable_profile_nullable_text($input['phone_number'] ?? null, 30, 'Phone number');
        if ($phone !== null && !preg_match('/^[0-9+()\-.\s]+$/', $phone)) {
            throw new InvalidArgumentException('Phone number contains unsupported characters');
        }

        $graduationYear = null;
        $graduationYearText = trim((string) ($input['graduation_year'] ?? ''));
        if ($graduationYearText !== '') {
            if (!ctype_digit($graduationYearText)) {
                throw new InvalidArgumentException('Graduation year must be a valid year');
            }
            $graduationYear = (int) $graduationYearText;
            $maximumYear = (int) date('Y') + 1;
            if ($graduationYear < 1900 || $graduationYear > $maximumYear) {
                throw new InvalidArgumentException('Graduation year must be between 1900 and ' . $maximumYear);
            }
        }

        return [
            'first_name' => $firstName,
            'middle_name' => gradtrack_editable_profile_nullable_text($input['middle_name'] ?? null, 100, 'Middle name'),
            'last_name' => $lastName,
            'phone_number' => $phone,
            'birthday' => gradtrack_editable_profile_date($input['birthday'] ?? null, 'Birthday'),
            'civil_status' => gradtrack_editable_profile_nullable_text($input['civil_status'] ?? null, 50, 'Civil status'),
            'sex_gender' => gradtrack_editable_profile_nullable_text($input['sex_gender'] ?? null, 50, 'Sex / gender'),
            'program_course' => gradtrack_editable_profile_nullable_text($input['program_course'] ?? null, 180, 'Program / course'),
            'graduation_year' => $graduationYear,
            'current_location' => gradtrack_editable_profile_nullable_text($input['current_location'] ?? null, 500, 'Current location'),
            'job_title' => gradtrack_editable_profile_nullable_text($input['job_title'] ?? null, 200, 'Job title'),
            'company_name' => gradtrack_editable_profile_nullable_text($input['company_name'] ?? null, 200, 'Company name'),
            'employment_location' => gradtrack_editable_profile_nullable_text($input['employment_location'] ?? null, 255, 'Employment location'),
            'professional_status' => gradtrack_editable_profile_nullable_text($input['professional_status'] ?? null, 100, 'Professional status'),
            'start_date' => gradtrack_editable_profile_date($input['start_date'] ?? null, 'Start date'),
        ];
    }
}

if (!function_exists('gradtrack_editable_profile_update')) {
    function gradtrack_editable_profile_update(PDO $db, int $accountId, array $input): array
    {
        $values = gradtrack_editable_profile_validate_input($input);
        $stmt = $db->prepare('UPDATE graduate_profiles
                              SET first_name = :first_name,
                                  middle_name = :middle_name,
                                  last_name = :last_name,
                                  phone_number = :phone_number,
                                  birthday = :birthday,
                                  civil_status = :civil_status,
                                  sex_gender = :sex_gender,
                                  program_course = :program_course,
                                  graduation_year = :graduation_year,
                                  current_location = :current_location,
                                  job_title = :job_title,
                                  company_name = :company_name,
                                  employment_location = :employment_location,
                                  professional_status = :professional_status,
                                  start_date = :start_date
                              WHERE graduate_account_id = :account_id');
        $stmt->execute([
            ':first_name' => $values['first_name'],
            ':middle_name' => $values['middle_name'],
            ':last_name' => $values['last_name'],
            ':phone_number' => $values['phone_number'],
            ':birthday' => $values['birthday'],
            ':civil_status' => $values['civil_status'],
            ':sex_gender' => $values['sex_gender'],
            ':program_course' => $values['program_course'],
            ':graduation_year' => $values['graduation_year'],
            ':current_location' => $values['current_location'],
            ':job_title' => $values['job_title'],
            ':company_name' => $values['company_name'],
            ':employment_location' => $values['employment_location'],
            ':professional_status' => $values['professional_status'],
            ':start_date' => $values['start_date'],
            ':account_id' => $accountId,
        ]);

        $profile = gradtrack_editable_profile_find($db, $accountId);
        if (!$profile) {
            throw new RuntimeException('Graduate profile was not found after saving');
        }

        return $profile;
    }
}
