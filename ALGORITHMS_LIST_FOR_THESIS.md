# GradTrack System - List of Algorithms
## For Thesis Chapter 1

---

## ALGORITHMS USED IN THE SYSTEM:

1. **Bcrypt Hashing Algorithm (PASSWORD_BCRYPT)**
   - Used for secure password hashing and verification
   - Location: `api/auth/login.php`, `api/auth/hash_passwords.php`

2. **Session Management Algorithm**
   - Manages user authentication sessions
   - Location: `api/auth/login.php`, `api/auth/check.php`

3. **CRUD Operation Algorithms**
   - Create, Read, Update, Delete operations for all entities
   - Location: `api/graduates/index.php`, `api/surveys/index.php`, `api/announcements/index.php`

4. **JSON Encoding/Decoding Algorithm**
   - Serialization and deserialization of data
   - Location: All API endpoints, survey responses

5. **Sorting Algorithm (SQL ORDER BY)**
   - Sorts data by various criteria (date, name, employability index)
   - Location: `api/dashboard/stats.php`, `api/graduates/index.php`, `api/surveys/index.php`

6. **Search Algorithm (Pattern Matching)**
   - Searches graduates by name, student ID, email using SQL LIKE
   - Location: `api/graduates/index.php`

7. **Pagination Algorithm**
   - Divides large datasets into pages using LIMIT and OFFSET
   - Location: `api/graduates/index.php`

8. **Filtering Algorithm**
   - Filters data by program, year, employment status
   - Location: `api/graduates/index.php`, `api/reports/index.php`

9. **Statistical Calculation Algorithms**
   - Employment Rate Calculation: `(Employed / Total) × 100`
   - Alignment Rate Calculation: `(Aligned / Employed) × 100`
   - Average Calculation: `SUM(values) / COUNT(values)`
   - Location: `api/dashboard/stats.php`, `api/surveys/analytics.php`

10. **Aggregation Algorithm (SQL GROUP BY)**
    - Groups data by program, year, or category
    - Location: `api/dashboard/stats.php`, `api/reports/index.php`

11. **Data Parsing Algorithm**
    - Parses JSON survey responses and extracts answers
    - Location: `api/surveys/analytics.php`, `api/dashboard/stats.php`

12. **Pattern Recognition Algorithm**
    - Identifies question types using keyword matching (strpos)
    - Location: `api/dashboard/stats.php`, `api/surveys/analytics.php`

13. **Frequency Distribution Algorithm**
    - Counts occurrences of each option in multiple choice questions
    - Location: `api/surveys/analytics.php`

14. **Percentage Calculation Algorithm**
    - Calculates percentages for charts and statistics
    - Location: All analytics and reporting endpoints

15. **Ranking Algorithm**
    - Ranks programs by employability index using usort()
    - Location: `api/dashboard/stats.php`

16. **Threshold Detection Algorithm**
    - Identifies at-risk programs (employability < 70%)
    - Location: `api/dashboard/stats.php`

17. **Data Validation Algorithm**
    - Validates form inputs and survey responses
    - Location: All API endpoints, frontend forms

18. **Transaction Management Algorithm**
    - Ensures data consistency using database transactions (BEGIN, COMMIT, ROLLBACK)
    - Location: `api/surveys/index.php`, `api/surveys/responses.php`

19. **JOIN Algorithm (SQL)**
    - Combines data from multiple tables (graduates, programs, employment)
    - Location: `api/graduates/index.php`, `api/dashboard/stats.php`

20. **Conditional Logic Algorithm**
    - Implements business rules and decision-making
    - Location: All backend and frontend components

21. **Array Manipulation Algorithms**
    - Map, filter, reduce operations on data arrays
    - Location: Frontend React components

22. **String Manipulation Algorithms**
    - Lowercase conversion, trimming, substring extraction
    - Location: `api/dashboard/stats.php`, `api/reports/index.php`

23. **Date/Time Calculation Algorithm**
    - Calculates time to employment, current year
    - Location: `api/dashboard/stats.php`

24. **Hierarchical Data Selection Algorithm**
    - Cascading address selection (Region → Province → City → Barangay)
    - Location: `src/data/philippineAddress.ts`, `src/pages/Survey.tsx`

25. **Response Rate Calculation Algorithm**
    - Formula: `(Survey Responses / Total Graduates) × 100`
    - Location: `api/surveys/analytics.php`

26. **Data Transformation Algorithm**
    - Converts database results to chart-compatible formats
    - Location: Frontend Dashboard and Reports components

27. **Recommendation Algorithm**
    - Generates actionable recommendations based on data thresholds
    - Location: `api/dashboard/stats.php`

28. **Error Handling Algorithm (Try-Catch)**
    - Catches and handles exceptions gracefully
    - Location: All API endpoints

29. **HTTP Request Routing Algorithm**
    - Routes requests based on HTTP method (GET, POST, PUT, DELETE)
    - Location: All API endpoints

30. **State Management Algorithm**
    - Manages application state using React hooks (useState, useEffect)
    - Location: All React components

31. **Real-time Data Refresh Algorithm**
    - Fetches and updates data on component mount and user actions
    - Location: Frontend Dashboard and Reports components

---

## TOTAL: 31 ALGORITHMS

These algorithms work together to provide the complete functionality of the GradTrack Graduate Tracking and Employment Monitoring System.
