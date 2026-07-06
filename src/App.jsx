import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Papa from "papaparse";
import Tesseract from "tesseract.js";
import {
  Upload, TrendingUp, TrendingDown, Minus, ChevronDown, Info, Quote,
  SlidersHorizontal, LayoutDashboard, BarChart3, ArrowLeft, Activity, AlertTriangle,
  CheckCircle2, Radio, FileText, Image as ImageIcon, Loader2, HelpCircle, X, Sparkles,
  ShieldCheck, ShieldAlert, ShieldQuestion, Target, Wand2
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, LineChart, Line, Legend,
  ScatterChart, Scatter, ZAxis
} from "recharts";
import {
  buildDataProfile, computeSectionVisibility, generateKPIs, generateInsights,
  generateRecommendations, generateRootCauses, generateExecutiveSummary, confidenceTier,
  generateBusinessRisks, generateSeverityDistribution, generateRatingDistribution,
  generatePriorityMatrix, generateCategoryTrend, generateCustomerVoice,
  generateLocationBreakdown, generateLocationTopIssues, generateWeekOverWeekChange,
} from "./insights";

// ---------- palette ----------
const PALETTE = {
  indigo: "#4F46E5", teal: "#0D9488", rose: "#E11D48",
  amber: "#F59E0B", violet: "#8B5CF6", sky: "#0EA5E9", slate: "#94A3B8",
};
const CHART_COLORS = [PALETTE.indigo, PALETTE.teal, PALETTE.rose, PALETTE.amber, PALETTE.violet, PALETTE.sky];

// ---------- Theme dictionary: broadened for cross-domain use (food delivery, e-commerce, general apps) ----------
// Keywords here are intentionally specific (multi-word / negatively-framed) rather than bare nouns like
// "quality" or "refund" alone — those false-positived on clearly positive reviews ("quality matched the
// description", "easy refund process") in earlier testing. Sentiment is now detected *before* theme
// matching (see detectSentiment/classifyRow below), so a keyword hit can never override a positive review.
const THEME_DEFS = [
  { key: "crashes", label: "App crashes / bugs", baseSeverity: 5, trend: "up", positive: false,
    keywords: ["crash", "freeze", "won't open", "closes", "force close", "not responding", "bug", "glitch", "not working", "broken"],
    templates: ["App crashes every time I try to pay with a saved card","Had to restart the app twice before my order went through","Freezes right at checkout, lost my cart three times this week","App just closes randomly when I add items to cart","Payment screen crashes and I don't know if I got charged"]},
  { key: "delivery", label: "Delivery / shipping delays", baseSeverity: 3, trend: "up", positive: false,
    keywords: ["late delivery", "delayed", "took forever", "slow delivery", "still waiting", "delivery delay", "shipment delay", "arrived late", "delivery took"],
    templates: ["Order said 20 mins, took over an hour with no update","Rider was stuck for ages, no way to know why","Third time this month my order arrived cold because of delays","Delivery estimate is basically fiction at this point","Waited 90 minutes past the promised time again"]},
  { key: "support", label: "Customer support responsiveness", baseSeverity: 2, trend: "up", positive: false,
    keywords: ["no reply", "waited days", "chat bot didn't", "unhelpful support", "no response", "support never", "support closed my ticket"],
    templates: ["Waited two days for a reply about a missing item","Chat support just sends the same canned message every time","Still no response to my refund request from last week","Support closed my ticket without actually solving anything","Took 3 follow ups just to get a human to respond"]},
  { key: "accuracy", label: "Wrong / inaccurate order or item", baseSeverity: 3, trend: "flat", positive: false,
    keywords: ["wrong order", "wrong item", "wrong product", "not what i ordered", "not as described", "different from picture", "different from the picture", "substituted without"],
    templates: ["Got someone else's order, wrong name on the receipt too","Missing a whole side dish I paid for","Order came with the wrong item again","This is the second wrong order this month","Item substituted without asking me first"]},
  { key: "quality", label: "Product quality mismatch", baseSeverity: 3, trend: "flat", positive: false,
    keywords: ["defective", "damaged", "poor quality", "cheaply made", "fell apart", "not durable", "quality issue", "quality problem", "bad quality", "flimsy"],
    templates: ["Product quality did not match the photos at all","Item arrived damaged and packaging was flimsy","Feels cheaply made compared to the description","Fabric quality was disappointing for the price","Stopped working within a week of arriving"]},
  { key: "returns", label: "Returns & refund process issues", baseSeverity: 3, trend: "flat", positive: false,
    keywords: ["return process", "refund delay", "return policy", "hard to return", "refund never", "return window", "refund took", "haven't received my refund", "refund was slow"],
    templates: ["Refund took three weeks after the item was returned","Return process was confusing and took forever","Return window is too short for how slow delivery is","Still haven't received my refund after the return was confirmed","Had to fight to get a return authorized"]},
  { key: "pricing", label: "Pricing, discounts & value concerns", baseSeverity: 2, trend: "down", positive: false,
    keywords: ["promo code", "coupon", "code didn't work", "code rejected", "overpriced", "too expensive", "not worth the price", "price shown", "charged full price"],
    templates: ["Code said valid but got rejected at payment every time","Applied a promo and got charged full price anyway","Coupon expired the moment I tried to use it, no warning","Feels overpriced compared to competitors","Price shown at checkout was higher than listed"]},
  { key: "payment", label: "Payment / checkout failures", baseSeverity: 5, trend: "flat", positive: false,
    keywords: ["payment failed", "charged twice", "card declined", "double charge", "transaction failed", "billing issue", "checkout error"],
    templates: ["Got charged twice for the same order, still not refunded","Card kept getting declined even though it works everywhere else","Payment failed but money still left my account","Transaction stuck in pending for over an hour","Billing issue that support couldn't explain"]},
  { key: "ui_praise", label: "Praise for UI / redesign / ease of use", baseSeverity: 1, trend: "up", positive: true,
    keywords: ["redesign", "new look", "new ui", "cleaner layout", "love the update", "easy to use", "user friendly", "intuitive", "smooth experience", "great app"],
    templates: ["The new layout is so much cleaner, finding things is faster now","Love the redesign, checkout feels quicker","Best update this app has had in a while","Really easy to use, very intuitive","Smooth experience from browsing to checkout"]},
  { key: "performance", label: "Performance / app speed issues", baseSeverity: 3, trend: "flat", positive: false,
    keywords: ["battery drains", "laggy", "slow app", "overheats", "lags", "freezes up", "loading forever"],
    templates: ["App drains my battery way faster than it used to","Phone heats up just from having this app open","Scrolling through the menu is really laggy now","App uses a huge amount of data in the background","Noticeably slower since the last update"]},
  { key: "login", label: "Login / account / authentication issues", baseSeverity: 4, trend: "up", positive: false,
    keywords: ["can't log in", "otp never", "login failed", "signed out randomly", "verification code", "password reset failed"],
    templates: ["OTP never arrives, tried five times","Keeps signing me out randomly mid-order","Login failed even with the correct password","Verification code takes 10 minutes to arrive if at all","Can't log in with Google anymore since the update"]},
  { key: "missing", label: "Missing items from order", baseSeverity: 4, trend: "down", positive: false,
    keywords: ["missing item", "didn't receive", "item not in bag", "short delivery", "incomplete order", "item not received", "only two arrived", "only got half"],
    templates: ["Paid for three items, only two arrived","One item was missing from the whole order","Item I paid extra for never showed up","Order was missing an entire piece again","Ordered a set, only got half of it"]},
];

// fallback buckets for anything the keyword dictionary doesn't catch — never silently dropped
const FALLBACK_THEMES = {
  positive: { key: "other_positive", label: "Positive feedback (no issue detected)", baseSeverity: 1, positive: true },
  negative: { key: "other_negative", label: "Other complaints (uncategorized)", baseSeverity: 2, positive: false },
  neutral: { key: "other_neutral", label: "No issue detected", baseSeverity: 1, positive: false },
};

const TOTAL_DAYS = 60;
const RECENT_WINDOW = 15;
const CLASSIFY_SERVER_URL = "http://localhost:3001/api/classify-uncategorized";
const SUMMARY_SERVER_URL = "http://localhost:3001/api/executive-summary";

// ---------- sentiment detection (runs BEFORE theme matching) ----------
// A star rating is a strong signal when present, but it doesn't override clearly
// worded text at a neutral (3-star) rating, and negation ("not satisfied", "isn't
// great") is checked so a negated positive word doesn't get counted as positive.
// This still isn't 100% (sarcasm and mixed-sentiment text are genuinely ambiguous
// for any keyword-based system) but it closes the two most common failure modes.
const POSITIVE_WORDS = ["great", "love", "loved", "excellent", "amazing", "perfect", "satisfied", "smooth",
  "easy to use", "fast delivery", "fresh", "polite", "good", "quick", "fantastic", "awesome", "friendly",
  "helpful", "recommend", "best", "nice", "happy", "wonderful", "matched the description", "arrived hot",
  "quick delivery", "useful", "impressed", "delightful", "reliable", "convenient", "seamless", "flawless",
  "worth it", "exceeded expectations", "works great", "works well", "no complaints", "very pleased"];
