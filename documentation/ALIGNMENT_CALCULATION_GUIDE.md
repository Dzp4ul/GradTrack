# Alignment Rate Dynamic Calculation - Implementation Guide

## Overview
The alignment rate is now dynamically calculated based on survey responses where graduates indicate whether their job role matches their field of study.

## Changes Made

### 1. Reports API (`api/reports/index.php`)
Updated all report types to calculate alignment from survey responses:

#### Overview Report
- Parses survey responses to find employment status questions
- Identifies job alignment questions (e.g., "Is your job related to your course?")
- Counts as "Aligned" when response is "Yes, directly related" or similar
- Calculates alignment rate: (aligned_count / employed_count) * 100

#### By Program Report
- Tracks alignment per program based on survey responses
- Counts aligned, partially aligned, and not aligned for each program
- Updates program statistics with real-time alignment data

#### By Year Report
- Calculates alignment rate per graduation year
- Based on survey responses from graduates of each year

#### Employment Status Report
- Updated to recognize multiple employment status formats
- Handles "Employed", "Yes", "Unemployed", "No" responses

### 2. Dashboard Stats API (`api/dashboard/stats.php`)
Updated dashboard calculations:

- **Alignment Rate**: Calculated from survey responses instead of employment table
- **Alignment Distribution**: Pie chart data now reflects survey responses
  - Aligned: Job directly related to course
  - Partially Aligned: Job somewhat related
  - Not Aligned: Job not related
- **Employment Trends**: Current year data updated with real-time alignment rate
- **Program Stats**: Added alignment_index for each program

### 3. Survey Question Detection
The system looks for these question patterns:

**Employment Status:**
- "employment status"
- "presently employed"
- "are you employed"

**Job Alignment:**
- "job related to"
- "related to your course"
- "current job related"

**Alignment Classification:**
- **Aligned**: "Yes, directly related", "Yes", "Directly related"
- **Partially Aligned**: "Partially related", "Somewhat related"
- **Not Aligned**: "Not related", "No"

## How It Works

### Calculation Flow
1. Fetch all survey responses from database
2. Parse each response JSON to extract answers
3. For each response:
   - Check if graduate is employed
   - Check job alignment answer
   - Classify as aligned/partially aligned/not aligned
4. Calculate rates:
   - Employment Rate = (employed / total_responses) * 100
   - Alignment Rate = (aligned / employed) * 100

### Real-time Updates
- Dashboard and reports refresh data on each page load
- No caching - always shows current survey data
- Changes in survey responses immediately reflect in charts and tables

## Testing

### Test Script
Run `api/test-alignment.php` in browser to verify:
- Survey question detection
- Response parsing
- Alignment classification
- Rate calculation

### Expected Behavior
1. When a graduate submits a survey indicating their job is related to their course → Alignment rate increases
2. When a graduate indicates job is not related → Alignment rate may decrease
3. Dashboard charts update immediately after survey submission

## Database Schema
No database changes required. The system uses existing tables:
- `survey_responses`: Stores graduate survey answers
- `survey_questions`: Contains question text for pattern matching
- `surveys`: Active survey tracking

## Frontend Integration
The frontend components automatically display the updated data:
- **Dashboard.tsx**: Shows alignment rate card and distribution pie chart
- **Reports.tsx**: Displays alignment metrics in all report tabs

## Maintenance Notes

### Adding New Survey Questions
If you add new job alignment questions:
1. Ensure question text includes keywords like "related to your course"
2. Use consistent answer options: "Yes, directly related", "Partially related", "Not related"
3. Test with `test-alignment.php` script

### Troubleshooting
- If alignment rate shows 0%: Check if survey has job alignment questions
- If data not updating: Verify survey status is 'active'
- If incorrect calculations: Review question text patterns in code

## Future Enhancements
- Add admin interface to configure alignment keywords
- Store alignment calculation in cache for performance
- Add historical alignment tracking per graduate
- Generate alignment reports by industry/job title
