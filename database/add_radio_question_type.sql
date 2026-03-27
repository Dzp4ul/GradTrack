-- Add 'radio' type to survey_questions question_type ENUM
-- This allows radio button fields in surveys

ALTER TABLE survey_questions 
MODIFY COLUMN question_type ENUM('text', 'date', 'multiple_choice', 'radio', 'rating', 'checkbox') 
DEFAULT 'text';
