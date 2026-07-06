// ---------------------------------------------------------------------------
// Adaptive analytics engine.
//
// This module is intentionally free of React/JSX. It takes the same rawRows
// and clusters the rest of the app already computes and answers one
// question for each piece of the dashboard: "is there enough signal here to
// be worth showing?" If not, the caller renders an empty state instead of a
// chart. Nothing here calls an LLM — it's all deterministic arithmetic over
// the data actually present, which is what lets it carry a confidence score
// instead of a black-box guess.
// ---------------------------------------------------------------------------

// ---------- Data profiling ----------
// One pass over the dataset to describe what's actually usable, so chart
// selection and KPI generation are driven by this profile rather than by
// hardcoded assumptions about the schema.
export function buildDataProfile(rawRows) {
  const total = rawRows.length;
  if (total === 0) return { hasData: false, total: 0 };

  // new Date(null) silently resolves to the 1970 epoch (not NaN), so falsy dates
  // must be filtered out *before* constructing a Date, or a bunch of missing/invalid
  // dates quietly corrupt spanDays into "60 years of history."
  const now = new Date();
  const dates = rawRows
    .map((r) => (r.date ? new Date(r.date) : null))
    .filter((d) => d && !isNaN(d) && d <= now);
  const uniqueDays = new Set(dates.map((d) => d.toISOString().slice(0, 10)));
  const spanDays = dates.length ? Math.round((Math.max(...dates) - Math.min(...dates)) / 86400000) : 0;
  // require several distinct days spread over a real window, not just a pile of "today" timestamps
  const hasTimestamps = dates.length / total > 0.5 && uniqueDays.size >= 3 && spanDays >= 3;

  const ratings = rawRows.map((r) => Number(r.rating)).filter((n) => !isNaN(n) && n > 0);
  const hasRatings = ratings.length / total > 0.5;
  const avgRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;

  const positiveCount = rawRows.filter((r) => r.positive).length;
  const negativeCount = total - positiveCount;
  const positiveShare = positiveCount / total;
  // "multiple sentiment classes" isn't just >0 of each — a 99/1 split isn't a comparison worth charting
  const hasMultipleSentiment = positiveShare > 0.03 && positiveShare < 0.97;

  const sourceSet = new Set(rawRows.map((r) => r.source));

  const categorized = rawRows.filter((r) => !r.themeKey.startsWith("other_"));
  const categorySet = new Set(categorized.map((r) => r.themeKey));
  const hasCategories = categorySet.size >= 2 && categorized.length / total > 0.3;

  const severities = rawRows.map((r) => r.severity).filter((n) => typeof n === "number" && !isNaN(n));
  const hasSeverity = severities.length / total > 0.5;
  const avgSeverity = severities.length ? severities.reduce((a, b) => a + b, 0) / severities.length : null;

  const seenText = new Map();
  rawRows.forEach((r) => seenText.set(r.text, (seenText.get(r.text) || 0) + 1));
  const duplicateCount = Array.from(seenText.values()).reduce((a, c) => a + (c > 1 ? c - 1 : 0), 0);

  const locatedRows = rawRows.filter((r) => r.location);
  const locationSet = new Set(locatedRows.map((r) => r.location));
  const hasLocation = locatedRows.length / total > 0.5 && locationSet.size >= 2;

  return {
    hasData: true,
    total,
    spanDays,
    uniqueDayCount: uniqueDays.size,
    hasTimestamps,
    hasRatings,
    avgRating,
    ratingCount: ratings.length,
    positiveCount,
    negativeCount,
    positiveShare,
    hasMultipleSentiment,
    sourceCount: sourceSet.size,
    hasMultipleSources: sourceSet.size > 1,
    categoryCount: categorySet.size,
    hasCategories,
    hasSeverity,
    avgSeverity,
    duplicateCount,
    uncategorizedShare: 1 - categorized.length / total,
    hasLocation,
    locationCount: locationSet.size,
  };
}

// ---------- Confidence engine ----------
// Confidence grows with sample size and saturates instead of hitting 100%,
// so a theme with 6 mentions never gets reported with the same authority as
// one with 600. `sat` is roughly "the count at which we start feeling good."
export function sampleSizeConfidence(n, sat = 120) {
  if (!n || n <= 0) return 0;
  return Math.min(0.97, 1 - Math.exp(-n / (sat / 3)));
}

