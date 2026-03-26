# Survey Updates - Dynamic & Philippine Address System

## Changes Implemented

### 1. Separated Name Fields
**Before:** Single field "Name (Last Name, First Name M.I.)"
**After:** Four separate fields:
- Last Name
- First Name  
- Middle Name
- Name Extension (Jr, Sr, III, etc.)

### 2. Philippine Address System with Cascading Dropdowns

#### Address Structure (Hierarchical):
1. **Region** (Dropdown) - 17 Philippine regions
2. **Province** (Dropdown) - Loads based on selected region
3. **City/Municipality** (Dropdown) - Loads based on selected province
4. **Barangay** (Dropdown) - Loads based on selected city
5. **Street Address** (Text field) - House No., Street, Subdivision

#### Cascading Behavior:
- Select Region → Province dropdown populates
- Select Province → City dropdown populates
- Select City → Barangay dropdown populates
- Each selection clears the next level dropdowns

### 3. Files Created/Modified

#### New Files:
- `src/data/philippineAddress.ts` - Contains Philippine regions, provinces, cities, and barangays data

#### Modified Files:
- `src/pages/Survey.tsx` - Updated with new name fields and cascading address dropdowns
- `src/pages/admin/Surveys.tsx` - Updated template with new structure (33 questions)
- `api/surveys/responses.php` - Updated to handle new name format

### 4. Survey Template Updates

**Total Questions:** 33 (increased from 29)

**Section A - General Information (15 questions):**
1. Last Name
2. First Name
3. Middle Name
4. Name Extension
5. Region (dropdown)
6. Province (dropdown)
7. City/Municipality (dropdown)
8. Barangay (dropdown)
9. Street Address
10. Email
11. Telephone
12. Mobile
13. Civil Status
14. Sex
15. Birthday

**Section B - Educational Background (8 questions)**
**Section C - Training/Advance Studies (7 questions)**
**Section D - Employment Data (3 questions)**

### 5. Data Structure

#### Philippine Regions Included:
- NCR (National Capital Region)
- CAR (Cordillera Administrative Region)
- Regions I through XIII
- BARMM (Bangsamoro Autonomous Region)

#### Sample Provinces (Region III - Central Luzon):
- Aurora, Bataan, Bulacan, Nueva Ecija, Pampanga, Tarlac, Zambales

#### Sample Cities (Bulacan):
- Malolos City, Meycauayan City, San Jose del Monte City
- Norzagaray, Baliuag, Bocaue, etc.

#### Sample Barangays (Norzagaray):
- Bangkal, Baraka, Bigte, Bitungol, Friendship, Matictic, Minuyan, Partida, Pinagtulayan, Poblacion, San Mateo, Santa Rosa, Tigbe

### 6. Features

#### Dynamic Survey Loading:
- Survey structure can be edited in admin panel
- Changes reflect immediately on homepage survey
- Template can be loaded with one click

#### Address Validation:
- Ensures proper address hierarchy
- Prevents invalid address combinations
- Dropdowns are disabled until parent selection is made

#### Data Storage:
- Full address stored as concatenated string in database
- Individual components stored in JSON for analysis
- Compatible with existing graduate records

### 7. How to Use

#### For Admin:
1. Go to Survey Management
2. Click "Load Template" to get updated structure
3. Edit survey if needed
4. Save as active survey

#### For Users:
1. Fill out name fields separately
2. Select Region first
3. Select Province (loads automatically)
4. Select City (loads automatically)
5. Select Barangay (loads automatically)
6. Enter street address details
7. Complete rest of survey

### 8. Benefits

✅ **Accurate Data Collection** - Separate name fields prevent parsing errors
✅ **Standardized Addresses** - Philippine address system ensures consistency
✅ **Better Analytics** - Can analyze by region, province, city, barangay
✅ **User-Friendly** - Cascading dropdowns guide users
✅ **Extensible** - Easy to add more cities/barangays to the data file
✅ **Dynamic** - Survey edits in admin reflect on homepage

## Technical Notes

- Uses React hooks (useState, useEffect) for cascading logic
- Address data stored in TypeScript file for type safety
- Can be extended with API calls to load address data from database
- Compatible with existing survey response system
