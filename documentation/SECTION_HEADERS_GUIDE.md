# Section Headers Implementation Guide

## Overview
This implementation adds support for section headers in surveys, allowing questions to be grouped under visible section titles (like Google Forms).

## Database Migration

### Step 1: Run the SQL Migration
Execute the following SQL in phpMyAdmin or MySQL CLI:

```sql
USE gradtrackdb;
ALTER TABLE survey_questions ADD COLUMN section VARCHAR(200) DEFAULT NULL AFTER survey_id;
```

Or run the migration file:
```bash
mysql -u root -p gradtrackdb < database/add_section_field.sql
```

## Features Implemented

### 1. Section Field in Questions
- Each question can now have an optional `section` field
- Questions with the same section name are grouped together
- Section headers are displayed as visual separators

### 2. Survey Template with Sections
The default Graduate Tracer Study Survey now includes 5 sections:
- **Personal Information** (12 questions)
- **Educational Background** (8 questions)
- **Trainings Attended After College** (4 questions)
- **Graduate Studies** (4 questions)
- **Employment Data** (18 questions)

### 3. Frontend Display
- Section headers appear as blue gradient banners
- Questions are grouped under their respective sections
- Clean, Google Forms-like appearance

### 4. Admin Panel
- Section field added to question editor
- Easy to assign questions to sections
- Preview shows section grouping

## How It Works

### Creating a Survey with Sections
1. Go to Survey Management
2. Click "Create Survey"
3. For each question, specify the section name in the "Section" field
4. Questions with the same section name will be grouped together

### Section Display Rules
- Section headers are NOT questions (no input fields)
- Section headers are visible to users taking the survey
- Questions are numbered globally across all sections
- Sections appear in the order of the first question in that section

## Example Structure

```javascript
{
  question_text: "Last Name",
  question_type: "text",
  section: "Personal Information",  // ← Section assignment
  is_required: 1,
  sort_order: 1
}
```

## Benefits
✅ Clean, organized survey layout
✅ Better user experience
✅ Logical grouping of related questions
✅ Professional appearance
✅ Easy to navigate long surveys