// Sample size alone made every large cluster saturate to an identical ~97%, which
// looked hardcoded even though it wasn't. Folding in how *consistent* the cluster's
// severities are (low variance = a clean, well-defined complaint; high variance =
// a noisier bucket) makes confidence actually differentiate between clusters.
export function clusterConfidence(cluster) {
  const base = sampleSizeConfidence(cluster.count);
  if (!cluster.items || cluster.items.length < 2) return base;
  const severities = cluster.items.map((i) => i.severity);
  const mean = severities.reduce((a, b) => a + b, 0) / severities.length;
  const variance = severities.reduce((a, b) => a + (b - mean) ** 2, 0) / severities.length;
  const consistency = Math.max(0.75, 1 - variance / 6);
  return Math.min(0.97, base * consistency);
}

export function confidenceTier(score) {
  if (score >= 0.85) return { label: "High confidence", tone: "high" };
  if (score >= 0.55) return { label: "Medium confidence", tone: "medium" };
  return { label: "Low confidence", tone: "low" };
}

// Minimum confidence before an insight/recommendation is worth surfacing at all —
// below this, hiding the claim is more honest than showing it with a caveat.
export const CONFIDENCE_FLOOR = 0.35;

// ---------- KPI selection ----------
// Only emit a KPI if the underlying data actually supports it.
export function generateKPIs(profile, issueClusters, weekOverWeek) {
  const kpis = [];
  kpis.push({ key: "total", label: "Total reviews", value: profile.total.toLocaleString(), tooltip: "All ingested reviews across every uploaded file." });

  if (profile.hasRatings) {
    kpis.push({ key: "avgRating", label: "Average rating", value: `${profile.avgRating.toFixed(1)}/5`, tooltip: `Mean of ${profile.ratingCount.toLocaleString()} reviews carrying a rating.` });
  }
  if (profile.hasMultipleSentiment) {
    kpis.push({ key: "positivePct", label: "Positive %", value: `${(profile.positiveShare * 100).toFixed(0)}%`, tooltip: "Share of reviews classified positive." });
    kpis.push({ key: "negativePct", label: "Negative %", value: `${((1 - profile.positiveShare) * 100).toFixed(0)}%`, tooltip: "Share of reviews classified negative." });
  }
  if (profile.hasSeverity && issueClusters.length) {
    const criticalCount = issueClusters.filter((c) => c.avgSeverity >= 4).reduce((a, c) => a + c.count, 0);
    kpis.push({ key: "critical", label: "Critical issues", value: criticalCount.toLocaleString(), tooltip: "Reviews sitting in themes averaging severity 4+ of 5." });
    kpis.push({ key: "avgSeverity", label: "Avg severity", value: `${profile.avgSeverity.toFixed(1)}/5`, tooltip: "Mean severity across all categorized complaints." });
  }
  if (weekOverWeek) {
    const sign = weekOverWeek.pctChange > 0 ? "+" : "";
    kpis.push({ key: "wow", label: "Complaints vs last week", value: `${sign}${weekOverWeek.pctChange}%`, tooltip: `${weekOverWeek.thisWeek} complaints in the last 7 days vs ${weekOverWeek.lastWeek} in the 7 days before that.` });
  }
  if (profile.hasTimestamps) {
    const increasing = issueClusters.filter((c) => c.trendDelta > 0).length;
    kpis.push({ key: "increasing", label: "Themes increasing", value: increasing, tooltip: `Issue themes with more mentions in the last window than the one before it (spans ~${profile.spanDays}d of data).` });
  }
  if (profile.hasCategories) {
    kpis.push({ key: "themes", label: "Issue themes", value: issueClusters.length, tooltip: "Distinct complaint categories detected in this data." });
  }
  if (profile.hasLocation) {
    kpis.push({ key: "locations", label: "Locations covered", value: profile.locationCount, tooltip: "Distinct locations/regions/stores detected in this data." });
  }
  if (profile.uncategorizedShare > 0.15) {
    kpis.push({ key: "uncategorized", label: "Uncategorized", value: `${(profile.uncategorizedShare * 100).toFixed(0)}%`, tooltip: "Share of reviews the keyword matcher couldn't place — candidates for AI re-analysis." });
  }
  return kpis;
}

