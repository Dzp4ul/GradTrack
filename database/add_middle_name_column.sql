-- Add middle_name column to graduates table
ALTER TABLE graduates 
ADD COLUMN middle_name VARCHAR(100) AFTER first_name;
