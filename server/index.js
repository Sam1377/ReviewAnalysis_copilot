import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
app.use(cors());
app.use(express.json({ limit: "8mb" }));

// Groq (groq.com) — fast open-model inference, genuinely free rate-limited
// tier. OpenAI-compatible chat completions API, same shape we'd use for
// xAI or OpenAI: choices[0].message.content.
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const KNOWN_THEMES = [
  "App crashes / bugs", "Delivery / shipping delays", "Customer support responsiveness",
  "Wrong / inaccurate order or item", "Product quality mismatch", "Returns & refund process issues",
  "Pricing, discounts & value concerns", "Payment / checkout failures",
  "Praise for UI / redesign / ease of use", "Performance / app speed issues",
  "Login / account / authentication issues", "Missing items from order",
  "Positive feedback (no issue detected)",
];

const CHUNK_SIZE = 40;

// Shared helper: calls Groq with a prompt, returns the raw text of the reply.
async function callGroq(prompt, maxTokens) {
  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await response.json();
  if (data.error) {
    throw new Error(typeof data.error === "string" ? data.error : data.error.message || "Groq API error");
  }
  return (data.choices?.[0]?.message?.content || "").trim();
}

app.post("/api/classify-uncategorized", async (req, res) => {
  const { texts } = req.body || {};

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({
      error: "GROQ_API_KEY is not set. Add it to server/.env and restart the server (npm run server).",
    });
  }
  if (!Array.isArray(texts) || texts.length === 0) {
    return res.json({ results: [] });
  }

  const chunks = [];
  for (let i = 0; i < texts.length; i += CHUNK_SIZE) chunks.push(texts.slice(i, i + CHUNK_SIZE));

  const allResults = [];

  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c];
    const offset = c * CHUNK_SIZE;
    const prompt = `You are classifying app/product reviews into themes for a product manager dashboard.

Known themes: ${KNOWN_THEMES.join(", ")}.

First judge the review's overall sentiment. If it is clearly positive or expresses no real problem (e.g. "great app", "product matched the description, overall satisfied"), you MUST classify it as "Positive feedback (no issue detected)" with positive=true — never force a positive review into a complaint theme just because a word coincidentally overlaps with one (e.g. "quality" appearing in a compliment is not a quality complaint).

Only if the review clearly expresses a problem, assign the closest known complaint theme (use the exact label text above), or if it genuinely does not fit any of them, propose a short new theme label (3-6 words, title case).
Also give a severity score from 1-5 (5 = blocks core usage or costs the user money, 1 = minor annoyance; positive reviews should be severity 1) and whether the review is positive overall (true/false).

Return ONLY a JSON array, no other text, no markdown fences, in exactly this shape:
[{"index":0,"themeLabel":"...","severity":3,"positive":false}]

Reviews:
${chunk.map((t, i) => `${i}. ${t}`).join("\n")}`;

    try {
      const textBlock = await callGroq(prompt, 2000);
      const cleaned = textBlock.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      parsed.forEach((p) => {
        if (typeof p.index === "number" && chunk[p.index] !== undefined) {
          allResults.push({ ...p, index: p.index + offset });
        }
      });
    } catch (e) {
      console.error("Chunk classification failed:", e.message);
      // that chunk's items just stay uncategorized rather than crashing the whole request
    }
  }

  res.json({ results: allResults, totalRequested: texts.length });
});

// Turns the structured KPI/insight/recommendation data the frontend already
// computed (deterministically, from the actual dataset) into a few sentences
// of exec-ready prose. The model never sees raw review text here — only
// aggregated numbers — so this stays cheap and fast even on large datasets.
app.post("/api/executive-summary", async (req, res) => {
  const { profile, kpis, insights, recommendations, topIssues } = req.body || {};

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({
      error: "GROQ_API_KEY is not set. Add it to server/.env and restart the server (npm run server).",
    });
  }
  if (!profile) {
    return res.status(400).json({ error: "Missing profile data." });
  }

  const prompt = `You are a senior product analyst writing an executive summary for a product review dashboard.

Here is the structured data already computed from the dataset (all numbers are real, not estimates):

Dataset profile: ${JSON.stringify(profile)}
KPIs: ${JSON.stringify(kpis)}
Rule-based insights already detected: ${JSON.stringify(insights)}
Recommendations already generated: ${JSON.stringify(recommendations)}
Top issue themes: ${JSON.stringify(topIssues)}

Write 4-6 short bullet points for a product leadership audience covering: key findings, major risks, emerging trends, positive improvements (if any), and the single most important recommended focus area.
Every claim must be traceable to a number given above — do not invent statistics or mention themes not listed.
Return ONLY a JSON array of strings, no markdown fences, no other text, in exactly this shape:
["First bullet.", "Second bullet."]`;

  try {
    const textBlock = await callGroq(prompt, 800);
    const cleaned = textBlock.replace(/```json|```/g, "").trim();
    const bullets = JSON.parse(cleaned);
    res.json({ bullets });
  } catch (e) {
    console.error("Executive summary generation failed:", e.message);
    res.status(500).json({ error: "Failed to generate summary: " + e.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Classification server running on http://localhost:${PORT}`);
  if (!process.env.GROQ_API_KEY) {
    console.warn("Warning: GROQ_API_KEY not set — AI endpoints will return an error until you add it to server/.env");
  }
});