// ---------- Insight generation ----------
export function generateInsights(profile, clusters, recentWindowDays) {
  const insights = [];
  if (!profile.hasData) return insights;
  const issueClusters = clusters.filter((c) => !c.positive);
  const totalIssueVolume = issueClusters.reduce((a, c) => a + c.count, 0) || 1;

  if (profile.hasTimestamps) {
    const worsening = [...issueClusters].filter((c) => c.trendAvailable && c.trendDelta > 0).sort((a, b) => b.trendDelta - a.trendDelta)[0];
    if (worsening) {
      insights.push({
        type: "trend",
        title: `${worsening.themeLabel} is trending up`,
        detail: `${worsening.count} mentions total, +${worsening.trendDelta} in the last ${recentWindowDays} days vs the window before.`,
        confidence: clusterConfidence(worsening),
      });
    }
    const improving = [...clusters].filter((c) => !c.positive && c.trendAvailable && c.trendDelta < 0).sort((a, b) => a.trendDelta - b.trendDelta)[0];
    if (improving) {
      insights.push({
        type: "improvement",
        title: `${improving.themeLabel} is easing off`,
        detail: `Down ${Math.abs(improving.trendDelta)} mentions in the last ${recentWindowDays} days vs the window before.`,
        confidence: clusterConfidence(improving),
      });
    }
  }

  if (profile.hasCategories && issueClusters.length) {
    const top = [...issueClusters].sort((a, b) => b.count - a.count)[0];
    const share = top.count / totalIssueVolume;
    if (share > 0.22) {
      insights.push({
        type: "concentration",
        title: `${top.themeLabel} dominates complaint volume`,
        detail: `${(share * 100).toFixed(0)}% of all categorized complaints fall into this one theme.`,
        confidence: clusterConfidence(top),
      });
    }
  }

  if (profile.hasSeverity) {
    const critical = issueClusters.filter((c) => c.avgSeverity >= 4);
    if (critical.length) {
      insights.push({
        type: "severity",
        title: `${critical.length} theme${critical.length > 1 ? "s" : ""} at critical severity`,
        detail: critical.map((c) => c.themeLabel).slice(0, 3).join(", "),
        confidence: sampleSizeConfidence(critical.reduce((a, c) => a + c.count, 0)),
      });
    }
  }

  if (profile.uncategorizedShare > 0.2) {
    insights.push({
      type: "coverage",
      title: "A meaningful slice of feedback is still uncategorized",
      detail: `${(profile.uncategorizedShare * 100).toFixed(0)}% of reviews didn't match the keyword dictionary — the "Re-analyze with AI" step on the Issues tab will fold most of these into real themes.`,
      confidence: 0.9,
    });
  }

  if (!profile.hasTimestamps) {
    insights.push({
      type: "coverage",
      title: "Trend analysis: insufficient data",
      detail: "Fewer than half of the rows carry a usable, non-future timestamp within the last 5 years, so week-over-week trend claims are suppressed rather than guessed.",
      confidence: 0.9,
    });
  }

  return insights.filter((i) => i.confidence >= CONFIDENCE_FLOOR).sort((a, b) => b.confidence - a.confidence);
}

// ---------- Recommendation engine ----------
const RECOMMENDATION_TEXT = {
  crashes: "Prioritize a stability pass on checkout and cart flows — that's where most crash reports cluster.",
  delivery: "Audit courier assignment and routing for the delivery windows tied to these delays.",
  support: "Review support staffing and first-response SLAs; canned replies are the recurring complaint.",
  payment: "Investigate payment gateway reliability and reconciliation for failed/duplicate charges.",
  login: "Check the OTP delivery pipeline and session-persistence logic on the backend.",
  returns: "Streamline the refund workflow — the return process itself is the complaint, not the item.",
  pricing: "Audit promo/coupon validation at checkout for the codes referenced in these reviews.",
  performance: "Profile app performance and battery usage on the most recent build.",
  quality: "Review supplier/QA checks for the product line generating these reports.",
  missing: "Audit fulfillment and packing accuracy for incomplete orders.",
  accuracy: "Review order-picking accuracy and the substitution policy.",
};

export function generateRecommendations(issueClusters, profile) {
  const MIN_EVIDENCE = 5;
  return issueClusters
    .filter((c) => c.count >= MIN_EVIDENCE && c.priority > 0.3)
    .slice(0, 4)
    .map((c) => {
      const confidence = clusterConfidence(c) * (c.trendAvailable ? 1 : 0.85);
      return {
        theme: c.themeLabel,
        recommendation: RECOMMENDATION_TEXT[c.themeKey] || `Investigate the root cause behind "${c.themeLabel}" — it's a recurring, high-signal theme with ${c.count} mentions.`,
        confidence,
        priorityLabel: c.priority > 0.66 ? "High" : c.priority > 0.4 ? "Medium" : "Low",
        evidence: c.count,
      };
    })
    .filter((r) => r.confidence >= CONFIDENCE_FLOOR);
}