const NEGATIVE_WORDS = ["bad", "terrible", "worst", "disappointed", "disappointing", "slow", "late", "broken",
  "rude", "cold", "wrong", "missing", "delay", "delayed", "issue", "problem", "poor", "awful", "horrible",
  "annoying", "frustrat", "unacceptable", "waste", "overpriced", "expensive", "damaged", "defective",
  "crash", "freeze", "error", "refund", "cancelled", "useless", "regret", "avoid", "scam", "ripoff",
  "never again", "unreliable", "buggy", "malfunction"];
const NEGATION_WORDS = ["not", "n't", "never", "no", "without", "hardly", "barely"];

// Checks the few words immediately before a matched sentiment word for a negation
// cue ("not satisfied", "wasn't great") and flips the polarity of that hit if found.
function countPolarityHits(lower, wordList, isNegationCheck) {
  let hits = 0;
  for (const phrase of wordList) {
    let idx = lower.indexOf(phrase);
    while (idx !== -1) {
      const windowStart = Math.max(0, idx - 15);
      const preceding = lower.slice(windowStart, idx);
      const negated = NEGATION_WORDS.some((n) => preceding.includes(n));
      if (isNegationCheck ? negated : !negated) hits++;
      idx = lower.indexOf(phrase, idx + phrase.length);
    }
  }
  return hits;
}

function lexiconSentiment(text) {
  const lower = text.toLowerCase();
  // straightforward hits (not negated) plus negated-opposite hits (e.g. "not bad" -> counts toward positive)
  const posHits = countPolarityHits(lower, POSITIVE_WORDS, false) + countPolarityHits(lower, NEGATIVE_WORDS, true);
  const negHits = countPolarityHits(lower, NEGATIVE_WORDS, false) + countPolarityHits(lower, POSITIVE_WORDS, true);
  if (posHits === 0 && negHits === 0) return "neutral";
  if (posHits > negHits) return "positive";
  if (negHits > posHits) return "negative";
  return "neutral";
}

function detectSentiment(text, ratingHint, sentimentHint) {
  const sentimentLower = (sentimentHint ?? "").toString().toLowerCase();
  if (sentimentLower.includes("pos")) return "positive";
  if (sentimentLower.includes("neg")) return "negative";
  if (sentimentLower.includes("neu")) return "neutral";

  const ratingNum = Number(ratingHint);
  const hasRating = ratingHint !== null && ratingHint !== undefined && ratingHint !== "" && !isNaN(ratingNum);
  if (hasRating) {
    if (ratingNum >= 4) return "positive";
    if (ratingNum <= 2) return "negative";
    // a mid (3-star) rating shouldn't silently override text that clearly leans one way
    const textLean = lexiconSentiment(text);
    return textLean !== "neutral" ? textLean : "neutral";
  }

  return lexiconSentiment(text);
}

// ---------- rating / text mismatch detection ----------
// A star rating and the words in the review don't always agree — a 1-star rating
// next to "works great, very happy" is a real, common pattern (mis-tap, rating meant
// for something else, delayed edit, etc.), and forcing it into the "negative" bucket
// would put a good review in the bad-review pile and quietly corrupt every chart that
// counts by sentiment. Rather than guessing which signal is "right," these rows are
// pulled out of normal classification entirely and reported on their own, with the
// contradiction stated plainly instead of resolved silently.
function detectRatingTextMismatch(text, ratingHint) {
  const ratingNum = Number(ratingHint);
  const hasRating = ratingHint !== null && ratingHint !== undefined && ratingHint !== "" && !isNaN(ratingNum);
  if (!hasRating) return null;
  const textLean = lexiconSentiment(text);
  if (ratingNum <= 2 && textLean === "positive") {
    return {
      type: "low_rating_good_review",
      label: "Low rating, but review reads positive",
      note: "Problem not specified by the customer — the written review reads positive despite the low star rating, so it's kept separate rather than counted as a complaint.",
    };
  }
  if (ratingNum >= 4 && textLean === "negative") {
    return {
      type: "high_rating_bad_review",
      label: "High rating, but review reads negative",
      note: "The written review reads negative despite the high star rating (possible mis-tap or a rating that didn't match the comment) — kept separate rather than counted as praise.",
    };
  }
  return null;
}

// ---------- severity: derived per-review, not a fixed constant per theme ----------
// Base severity comes from the theme, then adjusts for star rating and complaint-
// intensity language ("never", "every time", "worst", etc.) so two reviews in the
// same theme can carry different severities instead of every row in a category
// showing an identical, suspiciously round score.
const INTENSITY_WORDS = ["never", "again", "worst", "unacceptable", "still", "every time", "always", "refuse", "awful", "horrible"];

function computeSeverity(baseSeverity, text, ratingHint) {
  let severity = baseSeverity;
  const ratingNum = Number(ratingHint);
  if (ratingHint !== null && ratingHint !== undefined && ratingHint !== "" && !isNaN(ratingNum)) {
    if (ratingNum <= 1) severity += 1.5;
    else if (ratingNum === 2) severity += 0.5;
    else if (ratingNum >= 4) severity -= 1;
  }
  const lower = text.toLowerCase();
  const hits = INTENSITY_WORDS.filter((w) => lower.includes(w)).length;
  severity += Math.min(hits, 2) * 0.5;
  return Math.max(1, Math.min(5, Math.round(severity * 10) / 10));
}

// ---------- generic classification ----------
// excludePositiveThemes is set once we already know the review's sentiment isn't
// positive, so a coincidental keyword can't route a negative/neutral review into
// a "praise" theme (or vice versa).
function classifyText(text, excludePositiveThemes) {
  const lower = text.toLowerCase();
  for (const theme of THEME_DEFS) {
    if (excludePositiveThemes && theme.positive) continue;
    if (theme.keywords.some((k) => lower.includes(k))) return theme;
  }
  return null;
}

function classifyRow(text, ratingHint, sentimentHint) {
  const sentiment = detectSentiment(text, ratingHint, sentimentHint);

  if (sentiment === "positive") {
    // still allow explicit UI/redesign praise to be labeled distinctly; anything else
    // positive goes to the "no complaint" bucket rather than being forced into one
    const praiseTheme = THEME_DEFS.find((t) => t.positive && t.keywords.some((k) => text.toLowerCase().includes(k)));
    return praiseTheme || FALLBACK_THEMES.positive;
  }

  const theme = classifyText(text, true);
  if (theme) return theme;
  return sentiment === "negative" ? FALLBACK_THEMES.negative : FALLBACK_THEMES.neutral;
}

// ---------- generic column detection for arbitrary CSV schemas ----------
const TEXT_COL_HINTS = ["review_text", "reviewtext", "review text", "comment", "feedback", "description", "review", "text", "body", "message", "content"];
const DATE_COL_HINTS = ["date", "time", "created"];
const RATING_COL_HINTS = ["rating", "stars", "score"];
const SENTIMENT_COL_HINTS = ["sentiment"];
const LOCATION_COL_HINTS = ["location", "city", "region", "state", "country", "store", "branch", "market", "area"];

function findColumn(fields, hints, rows) {
  const lowerFields = fields.map((f) => ({ raw: f, norm: f.trim().toLowerCase().replace(/[^a-z]/g, "") }));
  for (const hint of hints) {
    const h = hint.replace(/[^a-z]/g, "");
    const exact = lowerFields.find((f) => f.norm === h);
    if (exact) return exact.raw;
  }
  for (const hint of hints) {
    const match = lowerFields.find((f) => f.raw.trim().toLowerCase().includes(hint));
    if (match) return match.raw;
  }
  return null;
}

function detectTextColumn(fields, rows) {
  const byHint = findColumn(fields, TEXT_COL_HINTS, rows);
  if (byHint) return byHint;
  // fallback: column with the longest average string length wins (likely free-text)
  let bestField = fields[0], bestAvgLen = 0;
  const sample = rows.slice(0, 50);
  fields.forEach((f) => {
    const avgLen = sample.reduce((a, r) => a + ((r[f] || "").toString().length), 0) / (sample.length || 1);
    if (avgLen > bestAvgLen) { bestAvgLen = avgLen; bestField = f; }
  });
  return bestField;
}

function slugify(label) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

function resolveThemeFromAI(themeLabel, aiPositive, aiSeverity) {
  const clampedSeverity = aiSeverity != null ? Math.max(1, Math.min(5, Number(aiSeverity))) : null;
  const known = THEME_DEFS.find((t) => t.label.toLowerCase() === (themeLabel || "").toLowerCase());
  if (known) {
    // trust the model's own positive/negative call over the static theme default —
    // a review can match a theme's keywords while genuinely being positive
    return { key: known.key, label: known.label, positive: aiPositive !== undefined ? !!aiPositive : known.positive, severity: clampedSeverity ?? known.baseSeverity };
  }
  const knownFallback = Object.values(FALLBACK_THEMES).find((t) => t.label.toLowerCase() === (themeLabel || "").toLowerCase());
  if (knownFallback) {
    return { key: knownFallback.key, label: knownFallback.label, positive: aiPositive !== undefined ? !!aiPositive : knownFallback.positive, severity: clampedSeverity ?? knownFallback.baseSeverity };
  }
  const key = "ai_" + slugify(themeLabel || "uncategorized");
  return { key, label: themeLabel || "AI-identified issue", positive: !!aiPositive, severity: clampedSeverity ?? (aiPositive ? 1 : 3) };
}

