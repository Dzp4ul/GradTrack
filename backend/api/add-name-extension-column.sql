ALTER TABLE graduates
ADD COLUMN IF NOT EXISTS name_extension VARCHAR(20) NULL AFTER last_name;