// ---------- Root cause analysis ----------
export function generateRootCauses(issueClusters, limit = 3) {
  return [...issueClusters]
    .filter((c) => c.count >= 4)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit)
    .map((c) => {
      // pick a representative review with unique text — synthetic/templated datasets
      // often repeat the exact same line many times, which looked like a data bug
      // when the same quote showed up twice in a row
      const seen = new Set();
      const representative = c.items.find((i) => { if (seen.has(i.text)) return false; seen.add(i.text); return true; }) || c.items[0];
      return {
        theme: c.themeLabel,
        frequency: c.count,
        avgSeverity: c.avgSeverity,
        representative,
        confidence: clusterConfidence(c),
      };
    });
}

// ---------- Executive summary ----------
// Rule-based, deterministic — every sentence traces back to a specific
// number above it. No LLM call here; see the "Generate AI summary" button
// in the UI for the optional real-Claude version that writes prose from
// this same structured data.
export function generateExecutiveSummary(profile, clusters, recommendations, recentWindowDays) {
  if (!profile.hasData) return [];
  const issueClusters = clusters.filter((c) => !c.positive);
  const bullets = [];

  bullets.push(`${profile.total.toLocaleString()} reviews analyzed across ${profile.sourceCount} source${profile.sourceCount === 1 ? "" : "s"}.`);

  if (profile.hasMultipleSentiment) {
    bullets.push(`${(profile.positiveShare * 100).toFixed(0)}% positive sentiment overall.`);
  } else if (profile.positiveShare >= 0.97) {
    bullets.push(`Sentiment is overwhelmingly positive (${(profile.positiveShare * 100).toFixed(0)}%) — not enough negative volume for a meaningful comparison chart.`);
  } else if (profile.positiveShare <= 0.03) {
    bullets.push(`Sentiment is overwhelmingly negative — a positive/negative split chart would add noise, not signal.`);
  }

  const topIssue = [...issueClusters].sort((a, b) => b.priority - a.priority)[0];
  if (topIssue) {
    bullets.push(`Top risk: "${topIssue.themeLabel}" — ${topIssue.count} mentions, priority score ${(topIssue.priority * 100).toFixed(0)}/100.`);
  }

  if (profile.hasTimestamps) {
    const rising = issueClusters.filter((c) => c.trendDelta > 0).length;
    const easing = clusters.filter((c) => (!c.positive && c.trendDelta < 0) || (c.positive && c.trendDelta > 0)).length;
    if (rising) bullets.push(`${rising} theme${rising > 1 ? "s are" : " is"} trending upward over the last ${recentWindowDays} days.`);
    if (easing) bullets.push(`${easing} area${easing > 1 ? "s show" : " shows"} improvement in the same window.`);
  }

  if (recommendations.length) {
    bullets.push(`Recommended focus: ${recommendations[0].recommendation}`);
  }

  return bullets;
}

// ---------- Section visibility ----------
// One place that decides which dashboard sections earn their spot, so the
// component tree just reads flags instead of re-deriving them.
export function computeSectionVisibility(profile) {
  return {
    sentimentSplit: profile.hasMultipleSentiment,
    sourceBreakdown: profile.hasMultipleSources,
    trend: profile.hasTimestamps,
    ratings: profile.hasRatings,
    categories: profile.hasCategories,
    severity: profile.hasSeverity,
  };
}

// ---------- Extra chart data builders ----------
// Kept here (not in the component) so they're testable independent of React
// and so AnalyticsView stays focused on layout/visibility decisions.

function daysAgoLocal(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const diff = Math.floor((Date.now() - d) / 86400000);
  return diff < 0 ? null : diff;
}

// "Business risks" — the subset of insights serious enough to lead with,
// distinct from the fuller "key insights" list further down.
export function generateBusinessRisks(insights) {
  return insights.filter((i) => (i.type === "trend" || i.type === "severity" || i.type === "concentration") && i.confidence >= 0.5);
}

export function generateSeverityDistribution(issueClusters) {
  const counts = [0, 0, 0, 0, 0];
  issueClusters.forEach((c) => c.items.forEach((r) => {
    const s = Math.round(r.severity);
    if (s >= 1 && s <= 5) counts[s - 1]++;
  }));
  return counts.map((count, i) => ({ severity: `Sev ${i + 1}`, count }));
}

export function generateRatingDistribution(rawRows) {
  const counts = [0, 0, 0, 0, 0];
  rawRows.forEach((r) => {
    const n = Math.round(Number(r.rating));
    if (n >= 1 && n <= 5) counts[n - 1]++;
  });
  return counts.map((count, i) => ({ rating: `${i + 1}★`, count }));
}

