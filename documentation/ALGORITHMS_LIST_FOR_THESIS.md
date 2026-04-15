# GradTrack System - Main Algorithms
## For Thesis Documentation

---

## Main Algorithm Used in GradTrack

The main algorithm used in GradTrack is a **Rule-Based Graduate Tracer Data Processing and Descriptive Analytics Algorithm**.

This means the system follows a set of programmed rules to collect survey responses, identify important graduate information, classify answers, calculate statistics, and present the results through dashboards and reports. It is supported by several smaller algorithms for security, validation, searching, filtering, reporting, and data management.

---

## 1. Rule-Based Graduate Tracer Data Processing Algorithm

This is the core algorithm of GradTrack. It processes graduate tracer survey responses and converts raw answers into useful information.

**Purpose:**
- Read submitted graduate survey responses
- Identify employment status, job alignment, program, and year graduated
- Classify graduates based on their answers
- Prepare data for analytics and reports

**Supporting Algorithms:**

1. **Survey Response Parsing Algorithm**
   - Parses JSON survey responses and extracts graduate answers.
   - Location: `api/surveys/analytics.php`, `api/dashboard/stats.php`, `api/reports/index.php`

2. **Question Pattern Matching Algorithm**
   - Identifies question types using keywords such as employment status, presently employed, job related to course, degree program, and year graduated.
   - Location: `api/dashboard/stats.php`, `api/surveys/analytics.php`, `api/reports/index.php`

3. **Employment Classification Algorithm**
   - Classifies graduates as employed or unemployed based on their survey answers.
   - Location: `api/dashboard/stats.php`, `api/reports/index.php`, `api/surveys/analytics.php`

4. **Job Alignment Classification Algorithm**
   - Classifies employed graduates as aligned, partially aligned, or not aligned based on whether their work is related to their course.
   - Location: `api/dashboard/stats.php`, `api/reports/index.php`, `api/surveys/analytics.php`

5. **String Manipulation Algorithm**
   - Cleans and standardizes text answers using trimming, lowercase conversion, and keyword checking.
   - Location: `api/dashboard/stats.php`, `api/reports/index.php`, `api/surveys/analytics.php`

6. **JSON Encoding and Decoding Algorithm**
   - Converts survey responses between JSON format and usable PHP or JavaScript data structures.
   - Location: Survey response APIs and reporting endpoints

---

## 2. Descriptive Statistical Analysis Algorithm

This algorithm computes the numerical results shown in the dashboard, reports, and survey analytics.

**Purpose:**
- Calculate graduate tracer statistics
- Convert raw counts into percentages
- Summarize graduate outcomes

**Supporting Algorithms:**

1. **Employment Rate Calculation Algorithm**
   - Formula:
     ```text
     Employment Rate = (Employed Graduates / Total Graduates) x 100
     ```
   - Location: `api/dashboard/stats.php`, `api/reports/index.php`

2. **Job Alignment Rate Calculation Algorithm**
   - Formula:
     ```text
     Alignment Rate = (Aligned Jobs / Employed Graduates) x 100
     ```
   - Location: `api/dashboard/stats.php`, `api/reports/index.php`, `api/surveys/analytics.php`

3. **Response Rate Calculation Algorithm**
   - Formula:
     ```text
     Response Rate = (Survey Responses / Total Graduates) x 100
     ```
   - Location: `api/surveys/analytics.php`, `api/dashboard/stats.php`

4. **Average Calculation Algorithm**
   - Calculates averages such as average time to employment.
   - Formula:
     ```text
     Average = Sum of Values / Number of Values
     ```
   - Location: `api/dashboard/stats.php`

5. **Frequency Distribution Algorithm**
   - Counts how many times each survey option is selected.
   - Location: `api/surveys/analytics.php`

6. **Percentage Calculation Algorithm**
   - Converts counts into percentages for charts, tables, and reports.
   - Location: Analytics and reporting endpoints

---

## 3. Data Aggregation and Reporting Algorithm

This algorithm groups and organizes processed graduate data for dashboard cards, charts, and downloadable reports.

**Purpose:**
- Group graduate data by program, year, employment status, and alignment
- Generate report-ready and chart-ready data
- Present organized tracer study results

**Supporting Algorithms:**

1. **Aggregation Algorithm**
   - Groups records by program, year, employment status, or category.
   - Location: `api/dashboard/stats.php`, `api/reports/index.php`

2. **Program Statistics Algorithm**
   - Computes total graduates, employed graduates, aligned graduates, employability index, and alignment index per program.
   - Location: `api/dashboard/stats.php`, `api/reports/index.php`

3. **Sorting Algorithm**
   - Sorts records by date, year, name, employability index, and other criteria.
   - Location: `api/dashboard/stats.php`, `api/graduates/index.php`, `api/surveys/index.php`

4. **Ranking Algorithm**
   - Ranks programs based on employability or alignment performance.
   - Location: `api/dashboard/stats.php`

5. **Data Transformation Algorithm**
   - Converts database results into formats used by charts, tables, and reports.
   - Location: Frontend dashboard and reports components

6. **SQL JOIN Algorithm**
   - Combines related records from graduates, programs, employment, surveys, and responses tables.
   - Location: `api/graduates/index.php`, `api/dashboard/stats.php`, `api/reports/index.php`

---

## 4. Search, Filtering, and Record Management Algorithm

This algorithm helps users manage and locate graduate records efficiently.

