# Survey Management Updates

## Changes Made

### 1. Survey Template from Homepage
- Extracted the complete survey structure from `Survey.tsx` (homepage)
- Created a default template with all 4 sections:
  - **Section A**: General Information (11 questions)
  - **Section B**: Educational Background (8 questions)
  - **Section C**: Training / Advance Studies (7 questions)
  - **Section D**: Employment Data (3 questions)
- Total: 29 questions covering the complete graduate tracer study

### 2. New Features in Survey Management

#### Load Template Button
- Green "Load Template" button in the header
- Automatically populates the survey form with the complete template
- Includes all questions with proper types (text, multiple_choice, checkbox)
- Pre-configured with required/optional settings

#### Clear All Surveys Button
- Red "Clear All Surveys" button (appears when surveys exist)
- Double confirmation to prevent accidental deletion
- Removes ALL surveys, questions, and responses
- Resets auto-increment counters

### 3. API Endpoints

#### New: `/api/surveys/clear.php`
- POST method to clear all survey data
- Deletes from 3 tables:
  - survey_responses
  - survey_questions
  - surveys
- Uses transactions for data integrity
- Resets auto-increment IDs

### 4. User Interface Updates

#### Empty State
- Shows when no surveys exist
- Displays both "Load Template" and "Create Survey" buttons
- Helpful message guiding users

#### Survey List View
- "Clear All Surveys" button at the top
- Existing features remain intact:
  - View responses
  - Edit survey
  - Delete individual survey
  - Preview questions

### 5. Template Structure

The template includes all question types from the homepage survey:
- **Text fields**: Name, address, email, etc.
- **Multiple choice**: Civil status, sex, employment status
- **Checkbox**: Honors, reasons for course, training reasons
- **Required/Optional**: Properly configured based on survey logic

## How to Use

### Load the Template
1. Go to Admin → Survey Management
2. Click "Load Template" button (green)
3. Review the pre-filled 29 questions
4. Modify title/description if needed
5. Click "Create Survey"

### Clear All Data
1. Click "Clear All Surveys" (red button)
2. Confirm twice (safety measure)
3. All survey data will be permanently deleted

### Create Custom Survey
1. Click "Create Survey" button
2. Add questions manually
3. Configure question types and options
4. Save the survey

## Benefits

1. **Quick Setup**: Load complete survey template in one click
2. **Consistency**: Same structure as homepage survey
3. **Flexibility**: Can modify template before saving
4. **Safety**: Double confirmation for data deletion
5. **Clean Slate**: Easy to reset and start fresh
