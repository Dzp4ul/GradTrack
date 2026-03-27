-- Add section field to survey_questions table
ALTER TABLE survey_questions ADD COLUMN section VARCHAR(200) DEFAULT NULL AFTER survey_id;
