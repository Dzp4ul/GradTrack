# GradTrack System - Algorithms Documentation
## For Thesis Chapter 1

---

## 1. AUTHENTICATION & SECURITY ALGORITHMS

### 1.1 Password Verification Algorithm
**Location:** `api/auth/login.php`
**Purpose:** Secure user authentication
**Process:**
- Compares user credentials against database
- Uses PHP's `password_verify()` for hashed password comparison
- Implements session management for authenticated users
- Fallback to hardcoded admin credentials

**Algorithm Steps:**
1. Receive email and password from user
2. Query database for user with matching email
3. Verify password using bcrypt hashing algorithm
4. Create session if credentials are valid
5. Return user data with role-based access

---

## 2. DATA PROCESSING & CALCULATION ALGORITHMS

### 2.1 Employment Rate Calculation Algorithm
**Location:** `api/dashboard/stats.php`, `api/reports/index.php`
**Purpose:** Calculate percentage of employed graduates
**Formula:**
```
Employment Rate = (Number of Employed Graduates / Total Graduates) × 100
```

**Algorithm Steps:**
1. Fetch all survey responses from database
2. Parse JSON responses to extract employment status
3. Count graduates marked as "employed" or "yes"
4. Divide by total responses and multiply by 100
5. Round to one decimal place

### 2.2 Job Alignment Rate Calculation Algorithm
**Location:** `api/dashboard/stats.php`, `api/surveys/analytics.php`
**Purpose:** Calculate percentage of graduates whose jobs align with their degree
**Formula:**
```
Alignment Rate = (Number of Aligned Jobs / Number of Employed) × 100
```

**Algorithm Steps:**
1. Fetch survey responses from database
2. Identify employment status questions using pattern matching
3. Identify job alignment questions using pattern matching
4. For each employed graduate:
   - Check if job is "directly related" to course → Aligned
   - Check if job is "partially related" → Partially Aligned
   - Otherwise → Not Aligned
5. Calculate alignment rate from aligned count
6. Return percentage rounded to one decimal

### 2.3 Average Time to Employment Algorithm
**Location:** `api/dashboard/stats.php`
**Purpose:** Calculate average months taken to find first job
**Formula:**
```
Avg Time = SUM(time_to_employment) / COUNT(employed_graduates)
```

**Algorithm Steps:**
1. Query employment table for employed graduates
2. Filter records with valid time_to_employment values (> 0)
3. Calculate average using SQL AVG() function
4. Round result to one decimal place

### 2.4 Employability Index Algorithm
**Location:** `api/dashboard/stats.php`
**Purpose:** Calculate program-specific employment success rate
**Formula:**
```
Employability Index = (Employed in Program / Total Graduates in Program) × 100
```

**Algorithm Steps:**
1. Group survey responses by degree program
2. For each program:
   - Count total graduates
   - Count employed graduates
   - Calculate percentage
3. Sort programs by employability index (descending)
4. Return ranked list

### 2.5 Alignment Index Algorithm
**Location:** `api/dashboard/stats.php`
**Purpose:** Calculate program-specific job alignment rate
**Formula:**
```
Alignment Index = (Aligned Jobs in Program / Employed in Program) × 100
```

**Algorithm Steps:**
1. Group employed graduates by program
2. For each program:
   - Count graduates with aligned jobs
   - Divide by employed count
   - Multiply by 100
3. Round to nearest integer

---

## 3. DATA ANALYSIS ALGORITHMS

### 3.1 Survey Response Parsing Algorithm
**Location:** `api/surveys/analytics.php`, `api/dashboard/stats.php`
**Purpose:** Extract meaningful data from JSON survey responses
**Process:**
- Decodes JSON response strings
- Maps question IDs to question text
- Extracts answers based on question type
- Categorizes responses for analysis

**Algorithm Steps:**
1. Fetch survey questions and create ID-to-text mapping
2. For each survey response:
   - Parse JSON string to array
   - Match question IDs with question text
   - Extract answer values
   - Store in structured format
3. Return organized data structure

### 3.2 Question Pattern Matching Algorithm
**Location:** `api/dashboard/stats.php`, `api/surveys/analytics.php`
**Purpose:** Identify specific question types using text patterns
**Patterns Detected:**
- Employment Status: "employment status", "presently employed", "are you employed"
- Job Alignment: "job related to", "related to your course"
- Degree Program: "degree program", "program"
- Year Graduated: "year graduated"

**Algorithm Steps:**
1. Convert question text to lowercase
2. Use `strpos()` to search for keyword patterns
3. Return boolean match result
4. Apply appropriate processing based on question type

