-- Add 'date' type to survey_questions question_type ENUM
-- This allows date picker fields in surveys

ALTER TABLE survey_questions 
MODIFY COLUMN question_type ENUM('text', 'date', 'multiple_choice', 'rating', 'checkbox') 
DEFAULT 'text';

-- Update existing Birthday questions to use date type
UPDATE survey_questions 
SET question_type = 'date' 
WHERE question_text = 'Birthday';
