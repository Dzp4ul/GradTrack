-- Seed survey responses for analytics using existing graduates data.
-- Scope: 2021-2025 graduates only, with partial coverage (about 72%) so not all graduates are marked as answered.

USE gradtrack_db;

SET @active_survey_id := (
	SELECT id
	FROM surveys
	WHERE status = 'active'
	ORDER BY id DESC
	LIMIT 1
);

-- Guard check: stop early if no active survey exists.
SELECT @active_survey_id AS active_survey_id;

INSERT INTO survey_responses (survey_id, graduate_id, responses, submitted_at)
SELECT
	@active_survey_id AS survey_id,
	g.id AS graduate_id,
	JSON_OBJECT(
		'71', CONCAT(g.last_name, ', ', g.first_name),
		'72', COALESCE(NULLIF(g.address, ''), 'Norzagaray, Bulacan'),
		'73', COALESCE(NULLIF(g.email, ''), CONCAT(LOWER(REPLACE(g.first_name, ' ', '')), '.', LOWER(REPLACE(g.last_name, ' ', '')), '@example.com')),
		'74', COALESCE(NULLIF(g.phone, ''), CONCAT('044-', LPAD(MOD(g.id * 97, 10000000), 7, '0'))),
		'75', CONCAT('09', LPAD(MOD(g.id * 173, 1000000000), 9, '0')),
		'76', CASE MOD(g.id, 4)
			WHEN 0 THEN 'Single'
			WHEN 1 THEN 'Single'
			WHEN 2 THEN 'Married'
			ELSE 'Single'
		END,
		'77', CASE MOD(g.id, 2)
			WHEN 0 THEN 'Male'
			ELSE 'Female'
		END,
		'78', DATE_FORMAT(DATE_ADD('1998-01-01', INTERVAL MOD(g.id * 37, 3650) DAY), '%Y-%m-%d'),
		'79', 'Region III',
		'80', 'Bulacan',
		'81', 'Philippines',
		'82', COALESCE(p.name, p.code, 'Unknown Program'),
		'83', 'Norzagaray College',
		'84', CAST(g.year_graduated AS CHAR),
		'85', CASE MOD(g.id, 5)
			WHEN 0 THEN JSON_ARRAY('Cum Laude')
			WHEN 1 THEN JSON_ARRAY('Dean''s Lister')
			ELSE JSON_ARRAY('None')
		END,
		'86', CASE MOD(g.id, 3)
			WHEN 0 THEN 'Licensure Examination for Teachers'
			WHEN 1 THEN 'Civil Service Examination'
			ELSE 'None'
		END,
		'87', DATE_FORMAT(DATE_ADD('2022-01-15', INTERVAL MOD(g.id * 19, 900) DAY), '%Y-%m-%d'),
		'88', CAST(ROUND(70 + MOD(g.id * 11, 26) + (MOD(g.id, 10) / 10), 1) AS CHAR),
		'89', JSON_ARRAY('Affordable for the family', 'Strong passion for the field'),
		'90', CASE MOD(g.id, 3)
			WHEN 0 THEN 'Customer Service and Communication'
			WHEN 1 THEN 'Data Analytics Fundamentals'
			ELSE 'Classroom Management Strategies'
		END,
		'91', CASE MOD(g.id, 3)
			WHEN 0 THEN '3 months'
			WHEN 1 THEN '2 months'
			ELSE '1 month'
		END,
		'92', CASE MOD(g.id, 3)
			WHEN 0 THEN 'TESDA'
			WHEN 1 THEN 'Norzagaray College'
			ELSE 'Department of Labor and Employment'
		END,
		'93', CASE MOD(g.id, 4)
			WHEN 0 THEN 'None'
			WHEN 1 THEN 'Master in Education'
			WHEN 2 THEN 'Master in Business Administration'
			ELSE 'Master in Information Technology'
		END,
		'94', CASE MOD(g.id, 4)
			WHEN 0 THEN '0'
			WHEN 1 THEN '18'
			WHEN 2 THEN '24'
			ELSE '30'
		END,
		'95', CASE MOD(g.id, 4)
			WHEN 0 THEN 'N/A'
			ELSE 'Bulacan State University'
		END,
		'96', JSON_ARRAY('Career advancement', 'Professional growth'),
		'97', CASE MOD(g.id, 10)
			WHEN 0 THEN 'No'
			WHEN 1 THEN 'No'
			ELSE 'Yes'
		END,
		'98', CASE MOD(g.id, 10)
			WHEN 0 THEN JSON_ARRAY('Family concern', 'No job opportunity')
			WHEN 1 THEN JSON_ARRAY('Pursuing further studies')
			ELSE JSON_ARRAY('N/A')
		END,
		'99', 'Increase internship exposure and strengthen industry partnerships.',
		'100', 'Seeded for analytics testing'
	) AS responses,
	DATE_ADD('2021-01-01', INTERVAL MOD(g.id * 29, 1825) DAY) AS submitted_at
FROM graduates g
LEFT JOIN programs p ON p.id = g.program_id
LEFT JOIN survey_responses sr
	ON sr.survey_id = @active_survey_id
   AND sr.graduate_id = g.id
WHERE @active_survey_id IS NOT NULL
  AND g.year_graduated BETWEEN 2021 AND 2025
  AND sr.id IS NULL
  AND MOD(g.id, 100) < 72;

-- Verification summary for the selected cohort and active survey.
SELECT
	COUNT(*) AS total_2021_2025_graduates,
	SUM(CASE WHEN sr.id IS NOT NULL THEN 1 ELSE 0 END) AS answered,
	SUM(CASE WHEN sr.id IS NULL THEN 1 ELSE 0 END) AS not_answered,
	ROUND((SUM(CASE WHEN sr.id IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*)) * 100, 2) AS answered_rate
FROM graduates g
LEFT JOIN survey_responses sr
	ON sr.graduate_id = g.id
   AND sr.survey_id = @active_survey_id
WHERE g.year_graduated BETWEEN 2021 AND 2025;