### 3.3 Multiple Choice Analysis Algorithm
**Location:** `api/surveys/analytics.php`
**Purpose:** Analyze distribution of multiple choice responses
**Process:**
- Counts frequency of each option
- Calculates percentage distribution
- Returns sorted results

**Algorithm Steps:**
1. Initialize empty distribution array
2. For each answer:
   - Increment count for selected option
3. Calculate percentage for each option
4. Return array with option, count, and percentage

### 3.4 Checkbox Analysis Algorithm
**Location:** `api/surveys/analytics.php`
**Purpose:** Analyze multi-select checkbox responses
**Process:**
- Handles array or comma-separated string formats
- Counts frequency of each selected option
- Calculates percentage based on total responses

**Algorithm Steps:**
1. Initialize distribution array
2. For each response:
   - Parse answer (array or CSV string)
   - For each selected option:
     - Increment count
3. Calculate percentages
4. Return distribution data

### 3.5 Text Response Analysis Algorithm
**Location:** `api/surveys/analytics.php`
**Purpose:** Analyze open-ended text responses
**Metrics Calculated:**
- Total non-empty responses
- Average response length
- Sample responses (first 5)

**Algorithm Steps:**
1. Filter out empty responses
2. Count total valid responses
3. Calculate average character length
4. Extract sample responses
5. Return analysis object

---

## 4. REPORTING & VISUALIZATION ALGORITHMS

### 4.1 Program Statistics Aggregation Algorithm
**Location:** `api/dashboard/stats.php`, `api/reports/index.php`
**Purpose:** Generate comprehensive program-level statistics
**Data Collected:**
- Total graduates per program
- Employment count
- Alignment count
- Employability index
- Alignment index

**Algorithm Steps:**
1. Initialize empty program data structure
2. For each survey response:
   - Extract degree program
   - Extract employment status
   - Extract job alignment
3. Aggregate counts by program
4. Calculate indices for each program
5. Sort by employability index
6. Return ranked program statistics

### 4.2 Trend Analysis Algorithm
**Location:** `api/dashboard/stats.php`
**Purpose:** Track employment and alignment rates over time
**Process:**
- Retrieves historical data from database
- Updates current year with real-time data
- Generates time-series data for visualization

**Algorithm Steps:**
1. Query employment_trends table
2. Calculate current year rates from survey data
3. Update or insert current year record
4. If no historical data, generate sample trends
5. Return chronologically sorted array

### 4.3 At-Risk Program Identification Algorithm
**Location:** `api/dashboard/stats.php`
**Purpose:** Identify programs with low employability
**Threshold:** Employability Index < 70%

**Algorithm Steps:**
1. Calculate employability index for all programs
2. Filter programs where index < 70
3. Return list of at-risk program codes
4. Generate recommended actions

### 4.4 Alignment Distribution Algorithm
**Location:** `api/dashboard/stats.php`
**Purpose:** Calculate distribution of job alignment categories
**Categories:**
- Aligned (directly related)
- Partially Aligned
- Not Aligned

**Algorithm Steps:**
1. Count graduates in each alignment category
2. Calculate total employed for alignment
3. For each category:
   - Calculate percentage
   - Round to nearest integer
4. Return distribution array with counts and percentages

### 4.5 Program Code Mapping Algorithm
**Location:** `api/dashboard/stats.php`, `api/reports/index.php`
**Purpose:** Convert full program names to standard codes
**Mappings:**
- "Computer Science" → BSCS
- "Secondary Education" → BSED
- "Elementary Education" → BEED
- "Hospitality Management" → BSHM
- "Computer Technology" → ACT

**Algorithm Steps:**
1. Convert program name to lowercase
2. Check for known program keywords
3. If match found, return standard code
4. Otherwise, extract acronym using regex
5. Return 4-character code as fallback

---

## 5. DATA VALIDATION & FILTERING ALGORITHMS

### 5.1 Survey Response Validation Algorithm
**Location:** `api/surveys/responses.php`
**Purpose:** Validate survey submissions before storage
**Validations:**
- Required fields present
- Valid survey ID
- Valid JSON format
- Data type consistency

**Algorithm Steps:**
1. Check if survey_id exists
2. Validate responses is valid JSON
3. Verify required questions are answered
4. Sanitize input data
5. Return validation result

### 5.2 Graduate Search & Filter Algorithm
**Location:** `api/graduates/index.php`
**Purpose:** Filter graduate records based on multiple criteria
**Filters:**
- Name search (first/last name)
- Student ID search
- Email search
- Program filter
- Year graduated filter
- Employment status filter

**Algorithm Steps:**
1. Initialize empty WHERE clause array
2. For each active filter:
   - Add SQL condition with parameter binding
3. Combine conditions with AND operator
4. Apply pagination (limit/offset)
5. Execute query and return results

