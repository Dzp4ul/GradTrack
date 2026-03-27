-- Fix survey_responses table to allow anonymous submissions
-- Run this in phpMyAdmin or MySQL CLI

USE gradtrackdb;

-- Modify survey_responses table to allow NULL graduate_id
ALTER TABLE survey_responses 
MODIFY COLUMN graduate_id INT NULL;

-- This allows anonymous survey submissions where graduate_id can be NULL