**Purpose:**
- Search graduate records
- Filter results based on selected criteria
- Display large datasets in manageable pages

**Supporting Algorithms:**

1. **Search Algorithm**
   - Searches graduate records using name, student ID, email, or related keywords.
   - Location: `api/graduates/index.php`

2. **Filtering Algorithm**
   - Filters records by program, year graduated, employment status, department, or survey.
   - Location: `api/graduates/index.php`, `api/reports/index.php`

3. **Pagination Algorithm**
   - Divides large datasets into pages using limit and offset.
   - Location: `api/graduates/index.php`

4. **CRUD Operation Algorithm**
   - Handles create, read, update, and delete operations for graduates, surveys, announcements, jobs, and other records.
   - Location: `api/graduates/index.php`, `api/surveys/index.php`, `api/announcements/index.php`

5. **HTTP Request Routing Algorithm**
   - Routes API requests based on HTTP methods such as GET, POST, PUT, and DELETE.
   - Location: API endpoints

---

## 5. Data Validation and Data Integrity Algorithm

This algorithm ensures that data entered into GradTrack is valid, consistent, and safely stored.

**Purpose:**
- Check required fields
- Prevent invalid or incomplete submissions
- Maintain database consistency

**Supporting Algorithms:**

1. **Data Validation Algorithm**
   - Validates form inputs, survey answers, email fields, required data, and submitted records.
   - Location: API endpoints and frontend forms

2. **Conditional Logic Algorithm**
   - Applies business rules such as checking employment status, classifying job alignment, and controlling access.
   - Location: Backend APIs and frontend components

3. **Transaction Management Algorithm**
   - Uses begin, commit, and rollback to keep database operations consistent.
   - Location: `api/surveys/index.php`, `api/surveys/responses.php`

4. **Error Handling Algorithm**
   - Handles system errors using try-catch blocks and returns proper responses.
   - Location: API endpoints

---

## 6. Recommendation and Decision-Support Algorithm

This algorithm helps GradTrack turn analytics into actionable suggestions.

**Purpose:**
- Identify areas that may need improvement
- Support institutional decision-making
- Recommend actions based on graduate tracer results

**Supporting Algorithms:**

1. **Threshold Detection Algorithm**
   - Detects conditions such as low employability or low alignment rate.
   - Example: At-risk programs are identified when employability is below 70%.
   - Location: `api/dashboard/stats.php`

2. **Recommendation Algorithm**
   - Generates suggested actions, such as reviewing program outcomes, sending survey reminders, or strengthening industry partnerships.
   - Location: `api/dashboard/stats.php`

---

## 7. Authentication and Security Algorithm

This algorithm protects system access and user accounts.

**Purpose:**
- Secure user login
- Verify user identity
- Maintain role-based access

**Supporting Algorithms:**

1. **Bcrypt Hashing Algorithm**
   - Securely hashes and verifies user passwords.
   - Location: `api/auth/login.php`, `api/auth/hash_passwords.php`

2. **Password Verification Algorithm**
   - Compares entered passwords with stored hashed passwords.
   - Location: `api/auth/login.php`

3. **Session Management Algorithm**
   - Maintains user login sessions and stores authenticated user roles.
   - Location: `api/auth/login.php`, `api/auth/check.php`

---

## 8. Predictive Analytics Algorithm

This algorithm is used when predictive analytics is enabled in GradTrack.

**Purpose:**
- Forecast possible employment and alignment trends
- Analyze historical graduate tracer data
- Support future planning

**Supporting Algorithm:**

1. **Linear Regression Algorithm**
   - Uses historical yearly data to forecast future employment rate and alignment rate.
   - Location: `api/reports/predictive-analytics.php`

   Formula:
   ```text
   y = mx + b
   ```

   Where:
   - `y` is the predicted value
   - `m` is the slope
   - `x` is the year or time index
   - `b` is the intercept

---

## 9. User Interface and Frontend Data Handling Algorithm

This algorithm supports the frontend behavior of GradTrack.

**Purpose:**
- Manage interface data
- Update charts and tables
- Improve user interaction

**Supporting Algorithms:**

1. **State Management Algorithm**
   - Manages frontend data using React hooks such as `useState` and `useEffect`.
   - Location: React components

2. **Real-Time Data Refresh Algorithm**
   - Fetches and updates dashboard and report data when pages load or users perform actions.
   - Location: Frontend dashboard and report components

3. **Array Manipulation Algorithm**
   - Uses map, filter, and reduce-style operations to organize data in the frontend.
   - Location: React components

4. **Date and Time Calculation Algorithm**
   - Handles dates such as current year, graduation year, and time to employment.
   - Location: Dashboard, reports, and related APIs

5. **Hierarchical Address Selection Algorithm**
   - Provides cascading address selection such as Region, Province, City or Municipality, and Barangay.
   - Location: `src/data/philippineAddress.ts`, `src/pages/Survey.tsx`

---

## Summary

GradTrack does not use only one algorithm. Its main algorithm is the **Rule-Based Graduate Tracer Data Processing and Descriptive Analytics Algorithm**, supported by algorithms for statistical calculation, aggregation, reporting, searching, filtering, validation, recommendation, security, predictive analytics, and frontend data handling.

In simple terms, the system collects graduate data, processes it through rule-based classification, calculates important tracer study statistics, and presents the results in an organized and reliable way for Norzagaray College.