### 5.3 Pagination Algorithm
**Location:** `api/graduates/index.php`
**Purpose:** Implement efficient data pagination
**Parameters:**
- Page number (default: 1)
- Limit per page (default: 20, max: 100)

**Algorithm Steps:**
1. Validate page and limit parameters
2. Calculate offset: (page - 1) × limit
3. Count total matching records
4. Fetch limited records with offset
5. Calculate total pages: ceil(total / limit)
6. Return data with pagination metadata

---

## 6. SORTING & RANKING ALGORITHMS

### 6.1 Program Ranking Algorithm
**Location:** `api/dashboard/stats.php`
**Purpose:** Rank programs by employability performance
**Sorting Criteria:** Employability Index (descending)

**Algorithm Steps:**
1. Calculate employability index for all programs
2. Use `usort()` with custom comparator
3. Compare employability indices
4. Return sorted array (highest to lowest)

### 6.2 Top Jobs Ranking Algorithm
**Location:** `api/dashboard/stats.php`
**Purpose:** Identify most common job positions
**Sorting Criteria:** Graduate count per job (descending)

**Algorithm Steps:**
1. Query job_listings table
2. Order by graduate_count DESC
3. Limit to top 5 results
4. Return ranked job list

---

## 7. RECOMMENDATION ALGORITHMS

### 7.1 Action Recommendation Algorithm
**Location:** `api/dashboard/stats.php`
**Purpose:** Generate data-driven recommendations for improvement
**Rules:**
- If program employability < 70% → "Review [PROGRAM] Curriculum"
- If overall employment rate < 75% → "Enhance Career Placement Programs"
- If alignment rate < 70% → "Improve Course-Industry Alignment"
- Always include: "Strengthen Industry Partnerships", "Expand Internship Opportunities"

**Algorithm Steps:**
1. Analyze at-risk programs
2. Check employment rate threshold
3. Check alignment rate threshold
4. Generate specific recommendations
5. Add general recommendations
6. Return top 5 actions

---

## 8. ADDRESS & LOCATION ALGORITHMS

### 8.1 Hierarchical Address Selection Algorithm
**Location:** `src/data/philippineAddress.ts`
**Purpose:** Provide cascading address selection (Region → Province → City → Barangay)
**Data Structure:** Nested objects with parent-child relationships

**Algorithm Steps:**
1. User selects region
2. Filter provinces belonging to selected region
3. User selects province
4. Filter cities belonging to selected province
5. User selects city
6. Filter barangays belonging to selected city
7. Return complete address hierarchy

### 8.2 Fuzzy Address Matching Algorithm
**Location:** Survey form address fields
**Purpose:** Handle variations in address input
**Process:**
- Normalizes input (lowercase, trim)
- Matches against predefined lists
- Provides suggestions for partial matches

---

## 9. REAL-TIME UPDATE ALGORITHMS

### 9.1 Dashboard Auto-Refresh Algorithm
**Location:** `src/pages/admin/Dashboard.tsx`
**Purpose:** Update statistics when new data is available
**Trigger:** Component mount, page refresh

**Algorithm Steps:**
1. Fetch latest data from API on component mount
2. Parse response data
3. Update state with new values
4. Re-render charts and statistics
5. Handle loading and error states

### 9.2 Survey Response Counter Algorithm
**Location:** `api/dashboard/stats.php`
**Purpose:** Track total survey submissions in real-time
**Process:**
- Counts records in survey_responses table
- Updates dashboard card
- Reflects immediately after new submission

---

## 10. CHART & VISUALIZATION ALGORITHMS

### 10.1 Bar Chart Data Transformation Algorithm
**Location:** `src/pages/admin/Dashboard.tsx`, `src/pages/admin/Reports.tsx`
**Purpose:** Transform database results into chart-compatible format
**Output Format:**
```javascript
[
  { code: 'BSCS', employability_index: 82 },
  { code: 'BSHM', employability_index: 75 }
]
```

**Algorithm Steps:**
1. Fetch program statistics from API
2. Map to chart data format
3. Assign colors from predefined palette
4. Return formatted array

### 10.2 Pie Chart Distribution Algorithm
**Location:** `src/pages/admin/Dashboard.tsx`
**Purpose:** Calculate percentage distribution for pie charts
**Categories:** Aligned, Partially Aligned, Not Aligned

**Algorithm Steps:**
1. Count graduates in each category
2. Calculate total
3. For each category:
   - Calculate percentage: (count / total) × 100
   - Round to integer
4. Return array with name, value, and percentage

### 10.3 Line Chart Trend Algorithm
**Location:** `src/pages/admin/Dashboard.tsx`
**Purpose:** Display employment and alignment trends over time
**Data Points:** Year, Employment Rate, Alignment Rate