// Rejects dates the tool can't trust: anything in the future (which previously produced
// negative "days ago" values and silently blew the priority score past its 0-1 range) or
// unparseable strings. Returns null rather than coercing to today or epoch, so callers can
// tell "no usable date" apart from "this happened today."
function daysAgo(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const now = new Date();
  const diff = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  return diff < 0 ? null : diff;
}

function clusterAndScore(rows, weights) {
  const byTheme = {};
  rows.forEach((r) => {
    if (!byTheme[r.themeKey]) byTheme[r.themeKey] = { themeKey: r.themeKey, themeLabel: r.themeLabel, positive: r.positive, items: [] };
    byTheme[r.themeKey].items.push(r);
  });
  const clusters = Object.values(byTheme).map((c) => {
    const count = c.items.length;
    const validDays = c.items.map((r) => daysAgo(r.date)).filter((d) => d !== null);
    const trendAvailable = validDays.length / count >= 0.5; // need a majority of usable dates to trust a trend
    const recentCount = trendAvailable ? c.items.filter((r) => { const d = daysAgo(r.date); return d !== null && d <= RECENT_WINDOW; }).length : 0;
    const priorCount = trendAvailable ? c.items.filter((r) => { const d = daysAgo(r.date); return d !== null && d > RECENT_WINDOW && d <= RECENT_WINDOW * 2; }).length : 0;
    const trendDelta = trendAvailable ? recentCount - priorCount : 0;
    const avgSeverity = c.items.reduce((a, r) => a + r.severity, 0) / count;
    const mostRecentDaysAgo = validDays.length ? Math.min(...validDays) : null;
    return { ...c, count, recentCount, priorCount, trendDelta, trendAvailable, avgSeverity, mostRecentDaysAgo };
  });
  const maxCount = Math.max(...clusters.map((c) => c.count), 1);
  const maxAbsTrend = Math.max(...clusters.map((c) => Math.abs(c.trendDelta)), 1);
  clusters.forEach((c) => {
    const freqScore = c.count / maxCount;
    const trendScore = c.positive ? 0 : Math.max(0, c.trendDelta / maxAbsTrend);
    const severityScore = c.avgSeverity / 5;
    // clamped to [0,1] — previously a future-dated (invalid) row could push this above 1
    // and make the overall priority score blow past its intended 0-1 range
    const recencyScore = c.mostRecentDaysAgo === null ? 0 : Math.max(0, Math.min(1, 1 - c.mostRecentDaysAgo / TOTAL_DAYS));
    c.priority = c.positive ? 0 : freqScore * weights.freq + trendScore * weights.trend + severityScore * weights.severity + recencyScore * weights.recency;
    c.freqScore = freqScore; c.trendScore = trendScore; c.severityScore = severityScore; c.recencyScore = recencyScore;
  });
  return clusters.sort((a, b) => b.priority - a.priority);
}

const trendIcon = (delta) => (delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus);
const trendColorClass = (delta, positive) => {
  if (positive) return delta > 0 ? "text-teal-600" : "text-slate-400";
  return delta > 0 ? "text-rose-600" : delta < 0 ? "text-teal-600" : "text-slate-400";
};
const urgencyColor = (score) => (score > 0.66 ? PALETTE.rose : score > 0.33 ? PALETTE.amber : PALETTE.teal);
const urgencyBorderClass = (score) => (score > 0.66 ? "border-l-rose-500" : score > 0.33 ? "border-l-amber-400" : "border-l-teal-500");

function useCountUp(target, duration = 800) {
  const [value, setValue] = useState(0);
  const startRef = useRef(null);
  useEffect(() => {
    startRef.current = null;
    let raf;
    function step(ts) {
      if (!startRef.current) startRef.current = ts;
      const progress = Math.min((ts - startRef.current) / duration, 1);
      setValue(target * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

// ---------- file parsers ----------
// Rejects dates that can't be trusted for trend analysis: unparseable strings,
// anything in the future, or anything implausibly old for a review dataset. Returns
// null (not "today", not epoch) so these rows are excluded from date-based charts
// rather than silently corrupting them — this is what was producing years like
// "2047" or "1970" bleeding into the trend chart.
function parseValidDate(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d)) return null;
  const now = new Date();
  const minDate = new Date(now);
  minDate.setFullYear(now.getFullYear() - 5);
  if (d > now || d < minDate) return null;
  return d;
}

function parseCsvFile(file) {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (results) => {
        const fields = results.meta.fields || [];
        const rows = results.data;
        if (!fields.length || !rows.length) return resolve({ rows: [], matched: 0, unmatched: 0, total: 0 });
        const textCol = detectTextColumn(fields, rows);
        const dateCol = findColumn(fields, DATE_COL_HINTS, rows);
        const ratingCol = findColumn(fields, RATING_COL_HINTS, rows);
        const sentimentCol = findColumn(fields, SENTIMENT_COL_HINTS, rows);
        const locationCol = findColumn(fields, LOCATION_COL_HINTS, rows);
        let matched = 0, categorized = 0, skipped = 0;
        const out = [];
        rows.forEach((row) => {
          const text = (row[textCol] || "").toString().trim();
          // data validation: ignore corrupted/empty/placeholder records rather than
          // letting them distort classification or analytics; logged, not shown to the user
          if (!text || text.length < 3 || /^(n\/?a|null|undefined|none|-+)$/i.test(text)) { skipped++; return; }
          const ratingHint = ratingCol ? row[ratingCol] : null;
          const validDate = dateCol ? parseValidDate(row[dateCol]) : null;
          const rowDate = validDate ? validDate.toISOString().slice(0, 10) : (dateCol ? null : new Date().toISOString().slice(0, 10));
          const rowLocation = locationCol ? (row[locationCol] || "").toString().trim() || null : null;

          // Rating/text mismatch check runs first and, if triggered, takes the row out of
          // normal theme classification entirely — see detectRatingTextMismatch for why.
          const mismatch = detectRatingTextMismatch(text, ratingHint);
          if (mismatch) {
            categorized++;
            out.push({
              source: file.name, date: rowDate, text, rating: Number(row[ratingCol]),
              location: rowLocation,
              themeKey: `rating_text_mismatch_${mismatch.type === "low_rating_good_review" ? "low" : "high"}`,
              themeLabel: mismatch.label,
              severity: computeSeverity(1, text, ratingHint),
              positive: mismatch.type === "low_rating_good_review",
              mismatch: true,
              mismatchType: mismatch.type,
              mismatchNote: mismatch.note,
            });
            return;
          }

          const theme = classifyRow(text, ratingHint, sentimentCol ? row[sentimentCol] : null);
          const isFallback = theme.key.startsWith("other_");
          if (!isFallback) matched++;
          categorized++;
          const sentiment = detectSentiment(text, ratingHint, sentimentCol ? row[sentimentCol] : null);
          out.push({
            source: file.name,
            date: rowDate,
            text, rating: ratingCol ? Number(row[ratingCol]) : (sentiment === "positive" ? 5 : sentiment === "negative" ? 2 : 3),
            location: rowLocation,
            themeKey: theme.key, themeLabel: theme.label,
            severity: computeSeverity(theme.baseSeverity, text, ratingHint),
            positive: sentiment === "positive",
            mismatch: false,
          });
        });
        if (skipped > 0) console.warn(`${file.name}: skipped ${skipped} corrupted/empty record(s) during ingestion.`);
        resolve({ rows: out, matched, unmatched: categorized - matched, total: rows.length, detectedColumn: textCol });
      },
      error: () => resolve({ rows: [], matched: 0, unmatched: 0, total: 0, error: true }),
    });
  });
}

function parseTxtFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const lines = (reader.result || "").split(/\r?\n+/).map((l) => l.trim()).filter((l) => l.length > 15);
      let matched = 0;
      const out = lines.map((text) => {
        const theme = classifyRow(text, null, null);
        if (!theme.key.startsWith("other_")) matched++;
        const sentiment = detectSentiment(text, null, null);
        return {
          source: file.name, date: new Date().toISOString().slice(0, 10), text, location: null,
          rating: sentiment === "positive" ? 5 : sentiment === "negative" ? 2 : 3,
          themeKey: theme.key, themeLabel: theme.label,
          severity: computeSeverity(theme.baseSeverity, text, null),
          positive: sentiment === "positive",
        };
      });
      resolve({ rows: out, matched, unmatched: out.length - matched, total: lines.length });
    };
    reader.onerror = () => resolve({ rows: [], matched: 0, unmatched: 0, total: 0, error: true });
    reader.readAsText(file);
  });
}

