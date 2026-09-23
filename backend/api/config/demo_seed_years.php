<?php
declare(strict_types=1);

/**
 * The legacy demo graduate import used 2021-2025 and a four-years-earlier
 * student-number prefix. These constants identify that exact legacy shape;
 * they are not application-wide graduation-year limits.
 */
function gradtrack_demo_legacy_graduation_years(): array
{
    return [2021, 2022, 2023, 2024, 2025];
}

function gradtrack_demo_target_graduation_years(): array
{
    return [2016, 2017, 2018, 2019, 2020];
}

function gradtrack_demo_expected_legacy_distribution(): array
{
    return [
        2021 => 88,
        2022 => 274,
        2023 => 299,
        2024 => 187,
        2025 => 307,
    ];
}

function gradtrack_demo_student_number_parts(string $studentId): ?array
{
    if (preg_match('/^(\d{4})(-\d+)$/', trim($studentId), $matches) !== 1) {
        return null;
    }

    return [
        'prefix' => (int)$matches[1],
        'suffix' => $matches[2],
    ];
}

function gradtrack_is_legacy_demo_graduate(array $graduate): bool
{
    $year = (int)($graduate['year_graduated'] ?? 0);
    $parts = gradtrack_demo_student_number_parts((string)($graduate['student_id'] ?? ''));

    return in_array($year, gradtrack_demo_legacy_graduation_years(), true)
        && $parts !== null
        && $parts['prefix'] === $year - 4;
}

/**
 * Build a stable, balanced migration plan while preserving every numeric
 * student-number suffix. A suffix may occur in multiple legacy batches, so a
 * target year is used at most once within each suffix group.
 *
 * @return array<int, array{graduate_id:int, old_student_id:string,
 *     old_year:int, new_student_id:string, new_year:int}>
 */
function gradtrack_build_demo_year_assignments(array $graduates): array
{
    $targetYears = gradtrack_demo_target_graduation_years();
    $groups = [];

    foreach ($graduates as $graduate) {
        if (!gradtrack_is_legacy_demo_graduate($graduate)) {
            throw new InvalidArgumentException('The demo-year planner received a row outside the legacy demo signature.');
        }

        $parts = gradtrack_demo_student_number_parts((string)$graduate['student_id']);
        $groups[$parts['suffix']][] = $graduate;
    }

    uksort($groups, 'strnatcmp');
    $globalCounts = array_fill_keys($targetYears, 0);
    $programCounts = [];
    $assignments = [];

    foreach ($groups as $suffix => $group) {
        $suffix = (string)$suffix;
        if (count($group) > count($targetYears)) {
            throw new RuntimeException("Student-number suffix {$suffix} occurs more than once per available target year.");
        }

        usort($group, static function (array $left, array $right): int {
            return [(int)($left['program_id'] ?? 0), (int)$left['year_graduated'], (int)$left['id']]
                <=> [(int)($right['program_id'] ?? 0), (int)$right['year_graduated'], (int)$right['id']];
        });

        $usedYears = [];
        $rotation = ((int)sprintf('%u', crc32($suffix))) % count($targetYears);
        foreach ($group as $groupIndex => $graduate) {
            $programKey = (string)(int)($graduate['program_id'] ?? 0);
            if (!isset($programCounts[$programKey])) {
                $programCounts[$programKey] = array_fill_keys($targetYears, 0);
            }

            $availableYears = array_values(array_filter(
                $targetYears,
                static fn (int $year): bool => !isset($usedYears[$year])
            ));
            usort($availableYears, static function (int $left, int $right) use (
                $globalCounts,
                $programCounts,
                $programKey,
                $targetYears,
                $rotation,
                $groupIndex
            ): int {
                $globalComparison = $globalCounts[$left] <=> $globalCounts[$right];
                if ($globalComparison !== 0) {
                    return $globalComparison;
                }

                $programComparison = $programCounts[$programKey][$left] <=> $programCounts[$programKey][$right];
                if ($programComparison !== 0) {
                    return $programComparison;
                }

                $leftIndex = array_search($left, $targetYears, true);
                $rightIndex = array_search($right, $targetYears, true);
                $tieStart = ($rotation + $groupIndex) % count($targetYears);
                $leftRank = ($leftIndex - $tieStart + count($targetYears)) % count($targetYears);
                $rightRank = ($rightIndex - $tieStart + count($targetYears)) % count($targetYears);
                return $leftRank <=> $rightRank;
            });

            $newYear = $availableYears[0];
            $newStudentId = (string)($newYear - 4) . $suffix;
            $graduateId = (int)$graduate['id'];
            $assignments[$graduateId] = [
                'graduate_id' => $graduateId,
                'old_student_id' => (string)$graduate['student_id'],
                'old_year' => (int)$graduate['year_graduated'],
                'new_student_id' => $newStudentId,
                'new_year' => $newYear,
            ];

            $usedYears[$newYear] = true;
            $globalCounts[$newYear]++;
            $programCounts[$programKey][$newYear]++;
        }
    }

    ksort($assignments, SORT_NUMERIC);
    return $assignments;
}

function gradtrack_demo_assignment_distribution(array $assignments): array
{
    $distribution = array_fill_keys(gradtrack_demo_target_graduation_years(), 0);
    foreach ($assignments as $assignment) {
        $year = (int)($assignment['new_year'] ?? 0);
        if (!array_key_exists($year, $distribution)) {
            throw new InvalidArgumentException('The demo-year plan contains an unsupported target year.');
        }
        $distribution[$year]++;
    }
    return $distribution;
}
