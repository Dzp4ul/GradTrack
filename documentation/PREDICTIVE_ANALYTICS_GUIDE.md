# 📈 Predictive Analytics with Linear Regression

## Overview

The GradTrack system now includes **Predictive Analytics** powered by **Linear Regression** machine learning model combined with AI-generated insights. This feature forecasts future employment and alignment trends for the next 3 years.

## Features

### 1. Linear Regression Model
- **Employment Rate Prediction** - Forecasts employment rates for next 3 years
- **Alignment Rate Prediction** - Predicts job-course alignment trends
- **Trend Analysis** - Identifies increasing, decreasing, or stable trends
- **Confidence Metrics** - R² values showing prediction reliability

### 2. AI-Powered Insights
- **Narrative Analysis** - AI interprets regression results
- **Pattern Recognition** - Identifies historical trends
- **Actionable Recommendations** - Suggests improvements based on predictions
- **Reliability Assessment** - Explains confidence levels

## How It Works

### Step 1: Data Collection
```
Historical Data (by Year):
├─ Total Graduates
├─ Employed Count
├─ Aligned Count
├─ Employment Rate (%)
└─ Alignment Rate (%)
```

### Step 2: Linear Regression Calculation

**Formula:**
```
y = mx + b

Where:
- y = predicted value
- m = slope (trend direction)
- x = time period
- b = intercept
```

**R² (Coefficient of Determination):**
- Measures prediction accuracy
- Range: 0 to 1 (0% to 100%)
- Higher = more reliable predictions

### Step 3: Generate Predictions
- Forecasts next 3 years
- Calculates employment & alignment rates
- Provides confidence scores

### Step 4: AI Analysis
- Groq AI analyzes regression results
- Generates narrative insights
- Provides context and recommendations

## API Endpoint

**URL:** `GET /api/reports/predictive-analytics.php`

**Response:**
```json
{
  "success": true,
  "data": {
    "historical_data": [
      {
        "year": 2022,
        "total_graduates": 100,
        "employed": 85,
        "aligned": 60,
        "employment_rate": 85.0,
        "alignment_rate": 70.59
      }
    ],
    "predictions": [
      {
        "year": 2025,
        "predicted_employment_rate": 87.5,
        "predicted_alignment_rate": 72.3,
        "confidence": 85.2
      }
    ],
    "regression_analysis": {
      "employment": {
        "slope": 1.25,
        "intercept": 82.5,
        "r_squared": 0.852,
        "trend": "increasing"
      },
      "alignment": {
        "slope": 0.85,
        "intercept": 68.2,
        "r_squared": 0.791,
        "trend": "increasing"
      }
    },
    "ai_analysis": "AI-generated narrative..."
  }
}
```

## UI Components

### 1. Forecast Chart
- Line chart showing historical + predicted data
- Visual distinction between past and future
- Interactive tooltips

### 2. Predictions Table
- Year-by-year breakdown
- Employment & alignment rates
- Confidence scores
- Trend indicators (↗️ increasing)

### 3. Regression Analysis Cards
- Employment trend metrics
- Alignment trend metrics
- Slope, R², and trend direction

### 4. AI Insights Card
- Green gradient design
- TrendingUp icon
- "Linear Regression" badge
- Narrative analysis

## Interpreting Results

### R² (R-Squared) Values

| R² Range | Interpretation | Reliability |
|----------|----------------|-------------|
| 0.90 - 1.00 | Excellent fit | Very High |
| 0.70 - 0.89 | Good fit | High |
| 0.50 - 0.69 | Moderate fit | Medium |
| 0.30 - 0.49 | Weak fit | Low |
| 0.00 - 0.29 | Very weak fit | Very Low |

### Slope Interpretation

- **Positive Slope** - Increasing trend (improving)
- **Negative Slope** - Decreasing trend (declining)
- **Near Zero** - Stable trend (no change)

### Example:
```
Employment Rate:
- Slope: 1.25 → Increasing by ~1.25% per year
- R²: 0.85 → 85% prediction accuracy
- Trend: "increasing" → Positive outlook
```

## Requirements

### Minimum Data
- **At least 2 years** of historical data
- More years = better predictions
- Recommended: 3-5 years for reliable forecasts

### Data Quality
- Accurate survey responses
- Complete employment status data
- Consistent data collection

## Limitations

### 1. Linear Assumption
- Assumes linear trends continue
- May not capture sudden changes
- Best for stable, gradual trends

### 2. External Factors
- Doesn't account for:
  - Economic changes
  - Policy shifts
  - Industry disruptions
  - Global events

### 3. Data Requirements
- Needs sufficient historical data
- Quality depends on survey accuracy
- Limited to available metrics

## Use Cases

### 1. Strategic Planning
- Set realistic employment targets
- Plan curriculum improvements
- Allocate resources effectively