**Algorithm Steps:**
1. Fetch historical trend data
2. Sort by year ascending
3. Format for line chart (x: year, y: rate)
4. Return time-series array

---

## 11. EXPORT & REPORTING ALGORITHMS

### 11.1 Report Generation Algorithm
**Location:** `api/reports/index.php`
**Purpose:** Generate various report types on demand
**Report Types:**
- Overview Report
- By Program Report
- By Year Report
- Employment Status Report
- Salary Distribution Report

**Algorithm Steps:**
1. Receive report type parameter
2. Query relevant data from database
3. Apply calculations and aggregations
4. Format results according to report type
5. Return JSON response

---

## 12. SESSION MANAGEMENT ALGORITHMS

### 12.1 Session Creation Algorithm
**Location:** `api/auth/login.php`
**Purpose:** Create secure user sessions
**Process:**
- Starts PHP session
- Stores user data in session variables
- Sets session timeout

**Algorithm Steps:**
1. Call `session_start()`
2. Store user_id, email, username, role in $_SESSION
3. Set session cookie parameters
4. Return success response

### 12.2 Session Validation Algorithm
**Location:** `api/auth/check.php`
**Purpose:** Verify active user session
**Process:**
- Checks if session exists
- Validates session data
- Returns user information

**Algorithm Steps:**
1. Start session
2. Check if user_id exists in session
3. If valid, return user data
4. If invalid, return error

---

## 13. DATABASE QUERY OPTIMIZATION ALGORITHMS

### 13.1 JOIN Query Optimization
**Location:** `api/graduates/index.php`
**Purpose:** Efficiently retrieve related data
**Technique:** LEFT JOIN to combine graduates, programs, and employment tables

**Algorithm Steps:**
1. Use LEFT JOIN to link tables
2. Select only required columns
3. Apply WHERE filters
4. Use LIMIT and OFFSET for pagination
5. Return combined result set

### 13.2 Aggregate Query Algorithm
**Location:** `api/dashboard/stats.php`
**Purpose:** Calculate statistics using SQL aggregation
**Functions Used:** COUNT(), AVG(), SUM()

**Algorithm Steps:**
1. Use GROUP BY for categorical aggregation
2. Apply aggregate functions (COUNT, AVG)
3. Filter with HAVING clause if needed
4. Return aggregated results

---

## 14. ERROR HANDLING ALGORITHMS

### 14.1 Try-Catch Error Handler
**Location:** All API endpoints
**Purpose:** Gracefully handle exceptions
**Process:**
- Wraps database operations in try-catch
- Returns user-friendly error messages
- Logs errors for debugging

**Algorithm Steps:**
1. Wrap risky code in try block
2. Catch PDOException for database errors
3. Catch generic Exception for other errors
4. Return JSON error response with HTTP status code
5. Log error details

---

## 15. RESPONSE RATE CALCULATION ALGORITHM

### 15.1 Survey Response Rate Algorithm
**Location:** `api/surveys/analytics.php`
**Purpose:** Calculate percentage of graduates who completed survey
**Formula:**
```
Response Rate = (Survey Responses / Total Active Graduates) × 100
```

**Algorithm Steps:**
1. Count total active graduates in database
2. Count survey responses for specific survey
3. Divide responses by total graduates
4. Multiply by 100 and round to 2 decimals
5. Return percentage

---

## SUMMARY OF ALGORITHMS BY CATEGORY

### Statistical Calculations (5)
1. Employment Rate Calculation
2. Job Alignment Rate Calculation
3. Average Time to Employment
4. Employability Index
5. Alignment Index

### Data Analysis (5)
1. Survey Response Parsing
2. Question Pattern Matching
3. Multiple Choice Analysis
4. Checkbox Analysis
5. Text Response Analysis

### Reporting & Aggregation (5)
1. Program Statistics Aggregation
2. Trend Analysis
3. At-Risk Program Identification
4. Alignment Distribution
5. Program Code Mapping

### Data Management (4)
1. Survey Response Validation
2. Graduate Search & Filter
3. Pagination
4. Hierarchical Address Selection

### Ranking & Sorting (2)
1. Program Ranking
2. Top Jobs Ranking

### Visualization (3)
1. Bar Chart Data Transformation
2. Pie Chart Distribution
3. Line Chart Trend

### Security & Authentication (3)
1. Password Verification
2. Session Creation
3. Session Validation

### Optimization (2)
1. JOIN Query Optimization
2. Aggregate Query Algorithm

### Recommendations (2)
1. Action Recommendation
2. Dashboard Auto-Refresh

---

## TOTAL: 31 DISTINCT ALGORITHMS

This comprehensive list covers all major algorithms implemented in the GradTrack system, suitable for inclusion in your thesis Chapter 1.