async function parseImageFile(file, onProgress) {
  try {
    const { data } = await Tesseract.recognize(file, "eng", {
      logger: (m) => { if (m.status === "recognizing text") onProgress?.(Math.round(m.progress * 100)); },
    });
    const lines = (data.text || "").split(/\r?\n+/).map((l) => l.trim()).filter((l) => l.length > 15);
    let matched = 0;
    const out = lines.map((text) => {
      const theme = classifyRow(text, null, null);
      if (!theme.key.startsWith("other_")) matched++;
      const sentiment = detectSentiment(text, null, null);
      return {
        source: file.name, date: new Date().toISOString().slice(0, 10), text, location: null,
        rating: sentiment === "positive" ? 5 : sentiment === "negative" ? 2 : 3,
        themeKey: theme.key, themeLabel: theme.label,
        severity: computeSeverity(theme.baseSeverity, text, null),
        positive: sentiment === "positive",
      };
    });
    return { rows: out, matched, unmatched: out.length - matched, total: lines.length };
  } catch (e) {
    return { rows: [], matched: 0, unmatched: 0, total: 0, error: true };
  }
}

export default function ReviewCopilotDashboard() {
  const [rawRows, setRawRows] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [statusMap, setStatusMap] = useState({});
  const [sourceFilter, setSourceFilter] = useState("all");
  const [showFixed, setShowFixed] = useState(false);
  const [showUncategorized, setShowUncategorized] = useState(false);
  const [weights, setWeights] = useState({ freq: 40, trend: 25, severity: 25, recency: 10 });
  const [isDragging, setIsDragging] = useState(false);
  const [view, setView] = useState("issues");
  const [fileQueue, setFileQueue] = useState([]); // {name, type, status, matched, unmatched, total, progress}
  const [aiStatus, setAiStatus] = useState(null); // { running } | { done, reclassified, total } | { error }
  const [aiSummaryStatus, setAiSummaryStatus] = useState(null); // { running } | { done, bullets } | { error }

  const normalizedWeights = useMemo(() => {
    const sum = weights.freq + weights.trend + weights.severity + weights.recency || 1;
    return { freq: weights.freq / sum, trend: weights.trend / sum, severity: weights.severity / sum, recency: weights.recency / sum };
  }, [weights]);

  const uniqueSources = useMemo(() => {
    const seen = new Map();
    rawRows.forEach((r) => { if (!seen.has(r.source)) seen.set(r.source, 0); seen.set(r.source, seen.get(r.source) + 1); });
    return Array.from(seen.entries());
  }, [rawRows]);

  const filteredRows = useMemo(() => {
    let rows = sourceFilter === "all" ? rawRows : rawRows.filter((r) => r.source === sourceFilter);
    // Rating/text mismatches are never folded into normal issue or praise clusters —
    // a contradictory review shouldn't quietly become "evidence" in either direction.
    rows = rows.filter((r) => !r.mismatch);
    if (!showUncategorized) rows = rows.filter((r) => !r.themeKey.startsWith("other_"));
    return rows;
  }, [rawRows, sourceFilter, showUncategorized]);

  const mismatchRows = useMemo(() => rawRows.filter((r) => r.mismatch), [rawRows]);

  const clusters = useMemo(() => clusterAndScore(filteredRows, normalizedWeights), [filteredRows, normalizedWeights]);
  const issueClusters = clusters.filter((c) => !c.positive);
  const praiseClusters = clusters.filter((c) => c.positive);
  const visibleIssueClusters = showFixed ? issueClusters : issueClusters.filter((c) => statusMap[c.themeKey] !== "fixed");

  const uncategorizedCount = useMemo(() => rawRows.filter((r) => r.themeKey.startsWith("other_")).length, [rawRows]);

  const handleFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList);
    const queueInit = files.map((f) => ({ name: f.name, status: "pending", progress: 0 }));
    setFileQueue((prev) => [...queueInit, ...prev]);

    for (const file of files) {
      setFileQueue((prev) => prev.map((f) => (f.name === file.name && f.status === "pending" ? { ...f, status: "processing" } : f)));
      let result;
      const lowerName = file.name.toLowerCase();
      if (file.type === "text/csv" || lowerName.endsWith(".csv")) {
        result = await parseCsvFile(file);
      } else if (file.type.startsWith("image/")) {
        result = await parseImageFile(file, (pct) => {
          setFileQueue((prev) => prev.map((f) => (f.name === file.name ? { ...f, progress: pct } : f)));
        });
      } else if (file.type === "text/plain" || lowerName.endsWith(".txt")) {
        result = await parseTxtFile(file);
      } else {
        result = { rows: [], matched: 0, unmatched: 0, total: 0, error: true, unsupported: true };
      }

      setRawRows((prev) => {
        const nextId = Math.max(0, ...prev.map((r) => r.id || 0)) + 1;
        const withIds = result.rows.map((r, i) => ({ id: nextId + i, ...r }));
        return [...withIds, ...prev];
      });
      setFileQueue((prev) => prev.map((f) => (f.name === file.name ? { ...f, status: result.error ? "error" : "done", matched: result.matched, unmatched: result.unmatched, total: result.total, detectedColumn: result.detectedColumn, unsupported: result.unsupported } : f)));
    }
  }, []);

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  };

  const removeFile = useCallback((fileName) => {
    setRawRows((prev) => prev.filter((r) => r.source !== fileName));
    setFileQueue((prev) => prev.filter((f) => f.name !== fileName));
  }, []);

  const clearAllUploads = useCallback(() => {
    setRawRows([]);
    setFileQueue([]);
  }, []);

  const reanalyzeUncategorized = useCallback(async () => {
    const uncategorizedRows = rawRows.filter((r) => r.themeKey.startsWith("other_"));
    if (uncategorizedRows.length === 0) return;
    setAiStatus({ running: true });
    try {
      const response = await fetch(CLASSIFY_SERVER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: uncategorizedRows.map((r) => r.text) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Server returned an error");

      setRawRows((prev) => {
        const byId = new Map(prev.map((r) => [r.id, r]));
        (data.results || []).forEach((res) => {
          const row = uncategorizedRows[res.index];
          if (!row) return;
          const resolved = resolveThemeFromAI(res.themeLabel, res.positive, res.severity);
          const existing = byId.get(row.id);
          if (existing) byId.set(row.id, { ...existing, themeKey: resolved.key, themeLabel: resolved.label, positive: resolved.positive, severity: resolved.severity });
        });
        return Array.from(byId.values());
      });
      setAiStatus({ done: true, reclassified: (data.results || []).length, total: uncategorizedRows.length });
    } catch (e) {
      setAiStatus({ error: e.message || "Could not reach the local classification server." });
    }
  }, [rawRows]);

  const totalReviews = rawRows.length;
  const worseCount = issueClusters.filter((c) => c.trendDelta > 0).length;
  const betterCount = clusters.filter((c) => (c.positive && c.trendDelta > 0) || (!c.positive && c.trendDelta < 0)).length;

  // Optional: ask the real Groq backend to turn the same structured KPI/insight
  // data the rule-based summary uses into a couple sentences of exec-ready prose.
  // Never sends raw review text unless the person opts in — just aggregates.
  const generateAiSummary = useCallback(async () => {
    setAiSummaryStatus({ running: true });
    try {
      const profile = buildDataProfile(rawRows);
      const kpis = generateKPIs(profile, issueClusters);
      const insights = generateInsights(profile, clusters, RECENT_WINDOW);
      const recommendations = generateRecommendations(issueClusters, profile);
      const topIssues = [...issueClusters].sort((a, b) => b.priority - a.priority).slice(0, 5)
        .map((c) => ({ theme: c.themeLabel, count: c.count, avgSeverity: Number(c.avgSeverity.toFixed(2)), trendDelta: c.trendDelta, priority: Number(c.priority.toFixed(2)) }));

      const response = await fetch(SUMMARY_SERVER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, kpis, insights, recommendations, topIssues }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Server returned an error");
      setAiSummaryStatus({ done: true, bullets: data.bullets || [] });
    } catch (e) {
      setAiSummaryStatus({ error: e.message || "Could not reach the local summary server." });
    }
  }, [rawRows, clusters, issueClusters]);

  return (
    <div className="w-full max-w-[1600px] mx-auto p-6 lg:p-8 bg-slate-50 min-h-screen">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Review intelligence</h1>
            <span className="flex items-center gap-1 text-[11px] font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-full px-2 py-0.5">
              <Radio size={10} className="animate-pulse" /> Live
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">Works with any CSV export, plain text dumps, or review screenshots</p>
        </div>
        <div className="flex bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
          <button onClick={() => setView("issues")} className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md transition-all ${view === "issues" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            <LayoutDashboard size={14} /> Issues
          </button>
          <button onClick={() => setView("analytics")} className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md transition-all ${view === "analytics" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
            <BarChart3 size={14} /> Analytics
          </button>
        </div>
      </div>

      {view === "issues" ? (
        <IssuesView
          rawRows={rawRows} totalReviews={totalReviews} uniqueSources={uniqueSources}
          isDragging={isDragging} setIsDragging={setIsDragging} onDrop={onDrop} handleFiles={handleFiles}
          fileQueue={fileQueue} sourceFilter={sourceFilter} setSourceFilter={setSourceFilter}
          weights={weights} setWeights={setWeights} worseCount={worseCount} betterCount={betterCount}
          issueClusters={issueClusters} visibleIssueClusters={visibleIssueClusters} praiseClusters={praiseClusters}
          showFixed={showFixed} setShowFixed={setShowFixed} expanded={expanded} setExpanded={setExpanded}
          statusMap={statusMap} setStatusMap={setStatusMap} onOpenAnalytics={() => setView("analytics")}
          uncategorizedCount={uncategorizedCount} showUncategorized={showUncategorized} setShowUncategorized={setShowUncategorized}
          removeFile={removeFile} clearAllUploads={clearAllUploads} aiStatus={aiStatus} reanalyzeUncategorized={reanalyzeUncategorized}
        />
      ) : (
        <AnalyticsView
          rawRows={rawRows} clusters={clusters} issueClusters={issueClusters} totalReviews={totalReviews}
          mismatchRows={mismatchRows}
          onBack={() => setView("issues")} aiSummaryStatus={aiSummaryStatus} generateAiSummary={generateAiSummary}
        />
      )}
    </div>
  );
}

function IssuesView({
  rawRows, totalReviews, uniqueSources, isDragging, setIsDragging, onDrop, handleFiles, fileQueue,
  sourceFilter, setSourceFilter, weights, setWeights, worseCount, betterCount,
  issueClusters, visibleIssueClusters, praiseClusters, showFixed, setShowFixed,
  expanded, setExpanded, statusMap, setStatusMap, onOpenAnalytics, uncategorizedCount, showUncategorized, setShowUncategorized,
  removeFile, clearAllUploads, aiStatus, reanalyzeUncategorized,
}) {
  const stillProcessing = fileQueue.some((f) => f.status === "processing" || f.status === "pending");
  return (
    <>
      {totalReviews === 0 && fileQueue.length === 0 && (
        <div className="bg-white border border-slate-200 border-dashed rounded-xl p-8 mb-6 text-center">
          <Upload size={26} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">No data yet</p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Drop in review exports, support ticket CSVs, .txt dumps, or screenshots below to populate the dashboard. Nothing is pre-loaded.
          </p>
        </div>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl p-6 mb-4 text-center transition-colors ${isDragging ? "border-indigo-400 bg-indigo-50" : "border-slate-200 bg-white"}`}
      >
        <Upload size={22} className="mx-auto mb-2 text-slate-400" />
        <p className="text-sm text-slate-600">Drag in up to 20+ files at once &mdash; CSV exports, .txt dumps, or review screenshots</p>
        <label className="inline-block mt-2 text-sm font-medium text-indigo-600 cursor-pointer hover:text-indigo-700">
          browse files
          <input type="file" multiple accept=".csv,.txt,image/*" className="hidden" onChange={(e) => e.target.files?.length && handleFiles(e.target.files)} />
        </label>
        <p className="text-xs text-slate-400 mt-2">CSV: any column name works (auto-detects text/date/rating). Screenshots are read via on-device OCR &mdash; large batches take a bit longer.</p>
      </div>

      {fileQueue.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-3 mb-6 max-h-56 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-slate-500">{stillProcessing ? "Processing files…" : "Upload results"}</p>
            {!stillProcessing && (
              <button onClick={clearAllUploads} className="text-xs text-slate-400 hover:text-rose-600 transition-colors">
                Clear all uploads
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            {fileQueue.map((f, i) => {
              const canRemove = f.status === "done" || f.status === "error";
              return (
                <div key={i} className="flex items-center justify-between text-xs py-1 px-2 rounded-md bg-slate-50">
                  <div className="flex items-center gap-2 min-w-0">
                    {f.name.toLowerCase().endsWith(".csv") ? <FileText size={12} className="text-slate-400 shrink-0" /> : f.name.match(/\.(png|jpg|jpeg)$/i) ? <ImageIcon size={12} className="text-slate-400 shrink-0" /> : <FileText size={12} className="text-slate-400 shrink-0" />}
                    <span className="truncate text-slate-600">{f.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-slate-500">
                    {f.status === "processing" && <span className="flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> {f.progress ? `${f.progress}%` : "…"}</span>}
                    {f.status === "pending" && <span className="text-slate-400">queued</span>}
                    {f.status === "done" && !f.unsupported && <span className="text-teal-600">{f.matched} matched{f.unmatched ? `, ${f.unmatched} uncategorized` : ""} of {f.total}</span>}
                    {f.status === "error" && !f.unsupported && <span className="text-rose-600">failed to parse</span>}
                    {f.unsupported && <span className="text-amber-600">unsupported file type</span>}
                    {canRemove && (
                      <button onClick={() => removeFile(f.name)} title="Remove this file's data" className="text-slate-300 hover:text-rose-600 transition-colors ml-1">
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Reviews analyzed" value={totalReviews} icon={Activity} accent="indigo" />
        <StatCard label="Issue themes" value={issueClusters.length} icon={LayoutDashboard} accent="slate" />
        <StatCard label="Getting worse" value={worseCount} icon={AlertTriangle} accent="rose" />
        <StatCard label="Improving" value={betterCount} icon={CheckCircle2} accent="teal" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 mr-1">Source:</span>
          <FilterPill active={sourceFilter === "all"} onClick={() => setSourceFilter("all")} label={`All (${totalReviews})`} />
          {uniqueSources.slice(0, 6).map(([src, count]) => (
            <FilterPill key={src} active={sourceFilter === src} onClick={() => setSourceFilter(src)} label={`${src} (${count})`} />
          ))}
        </div>
        <button onClick={onOpenAnalytics} className="flex items-center gap-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors px-3.5 py-2 rounded-lg shadow-sm">
          <BarChart3 size={15} /> View analytics dashboard
        </button>
      </div>

      {uncategorizedCount > 0 && (
        <div className="flex flex-col gap-2 mb-4 text-xs text-slate-500 bg-slate-100 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2 flex-wrap">
            <HelpCircle size={13} className="shrink-0" />
            <span>{uncategorizedCount} reviews didn't match a known theme and are grouped as "uncategorized" rather than being dropped.</span>
            <label className="flex items-center gap-1 ml-auto cursor-pointer shrink-0">
              <input type="checkbox" checked={showUncategorized} onChange={(e) => setShowUncategorized(e.target.checked)} className="rounded accent-indigo-600" />
              Include in analysis
            </label>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={reanalyzeUncategorized}
              disabled={aiStatus?.running}
              className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 bg-white border border-indigo-200 hover:bg-indigo-50 transition-colors px-2.5 py-1.5 rounded-md disabled:opacity-50"
            >
              {aiStatus?.running ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {aiStatus?.running ? "Asking Groq to re-classify…" : "Re-analyze uncategorized with AI"}
            </button>
            {aiStatus?.done && <span className="text-teal-700">Reclassified {aiStatus.reclassified} of {aiStatus.total}</span>}
            {aiStatus?.error && <span className="text-rose-600">{aiStatus.error} (start it with <code className="bg-white px-1 rounded">npm run server</code>, with your key in <code className="bg-white px-1 rounded">server/.env</code>)</span>}
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <SlidersHorizontal size={15} className="text-slate-400" />
          <p className="text-sm font-medium text-slate-700">Priority weighting</p>
          <span className="text-xs text-slate-400">&mdash; adjust to see ranking change live</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3">
          <WeightSlider label="Frequency" value={weights.freq} onChange={(v) => setWeights((w) => ({ ...w, freq: v }))} />
          <WeightSlider label="Trend (getting worse)" value={weights.trend} onChange={(v) => setWeights((w) => ({ ...w, trend: v }))} />
          <WeightSlider label="Severity" value={weights.severity} onChange={(v) => setWeights((w) => ({ ...w, severity: v }))} />
          <WeightSlider label="Recency" value={weights.recency} onChange={(v) => setWeights((w) => ({ ...w, recency: v }))} />
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-medium text-slate-800">Prioritized issues</h2>
        <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
          <input type="checkbox" checked={showFixed} onChange={(e) => setShowFixed(e.target.checked)} className="rounded accent-indigo-600" />
          Show fixed
        </label>
      </div>

      <div className="flex flex-col gap-2.5 mb-8">
        {visibleIssueClusters.map((c, i) => (
          <IssueCard key={c.themeKey} rank={i + 1} cluster={c} isOpen={!!expanded[c.themeKey]} onToggle={() => setExpanded((e) => ({ ...e, [c.themeKey]: !e[c.themeKey] }))} status={statusMap[c.themeKey] || "new"} onStatusChange={(status) => setStatusMap((m) => ({ ...m, [c.themeKey]: status }))} />
        ))}
        {visibleIssueClusters.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No open issues match this filter.</p>}
      </div>

      {praiseClusters.length > 0 && (
        <>
          <h2 className="text-base font-medium text-slate-800 mb-3">What&rsquo;s working</h2>
          <div className="flex flex-col gap-2.5">
            {praiseClusters.map((c) => (
              <IssueCard key={c.themeKey} cluster={c} isOpen={!!expanded[c.themeKey]} onToggle={() => setExpanded((e) => ({ ...e, [c.themeKey]: !e[c.themeKey] }))} status={statusMap[c.themeKey] || "new"} onStatusChange={(status) => setStatusMap((m) => ({ ...m, [c.themeKey]: status }))} isPraise />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function AnalyticsView({ rawRows, clusters, issueClusters, totalReviews, mismatchRows = [], onBack, aiSummaryStatus, generateAiSummary }) {
  if (totalReviews === 0) {
    return (
      <div>
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors">
          <ArrowLeft size={15} /> Back to issues
        </button>
        <div className="bg-white border border-slate-200 border-dashed rounded-xl p-10 text-center">
          <BarChart3 size={26} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">Nothing to chart yet</p>
          <p className="text-xs text-slate-400 mt-1">Upload some review data from the Issues tab first.</p>
        </div>
      </div>
    );
  }

  // ---- Step 0: pull rating/text mismatches out of every downstream calculation ----
  // These rows genuinely contradict themselves (e.g. a 1-star rating next to a glowing
  // comment), so they're never allowed to inflate the negative count, the positive count,
  // or any theme cluster. They get their own dedicated section further down instead.
  const cleanRows = useMemo(() => rawRows.filter((r) => !r.mismatch), [rawRows]);

  // ---- Step 1: profile the dataset, then let the profile drive everything below ----
  const profile = useMemo(() => buildDataProfile(cleanRows), [cleanRows]);
  const visibility = useMemo(() => computeSectionVisibility(profile), [profile]);
  const weekOverWeek = useMemo(() => generateWeekOverWeekChange(cleanRows), [cleanRows]);
  const locationBreakdown = useMemo(() => generateLocationBreakdown(cleanRows), [cleanRows]);
  const locationTopIssues = useMemo(() => generateLocationTopIssues(cleanRows), [cleanRows]);
  const kpis = useMemo(() => generateKPIs(profile, issueClusters, weekOverWeek), [profile, issueClusters]);
  const insights = useMemo(() => generateInsights(profile, clusters, RECENT_WINDOW), [profile, clusters]);
  const businessRisks = useMemo(() => generateBusinessRisks(insights), [insights]);
  const otherInsights = useMemo(() => insights.filter((i) => !businessRisks.includes(i)), [insights, businessRisks]);
  const recommendations = useMemo(() => generateRecommendations(issueClusters, profile), [issueClusters, profile]);
  const rootCauses = useMemo(() => generateRootCauses(issueClusters), [issueClusters]);
  const customerVoice = useMemo(() => generateCustomerVoice(issueClusters), [issueClusters]);
  const summaryBullets = useMemo(() => generateExecutiveSummary(profile, clusters, recommendations, RECENT_WINDOW), [profile, clusters, recommendations]);

  const negativeCount = cleanRows.filter((r) => !r.positive).length;
  const positiveCount = cleanRows.length - negativeCount;

  // ---- Chart data: story order is Trends → Sentiment → Categories ----
  const weeks = 8;
  const trendData = Array.from({ length: weeks }).map((_, i) => {
    const start = (weeks - 1 - i) * 7;
    const end = start + 7;
    const count = cleanRows.filter((r) => !r.positive && daysAgo(r.date) >= start && daysAgo(r.date) < end).length;
    return { week: `W${weeks - i}`, complaints: count };
  }).reverse();
  const categoryTrend = useMemo(() => generateCategoryTrend(issueClusters, weeks), [issueClusters]);

  const sourceMap = {};
  cleanRows.forEach((r) => { sourceMap[r.source] = (sourceMap[r.source] || 0) + 1; });
  const sourceData = Object.entries(sourceMap).slice(0, 6).map(([name, value], i) => ({ name, value, color: CHART_COLORS[i % CHART_COLORS.length] }));
  const sentimentData = [
    { name: "Negative", value: negativeCount, color: PALETTE.rose },
    { name: "Positive", value: positiveCount, color: PALETTE.teal },
  ];
  const ratingDist = useMemo(() => generateRatingDistribution(cleanRows), [cleanRows]);
  const mismatchChartData = useMemo(() => {
    const low = mismatchRows.filter((r) => r.mismatchType === "low_rating_good_review").length;
    const high = mismatchRows.filter((r) => r.mismatchType === "high_rating_bad_review").length;
    return [
      { name: "Low rating, positive text", count: low, color: PALETTE.amber },
      { name: "High rating, negative text", count: high, color: PALETTE.sky },
    ].filter((d) => d.count > 0);
  }, [mismatchRows]);

  const volumeData = [...issueClusters].sort((a, b) => b.count - a.count).slice(0, 8).map((c) => ({ name: c.themeLabel.length > 24 ? c.themeLabel.slice(0, 22) + "…" : c.themeLabel, count: c.count, fill: urgencyColor(c.priority) }));
  const focusData = [...issueClusters].sort((a, b) => b.priority - a.priority).slice(0, 6).map((c) => ({ name: c.themeLabel.length > 28 ? c.themeLabel.slice(0, 26) + "…" : c.themeLabel, score: Number((c.priority * 100).toFixed(0)), fill: urgencyColor(c.priority) }));
  const priorityMatrix = useMemo(() => generatePriorityMatrix(issueClusters), [issueClusters]);
  const severityDist = useMemo(() => generateSeverityDistribution(issueClusters), [issueClusters]);

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4 transition-colors">
        <ArrowLeft size={15} /> Back to issues
      </button>

      {/* 1. Executive summary */}
      <ExecutiveSummaryCard bullets={summaryBullets} aiSummaryStatus={aiSummaryStatus} onGenerateAi={generateAiSummary} />

      {/* 2. KPI cards — only the ones the data supports */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        {kpis.map((k) => <KpiCard key={k.key} {...k} />)}
        {mismatchRows.length > 0 && (
          <KpiCard
            key="mismatch"
            label="Rating/review mismatches"
            value={mismatchRows.length.toLocaleString()}
            tooltip="Reviews where the star rating contradicts the text (e.g. low rating, positive comment) — excluded from every other chart and shown separately."
          />
        )}
      </div>

      {/* 3. Business risks — the headline-worthy subset of insights */}
      {businessRisks.length > 0 && <SectionHeader icon={AlertTriangle} title="Business risks" />}
      {businessRisks.length > 0 && <BusinessRisksSection risks={businessRisks} />}
      {otherInsights.length > 0 && <InsightsPanel insights={otherInsights} />}

      {/* 4. Trends */}
      <SectionHeader icon={TrendingUp} title="Trends" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {visibility.trend ? (
          <ChartCard title="Complaint volume trend (weekly)">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PALETTE.indigo} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={PALETTE.indigo} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={30} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Area type="monotone" dataKey="complaints" stroke={PALETTE.indigo} strokeWidth={2} fill="url(#trendFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : (
          <EmptyChartState title="Complaint volume trend" reason="No usable timestamp data available. Trend analysis cannot be generated from this dataset." />
        )}

        {visibility.trend && visibility.categories ? (
          <ChartCard title="Top themes over time">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={categoryTrend.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={30} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                {categoryTrend.themes.map((t, i) => (
                  <Line key={t} type="monotone" dataKey={t} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} name={t.length > 20 ? t.slice(0, 18) + "…" : t} />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <ChartLegend items={categoryTrend.themes.map((t, i) => ({ name: t.length > 20 ? t.slice(0, 18) + "…" : t, color: CHART_COLORS[i % CHART_COLORS.length], value: "" }))} />
          </ChartCard>
        ) : (
          <EmptyChartState title="Top themes over time" reason="Needs both usable timestamps and at least two categorized themes." />
        )}
      </div>

      {/* 5. Sentiment */}
      <SectionHeader icon={CheckCircle2} title="Sentiment" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {visibility.sentimentSplit ? (
          <ChartCard title="Sentiment split">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={sentimentData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={3} strokeWidth={0}>
                  {sentimentData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <ChartLegend items={sentimentData} />
          </ChartCard>
        ) : (
          <EmptyChartState
            title="Sentiment split"
            reason={
              positiveCount / (cleanRows.length || 1) >= 0.97
                ? "Sentiment is almost entirely positive — a comparison chart would just be a solid wedge."
                : "Only one sentiment class detected in meaningful volume. Sentiment comparison is omitted."
            }
          />
        )}

        {visibility.ratings ? (
          <ChartCard title="Rating distribution">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={ratingDist} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="rating" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={30} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} fill={PALETTE.violet} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        ) : (
          <EmptyChartState title="Rating distribution" reason="No star-rating column detected in this dataset." />
        )}
      </div>

      {visibility.sourceBreakdown && (
        <ChartCard title="Feedback by source" full>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={sourceData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={3} strokeWidth={0}>
                {sourceData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <ChartLegend items={sourceData} />
        </ChartCard>
      )}

      {/* 5b. Rating vs. review mismatches — reviews that contradict themselves are shown
          here, on their own, instead of silently distorting the sentiment/rating charts above. */}
      {mismatchRows.length > 0 && (
        <>
          <SectionHeader icon={HelpCircle} title="Rating vs. review mismatches" />
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-sm text-amber-900">
            <p className="font-medium mb-1">{mismatchRows.length.toLocaleString()} review{mismatchRows.length === 1 ? "" : "s"} kept out of every chart above.</p>
            <p className="text-amber-800/90">
              These carry a star rating that contradicts what the text actually says (e.g. a 1-star rating next to a glowing comment). Rather than guessing which signal is right, they're excluded from the sentiment split, rating distribution, and issue themes, and reported here as "problem not specified by the customer — review reads positive despite the low rating" (or the reverse).
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <ChartCard title="Mismatch types">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={mismatchChartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 12, fill: "#475569" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                    {mismatchChartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Example flagged reviews">
              <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
                {mismatchRows.slice(0, 6).map((r, i) => (
                  <div key={i} className="bg-slate-50 rounded-lg p-2.5 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-slate-700">{"★".repeat(Math.round(r.rating))}{"☆".repeat(5 - Math.round(r.rating))} ({r.rating})</span>
                      <span className="text-slate-400">{r.source}</span>
                    </div>
                    <p className="text-slate-600 line-clamp-2">{r.text}</p>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>
        </>
      )}

      {/* 6. Categories, priority & severity */}
      <SectionHeader icon={LayoutDashboard} title="Categories & priority" />
      {visibility.categories ? (
        <>
          <ChartCard title="Issue volume by category" full>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={volumeData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 12, fill: "#475569" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                  {volumeData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <ChartCard title="Where to focus next (priority score)">
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={focusData} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 12, fill: "#475569" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} formatter={(v) => [`${v}/100`, "Priority"]} />
                  <Bar dataKey="score" radius={[0, 6, 6, 0]}>
                    {focusData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: PALETTE.rose }} /> Urgent</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: PALETTE.amber }} /> Moderate</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: PALETTE.teal }} /> Low</span>
              </div>
            </ChartCard>

            <ChartCard title="Priority matrix — frequency vs. severity">
              <ResponsiveContainer width="100%" height={230}>
                <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" dataKey="frequency" name="Frequency" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} label={{ value: "Frequency", position: "insideBottom", offset: -3, fontSize: 10, fill: "#94a3b8" }} />
                  <YAxis type="number" dataKey="severity" name="Severity" domain={[0, 5]} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={30} />
                  <ZAxis type="number" dataKey="count" range={[60, 400]} />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} formatter={(v, n) => [v, n]} labelFormatter={() => ""} content={<PriorityMatrixTooltip />} />
                  <Scatter data={priorityMatrix}>
                    {priorityMatrix.map((entry, i) => <Cell key={i} fill={urgencyColor(entry.priority)} fillOpacity={0.75} />)}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
              <p className="text-xs text-slate-400 mt-1 text-center">Top-right = high frequency, high severity — biggest bubbles need attention first.</p>
            </ChartCard>
          </div>

          {visibility.severity && (
            <ChartCard title="Severity distribution across all complaints" full>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={severityDist} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="severity" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {severityDist.map((entry, i) => <Cell key={i} fill={i >= 3 ? PALETTE.rose : i === 2 ? PALETTE.amber : PALETTE.teal} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </>
      ) : (
        <EmptyChartState title="Issue categories" reason="Not enough categorized volume yet — most reviews are uncategorized. Try 'Re-analyze uncategorized with AI' on the Issues tab first." full />
      )}

      {/* 7. Location */}
      {profile.hasLocation && (
        <>
          <SectionHeader icon={LayoutDashboard} title="By location" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <ChartCard title="Complaints by location">
              <ResponsiveContainer width="100%" height={Math.max(180, locationBreakdown.length * 34)}>
                <BarChart data={locationBreakdown} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="location" width={110} tick={{ fontSize: 12, fill: "#475569" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} formatter={(v, n, p) => [`${v} complaints (avg severity ${p.payload.avgSeverity.toFixed(1)}/5)`, p.payload.location]} />
                  <Bar dataKey="negative" radius={[0, 6, 6, 0]}>
                    {locationBreakdown.map((entry, i) => <Cell key={i} fill={urgencyColor(entry.negativeShare)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top issue by location">
              <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                {locationTopIssues.map((l, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 bg-slate-50 rounded-lg p-2.5 text-sm">
                    <span className="font-medium text-slate-800 truncate">{l.location}</span>
                    <span className="text-xs text-slate-500 text-right truncate">{l.topTheme || "—"} ({l.count}/{l.total})</span>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>
        </>
      )}

      {/* 8. Root cause analysis */}
      {rootCauses.length > 0 && <SectionHeader icon={AlertTriangle} title="Root cause analysis" />}
      {rootCauses.length > 0 && <RootCauseSection rootCauses={rootCauses} />}

      {/* 9. Customer voice */}
      {customerVoice.length > 0 && <SectionHeader icon={Quote} title="Customer voice" />}
      {customerVoice.length > 0 && <CustomerVoiceSection groups={customerVoice} />}

      {/* 10. Recommendations */}
      {recommendations.length > 0 && <SectionHeader icon={Sparkles} title="Recommendations" />}
      {recommendations.length > 0 && <RecommendationsSection recommendations={recommendations} />}
    </div>
  );
}

function PriorityMatrixTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-2.5 text-xs">
      <p className="font-medium text-slate-800 mb-1">{p.name}</p>
      <p className="text-slate-500">Frequency: {p.frequency}</p>
      <p className="text-slate-500">Avg severity: {p.severity.toFixed(1)}/5</p>
      <p className="text-slate-500">Priority score: {(p.priority * 100).toFixed(0)}/100</p>
    </div>
  );
}

function SectionHeader({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2 mt-2 mb-3">
      <Icon size={15} className="text-slate-400" />
      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{title}</h2>
      <div className="flex-1 h-px bg-slate-200" />
    </div>
  );
}

function BusinessRisksSection({ risks }) {
  return (
    <div className="flex flex-col gap-2.5 mb-4">
      {risks.map((r, i) => (
        <div key={i} className="flex items-start justify-between gap-3 bg-rose-50 border border-rose-200 border-l-4 border-l-rose-500 rounded-xl p-3.5">
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertTriangle size={16} className="text-rose-600 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-rose-900">{r.title}</p>
              <p className="text-xs text-rose-700 mt-0.5">{r.detail}</p>
            </div>
          </div>
          <ConfidenceBadge score={r.confidence} />
        </div>
      ))}
    </div>
  );
}

function CustomerVoiceSection({ groups }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {groups.map((g, i) => (
          <div key={i}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-slate-800">{g.theme}</p>
              <span className="text-xs text-slate-400">avg severity {g.avgSeverity.toFixed(1)}/5</span>
            </div>
            <div className="flex flex-col gap-2">
              {g.reviews.map((r, j) => (
                <div key={j} className="text-sm text-slate-700 bg-slate-50 rounded-lg border border-slate-100 p-2.5">
                  <p className="leading-relaxed">{r.text}</p>
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-400">
                    {r.rating ? <span>{"★".repeat(Math.round(r.rating))}{"☆".repeat(5 - Math.round(r.rating))}</span> : null}
                    <span>{r.date}</span><span>&middot;</span><span>{r.source}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Executive summary ----------
function ExecutiveSummaryCard({ bullets, aiSummaryStatus, onGenerateAi }) {
  if (!bullets || bullets.length === 0) return null;
  const showingAi = aiSummaryStatus?.done && aiSummaryStatus.bullets?.length > 0;
  const displayBullets = showingAi ? aiSummaryStatus.bullets : bullets;
  return (
    <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-xl p-5 mb-6 shadow-sm text-white">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles size={15} />
          <p className="text-sm font-semibold">Executive summary</p>
          <span className="text-[10px] font-normal text-indigo-200 bg-white/10 rounded px-1.5 py-0.5">
            {showingAi ? "Groq-written" : "auto-generated from live metrics"}
          </span>
        </div>
        {onGenerateAi && (
          <button
            onClick={onGenerateAi}
            disabled={aiSummaryStatus?.running}
            className="flex items-center gap-1.5 text-xs font-medium text-indigo-700 bg-white hover:bg-indigo-50 transition-colors px-2.5 py-1.5 rounded-md disabled:opacity-50"
          >
            {aiSummaryStatus?.running ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
            {aiSummaryStatus?.running ? "Asking Groq…" : showingAi ? "Regenerate with AI" : "Write with AI"}
          </button>
        )}
      </div>
      <ul className="flex flex-col gap-1.5">
        {displayBullets.map((b, i) => (
          <li key={i} className="text-sm text-indigo-50 leading-relaxed flex gap-2">
            <span className="text-indigo-300 mt-0.5">&bull;</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      {aiSummaryStatus?.error && (
        <p className="text-xs text-rose-100 mt-3">
          {aiSummaryStatus.error} (start it with <code className="bg-white/10 px-1 rounded">npm run server</code>, with your key in <code className="bg-white/10 px-1 rounded">server/.env</code>)
        </p>
      )}
    </div>
  );
}

// ---------- Insight confidence engine (UI) ----------
function ConfidenceBadge({ score }) {
  const tier = confidenceTier(score);
  const styleMap = {
    high: "bg-teal-50 text-teal-700 border-teal-200",
    medium: "bg-amber-50 text-amber-700 border-amber-200",
    low: "bg-slate-100 text-slate-500 border-slate-200",
  };
  const IconMap = { high: ShieldCheck, low: ShieldQuestion, medium: ShieldAlert };
  const Icon = IconMap[tier.tone];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium border rounded-full px-1.5 py-0.5 shrink-0 ${styleMap[tier.tone]}`}>
      <Icon size={10} /> {tier.label} ({Math.round(score * 100)}%)
    </span>
  );
}

function InsightsPanel({ insights }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Target size={15} className="text-slate-400" />
        <p className="text-sm font-medium text-slate-700">Key insights</p>
        <span className="text-xs text-slate-400">&mdash; only shown when the underlying data clears a confidence floor</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {insights.map((ins, i) => (
          <div key={i} className="flex items-start justify-between gap-3 text-sm bg-slate-50 rounded-lg p-3">
            <div className="min-w-0">
              <p className="font-medium text-slate-800">{ins.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{ins.detail}</p>
            </div>
            <ConfidenceBadge score={ins.confidence} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Intelligent empty states ----------
function EmptyChartState({ title, reason, full }) {
  return (
    <div className={`bg-white border border-dashed border-slate-200 rounded-xl p-6 text-center flex flex-col items-center justify-center ${full ? "mb-4" : ""}`} style={{ minHeight: 160 }}>
      <HelpCircle size={20} className="text-slate-300 mb-2" />
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="text-xs text-slate-400 mt-1 max-w-sm">{reason}</p>
    </div>
  );
}

// ---------- Root cause analysis ----------
function RootCauseSection({ rootCauses }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={15} className="text-slate-400" />
        <p className="text-sm font-medium text-slate-700">Root cause analysis</p>
      </div>
      <div className="flex flex-col gap-3">
        {rootCauses.map((rc, i) => (
          <div key={i} className="border border-slate-100 rounded-lg p-3">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <p className="text-sm font-medium text-slate-800">{rc.theme}</p>
              <ConfidenceBadge score={rc.confidence} />
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 mb-2">
              <span>{rc.frequency} mentions</span>
              <span>avg severity {rc.avgSeverity.toFixed(1)}/5</span>
            </div>
            {rc.representative && (
              <div className="text-sm text-slate-600 bg-slate-50 rounded-md p-2.5 flex gap-1.5">
                <Quote size={12} className="text-slate-400 mt-1 shrink-0" />
                <span className="leading-relaxed">{rc.representative.text}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Smart recommendations ----------
function RecommendationsSection({ recommendations }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={15} className="text-slate-400" />
        <p className="text-sm font-medium text-slate-700">Recommendations</p>
      </div>
      <div className="flex flex-col gap-2.5">
        {recommendations.map((r, i) => {
          const priorityStyle = { High: "bg-rose-50 text-rose-700 border-rose-200", Medium: "bg-amber-50 text-amber-700 border-amber-200", Low: "bg-teal-50 text-teal-700 border-teal-200" };
          return (
            <div key={i} className="border border-slate-100 rounded-lg p-3">
              <div className="flex items-center justify-between gap-3 mb-1.5 flex-wrap">
                <p className="text-sm font-medium text-slate-800">{r.theme}</p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-[10px] font-medium border rounded-full px-1.5 py-0.5 ${priorityStyle[r.priorityLabel]}`}>{r.priorityLabel} priority</span>
                  <ConfidenceBadge score={r.confidence} />
                </div>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">{r.recommendation}</p>
              <p className="text-xs text-slate-400 mt-1">Based on {r.evidence} mentions.</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KpiCard({ label, value, tooltip }) {
  const animated = useCountUp(typeof value === "number" ? value : parseFloat(value) || 0);
  const isNumeric = typeof value === "number";
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow" title={tooltip}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500">{label}</p>
        {tooltip && <Info size={12} className="text-slate-300" />}
      </div>
      <p className="text-2xl font-semibold text-slate-900 font-mono tabular-nums">
        {isNumeric ? Math.round(animated).toLocaleString() : value}
      </p>
    </div>
  );
}

function MetricCard({ label, value, accent, icon: Icon }) {
  const accentMap = { indigo: "bg-indigo-50 text-indigo-600", teal: "bg-teal-50 text-teal-600", rose: "bg-rose-50 text-rose-600", amber: "bg-amber-50 text-amber-600" };
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500">{label}</p>
        <span className={`w-6 h-6 rounded-md flex items-center justify-center ${accentMap[accent]}`}><Icon size={13} /></span>
      </div>
      <p className="text-2xl font-semibold text-slate-900 font-mono tabular-nums">{value}</p>
    </div>
  );
}
function ChartCard({ title, children, full }) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl p-4 shadow-sm ${full ? "mb-4" : ""}`}>
      <p className="text-sm font-medium text-slate-700 mb-3">{title}</p>
      {children}
    </div>
  );
}
function ChartLegend({ items }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 mt-1">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: it.color }} />
          {it.name} <span className="font-mono text-slate-400">({it.value})</span>
        </span>
      ))}
    </div>
  );
}
function StatCard({ label, value, icon: Icon, accent }) {
  const accentMap = { indigo: "bg-indigo-50 text-indigo-600", teal: "bg-teal-50 text-teal-600", rose: "bg-rose-50 text-rose-600", slate: "bg-slate-100 text-slate-600" };
  const animated = useCountUp(value);
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500">{label}</p>
        <span className={`w-6 h-6 rounded-md flex items-center justify-center ${accentMap[accent]}`}><Icon size={13} /></span>
      </div>
      <p className="text-2xl font-semibold text-slate-900 font-mono tabular-nums">{Math.round(animated)}</p>
    </div>
  );
}
function FilterPill({ active, onClick, label }) {
  return (
    <button onClick={onClick} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}>
      {label}
    </button>
  );
}
function WeightSlider({ label, value, onChange }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-600 mb-1"><span>{label}</span><span className="font-mono">{value}</span></div>
      <input type="range" min="0" max="100" step="5" value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-indigo-600" />
    </div>
  );
}
function IssueCard({ rank, cluster, isOpen, onToggle, status, onStatusChange, isPraise }) {
  const Icon = trendIcon(cluster.trendDelta);
  const color = trendColorClass(cluster.trendDelta, cluster.positive);
  const isFixed = status === "fixed";
  const isUncategorized = cluster.themeKey.startsWith("other_");
  const borderClass = isPraise ? "border-l-teal-500" : urgencyBorderClass(cluster.priority);
  const statusStyles = { new: "bg-slate-100 text-slate-600", investigating: "bg-amber-50 text-amber-700", fixed: "bg-teal-50 text-teal-700" };

  return (
    <div className={`bg-white border border-l-4 ${borderClass} border-slate-200 rounded-xl overflow-hidden transition-all hover:shadow-sm ${isFixed ? "opacity-60" : ""}`}>
      <div className="p-4 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {rank && <span className="shrink-0 w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-medium flex items-center justify-center">{rank}</span>}
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate flex items-center gap-1.5">
                {cluster.themeLabel}
                {isUncategorized && <span className="text-[10px] font-normal text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">auto-bucketed</span>}
              </p>
              <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                <span>{cluster.count} mentions</span>
                <span>avg severity {cluster.avgSeverity.toFixed(1)}/5</span>
                {!isPraise && <span className="font-mono">score {cluster.priority.toFixed(2)}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {cluster.trendAvailable !== false ? (
              <div className={`flex items-center gap-1 text-xs font-medium ${color}`}><Icon size={14} />{Math.abs(cluster.trendDelta)}</div>
            ) : (
              <div className="flex items-center gap-1 text-xs text-slate-400" title="Fewer than half of this theme's reviews have a usable, non-future timestamp">
                <HelpCircle size={13} /> insufficient data
              </div>
            )}
            {!isPraise && (
              <select value={status} onClick={(e) => e.stopPropagation()} onChange={(e) => onStatusChange(e.target.value)} className={`text-xs border-0 rounded-md px-2 py-1 font-medium ${statusStyles[status]}`}>
                <option value="new">New</option>
                <option value="investigating">Investigating</option>
                <option value="fixed">Fixed</option>
              </select>
            )}
            <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
          </div>
        </div>
      </div>
      {isOpen && (
        <div className="border-t border-slate-100 bg-slate-50 p-4">
          {!isPraise && (
            <div className="grid grid-cols-4 gap-2 mb-3 text-center">
              <MiniScore label="Freq" value={cluster.freqScore} />
              <MiniScore label="Trend" value={cluster.trendScore} />
              <MiniScore label="Severity" value={cluster.severityScore} />
              <MiniScore label="Recency" value={cluster.recencyScore} />
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2"><Quote size={12} /> Sample quotes ({Math.min(4, cluster.items.length)} of {cluster.count})</div>
          <div className="flex flex-col gap-2">
            {cluster.items.slice(0, 4).map((r) => (
              <div key={r.id} className="text-sm text-slate-700 bg-white rounded-lg border border-slate-100 p-2.5">
                <p className="leading-relaxed">{r.text}</p>
                <p className="text-xs text-slate-400 mt-1">{r.date} &middot; {r.source}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
function MiniScore({ label, value }) {
  return (
    <div className="bg-white rounded-md py-1.5 border border-slate-100">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className="text-xs font-mono font-medium text-slate-700">{value.toFixed(2)}</p>
    </div>
  );
}