// Frequency (x) vs severity (y), bubble size = volume — the classic 2x2
// "where to focus" quadrant, complementing the single weighted priority bar.
export function generatePriorityMatrix(issueClusters) {
  return issueClusters.map((c) => ({
    name: c.themeLabel,
    frequency: c.count,
    severity: Number(c.avgSeverity.toFixed(2)),
    priority: c.priority,
    count: c.count,
  }));
}

export function generateCategoryTrend(issueClusters, weeks = 8) {
  const top = [...issueClusters].sort((a, b) => b.count - a.count).slice(0, 4);
  const data = Array.from({ length: weeks }).map((_, i) => {
    const start = (weeks - 1 - i) * 7;
    const end = start + 7;
    const bucket = { week: `W${weeks - i}` };
    top.forEach((c) => {
      bucket[c.themeLabel] = c.items.filter((r) => {
        const d = daysAgoLocal(r.date);
        return d !== null && d >= start && d < end;
      }).length;
    });
    return bucket;
  }).reverse();
  return { data, themes: top.map((c) => c.themeLabel) };
}

export function generateCustomerVoice(issueClusters, perTheme = 2, themeLimit = 4) {
  return [...issueClusters]
    .filter((c) => c.count >= 2)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, themeLimit)
    .map((c) => {
      const seen = new Set();
      const uniqueReviews = [];
      for (const item of c.items) {
        if (seen.has(item.text)) continue;
        seen.add(item.text);
        uniqueReviews.push({ text: item.text, rating: item.rating, date: item.date, source: item.source, location: item.location });
        if (uniqueReviews.length >= perTheme) break;
      }
      return { theme: c.themeLabel, avgSeverity: c.avgSeverity, reviews: uniqueReviews };
    })
    .filter((g) => g.reviews.length > 0);
}

// ---------- Location analytics ----------
// Complaint volume per location, so a PM can see "is this a global issue or a
// specific store/region problem" — only surfaced when the dataset actually
// carries a usable location column for a majority of rows (see hasLocation).
export function generateLocationBreakdown(rawRows, limit = 8) {
  const byLocation = {};
  rawRows.forEach((r) => {
    if (!r.location) return;
    if (!byLocation[r.location]) byLocation[r.location] = { location: r.location, total: 0, negative: 0, severitySum: 0 };
    byLocation[r.location].total++;
    if (!r.positive) { byLocation[r.location].negative++; byLocation[r.location].severitySum += r.severity; }
  });
  return Object.values(byLocation)
    .map((l) => ({ location: l.location, total: l.total, negative: l.negative, negativeShare: l.negative / l.total, avgSeverity: l.negative ? l.severitySum / l.negative : 0 }))
    .sort((a, b) => b.negative - a.negative)
    .slice(0, limit);
}

// Top issue theme per location — answers "what's actually wrong in each place,"
// not just "which place complains most."
export function generateLocationTopIssues(rawRows, limit = 6) {
  const byLocation = {};
  rawRows.forEach((r) => {
    if (!r.location || r.positive) return;
    if (!byLocation[r.location]) byLocation[r.location] = {};
    byLocation[r.location][r.themeLabel] = (byLocation[r.location][r.themeLabel] || 0) + 1;
  });
  return Object.entries(byLocation)
    .map(([location, themes]) => {
      const [topTheme, count] = Object.entries(themes).sort((a, b) => b[1] - a[1])[0] || [null, 0];
      const total = Object.values(themes).reduce((a, b) => a + b, 0);
      return { location, topTheme, count, total };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

// ---------- Week-over-week change ----------
// A single, explicit "is complaint volume up or down this week" number, distinct
// from the 15-day trendDelta used for priority scoring — this is what a PM
// actually reads off a dashboard headline.
function daysAgoForWeek(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const diff = Math.floor((Date.now() - d) / 86400000);
  return diff < 0 ? null : diff;
}

export function generateWeekOverWeekChange(rawRows) {
  const thisWeek = rawRows.filter((r) => { const d = daysAgoForWeek(r.date); return d !== null && d <= 7 && !r.positive; }).length;
  const lastWeek = rawRows.filter((r) => { const d = daysAgoForWeek(r.date); return d !== null && d > 7 && d <= 14 && !r.positive; }).length;
  if (thisWeek === 0 && lastWeek === 0) return null;
  const pctChange = lastWeek === 0 ? (thisWeek > 0 ? 100 : 0) : Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
  return { thisWeek, lastWeek, pctChange };
}