### 2. Performance Monitoring
- Track progress toward goals
- Identify concerning trends early
- Measure intervention effectiveness

### 3. Stakeholder Reporting
- Present data-driven forecasts
- Support funding requests
- Demonstrate program effectiveness

### 4. Continuous Improvement
- Identify areas needing attention
- Validate program changes
- Guide policy decisions

## Example AI Analysis

> "The historical data reveals a consistent upward trend in employment rates, with a slope of 1.25 indicating an average annual increase of approximately 1.25 percentage points. The R-squared value of 0.85 suggests that this linear model explains 85% of the variance in the data, providing a high degree of confidence in the predictions.
>
> Based on this trend, the model forecasts employment rates of 87.5%, 88.75%, and 90% for the next three years respectively. This positive trajectory suggests that current programs and initiatives are effectively preparing graduates for the job market.
>
> The alignment rate shows a similar positive trend with a slope of 0.85, though with slightly lower predictive accuracy (R² = 0.79). This indicates that while job-course alignment is improving, there may be more variability in this metric compared to overall employment rates.
>
> Recommendations: Continue current strategies while monitoring for any deviations from predicted trends. Consider targeted interventions to further improve alignment rates, particularly in programs showing lower alignment percentages."

## Technical Implementation

### Backend (PHP)
```php
// Linear Regression Function
function linearRegression($data, $metric) {
    $n = count($data);
    $sumX = $sumY = $sumXY = $sumX2 = 0;
    
    foreach ($data as $i => $point) {
        $x = $i;
        $y = $point[$metric];
        $sumX += $x;
        $sumY += $y;
        $sumXY += $x * $y;
        $sumX2 += $x * $x;
    }
    
    $m = ($n * $sumXY - $sumX * $sumY) / ($n * $sumX2 - $sumX * $sumX);
    $b = ($sumY - $m * $sumX) / $n;
    
    // Calculate R-squared
    $meanY = $sumY / $n;
    $ssTotal = $ssResidual = 0;
    
    foreach ($data as $i => $point) {
        $y = $point[$metric];
        $predicted = $m * $i + $b;
        $ssTotal += pow($y - $meanY, 2);
        $ssResidual += pow($y - $predicted, 2);
    }
    
    $rSquared = $ssTotal > 0 ? 1 - ($ssResidual / $ssTotal) : 0;
    
    return ['slope' => $m, 'intercept' => $b, 'r_squared' => $rSquared];
}
```

### Frontend (React + TypeScript)
```typescript
interface PredictiveData {
  historical_data: Array<{
    year: number;
    employment_rate: number;
    alignment_rate: number;
  }>;
  predictions: Array<{
    year: number;
    predicted_employment_rate: number;
    predicted_alignment_rate: number;
    confidence: number;
  }>;
  regression_analysis: {
    employment: { slope: number; r_squared: number; trend: string };
    alignment: { slope: number; r_squared: number; trend: string };
  };
  ai_analysis: string;
}
```

## Best Practices

### 1. Regular Updates
- Update predictions annually
- Incorporate new data as available
- Review accuracy of past predictions

### 2. Combine with Other Data
- Use alongside descriptive analytics
- Consider qualitative feedback
- Cross-reference with industry trends

### 3. Communicate Uncertainty
- Always show confidence levels
- Explain limitations to stakeholders
- Present as estimates, not guarantees

### 4. Validate Predictions
- Compare predictions to actual outcomes
- Adjust models if needed
- Document prediction accuracy

## Troubleshooting

### "Insufficient historical data"
**Solution:** Need at least 2 years of data. Add more survey responses.

### Low R² values
**Solution:** Data may be too variable. Check for data quality issues or external factors.

### Unrealistic predictions
**Solution:** Review data for outliers. Consider capping predictions at reasonable limits.

## Future Enhancements

Potential improvements:
- **Multiple Regression** - Include more variables
- **Polynomial Regression** - Capture non-linear trends
- **Time Series Analysis** - Advanced forecasting methods
- **Confidence Intervals** - Show prediction ranges
- **Scenario Analysis** - What-if predictions
- **Program-Specific Predictions** - Forecast by degree program

## Summary

The Predictive Analytics feature combines:
- ✅ **Linear Regression** - Statistical forecasting
- ✅ **AI Analysis** - Intelligent interpretation
- ✅ **Visual Charts** - Easy-to-understand graphs
- ✅ **Confidence Metrics** - Reliability indicators
- ✅ **Actionable Insights** - Data-driven recommendations

This powerful combination helps institutions make informed decisions about their graduate programs and employment initiatives.

---

**Status:** ✅ Production Ready
**Model:** Linear Regression
**AI:** Groq LLaMA 3.3 70B
**Accuracy:** Depends on R² values (typically 70-90%)
