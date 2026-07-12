
# Review Intelligence Dashboard

**An AI-powered analytics platform that turns raw, messy customer review data into structured, actionable product insights — without the cost of running every single review through an LLM.**

![Status](https://img.shields.io/badge/status-active-success)
![React](https://img.shields.io/badge/frontend-React%20%2B%20Vite-blue)
![Node](https://img.shields.io/badge/backend-Express-green)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## 📌 Problem Statement

Product and support teams collect thousands of reviews across app stores, support tickets, and surveys, but turning that raw text into a real understanding of *what's actually wrong with the product* is a hard, expensive problem:

- **Formats lie.** A file named `.csv` is frequently a renamed `.xlsx` export from a BI tool. Naive parsers that trust the file extension silently produce garbage.
- **Keyword matching doesn't scale.** Hand-written keyword dictionaries work at first, but hit a hard ceiling — once you're past ~25 categories, phrase collisions (e.g. "still waiting" meaning *delivery delay* vs. *refund delay*) make the dictionary unmanageable.
- **Sending every review to an LLM is expensive and slow.** Classifying 10,000+ reviews one-by-one through a chat-completion API doesn't scale economically or in latency.
- **New, unforeseen issues get missed.** A rigid taxonomy can only ever detect the categories someone thought to define in advance — it can't surface a brand-new emerging complaint no one has labeled yet.
- **Leadership doesn't want raw data — they want a summary.** Executives need a trustworthy, hallucination-free narrative grounded in real numbers, not an LLM's guess.

## ✅ What This Project Solves

This dashboard ingests messy, real-world review exports and produces a categorized, severity-scored, sentiment-aware issue taxonomy — discovering *new* issue categories as they emerge in the data, and only calling an LLM where it genuinely adds value.

### 1. Format-Proof File Ingestion (`fileIngest.js`)
Instead of trusting the file extension, the ingestion layer reads the **actual file bytes** (ZIP/OOXML magic numbers, OLE2 signatures) to correctly detect `.xlsx`, `.xls`, `.csv`, `.tsv`, `.json`, and image files — with graceful fallbacks at every step so a malformed file produces a warning, never a crash.

### 2. Hybrid, Cost-Efficient Classification Pipeline (`hybridClassifier.js`)
A 5-layer pipeline designed so that **LLM cost scales with the number of distinct issues, not the number of reviews**:

| Layer | Method | Purpose |
|---|---|---|
| 1 | Keyword dictionary | Fast, free, ~96% precision on known categories |
| 2 | Local semantic embeddings (MiniLM via `@xenova/transformers`, runs 100% client-side) | Catches paraphrases/synonyms the keyword layer misses |
| 3 | Unsupervised greedy clustering | Groups leftover reviews that don't match anything — surfaces *emerging* issues |
| 4 | **One LLM call per discovered cluster** (not per review) | Labels new issue clusters cheaply, however many thousand reviews land in them |
| 5 | Honest fallback | True singletons with no supporting evidence stay uncategorized rather than being force-fit |

### 3. Semantic Issue Taxonomy (`semanticTaxonomy.js`)
A growing, self-expanding taxonomy built on cosine-similarity nearest-centroid matching, with a **three-tier confidence system** (high-confidence direct match / borderline flagged match / routed to discovery) — so every classification carries an honest confidence score instead of a blind boolean match.

### 4. Grounded Executive Summaries
The backend (`index.js`, powered by Groq's `llama-3.3-70b-versatile`) generates leadership-ready bullet-point summaries — but the model **never sees raw review text**, only the deterministically-computed KPIs, insights, and top issues the frontend already calculated. This keeps summaries fast, cheap, and traceable to real numbers instead of invented statistics.

### 5. Resilient by Design
Every layer degrades gracefully instead of breaking:
- Embedding model fails to load (offline/blocked CDN)? → falls back to keyword-only classification.
- A cluster-labeling API call fails? → that cluster stays unlabeled, the rest of the app keeps working.
- A file can't be parsed as a spreadsheet? → falls back to plain-text parsing before giving up.

---

## 🧠 Why This Approach Matters (for reviewers)

This project isn't "call an LLM on everything and hope." It's an example of **designing for cost, scale, and trustworthiness simultaneously**:
- Deterministic, explainable logic is used wherever possible; the LLM is reserved for the two places it's uniquely useful — labeling emergent clusters and writing prose summaries of pre-computed facts.
- The system is honest about uncertainty (confidence tiers, "stays uncategorized" fallback) instead of always producing a confident-looking but potentially wrong answer.
- Privacy-conscious: embeddings and OCR run entirely client-side; only aggregated data or short review batches ever leave the browser.

---

## 🛠️ Tech Stack

**Frontend:** React 18, Vite, Tailwind CSS, Recharts, Lucide Icons
**Client-side ML:** `@xenova/transformers` (ONNX + WASM, MiniLM-L6-v2 embeddings), Tesseract.js (OCR)
**File Parsing:** PapaParse, SheetJS (xlsx)
**Backend:** Node.js, Express, Groq API (OpenAI-compatible inference)
**Tooling:** PostCSS, Autoprefixer, Concurrently

---

## 🚀 Getting Started

```bash
# Clone the repo
git clone https://github.com/<your-username>/review-copilot-dashboard.git
cd review-copilot-dashboard

# Install dependencies
npm install

# Add your Groq API key
echo "GROQ_API_KEY=your_key_here" > server/.env

# Run frontend + backend together
npm run dev:full
```

| Script | Description |
|---|---|
| `npm run dev` | Starts the Vite frontend only |
| `npm run server` | Starts the Express classification backend only |
| `npm run dev:full` | Runs both concurrently |
| `npm run build` | Production build |

---

## 📂 Project Structure

```
├── src/
│   ├── fileIngest.js         # Byte-level file format detection & parsing
│   ├── embeddingEngine.js     # Client-side embedding model (MiniLM)
│   ├── semanticTaxonomy.js    # Cluster registry, similarity matching, discovery
│   ├── hybridClassifier.js    # 5-layer classification pipeline orchestration
│   ├── main.jsx                # App entry point
├── server/
│   └── index.js                # Express API: classification, summaries, cluster labeling
├── index.html
├── vite.config.js
├── tailwind.config.js
└── package.json
```

---

## 📸 Screenshots

> _Add product screenshots below to showcase the dashboard UI, charts, and insights panel._
> 
<img width="1470" height="835" alt="Screenshot 2026-07-12 at 10 21 10 PM" src="https://github.com/user-attachments/assets/2468c371-0d78-4667-8018-bbc9e5b2d6de" />
<img width="1470" height="835" alt="Screenshot 2026-07-12 at 10 21 20 PM" src="https://github.com/user-attachments/assets/85cc2f8a-bd7d-49aa-9023-ce1a60721104" />
<img width="1470" height="835" alt="Screenshot 2026-07-12 at 10 21 27 PM" src="https://github.com/user-attachments/assets/c128b95c-0285-4b6e-aaea-5bca9cf03f5d" />
<img width="1470" height="835" alt="Screenshot 2026-07-12 at 10 21 38 PM" src="https://github.com/user-attachments/assets/876590b3-34a9-40e3-97a1-d0164f49552e" />
<img width="1470" height="836" alt="Screenshot 2026-07-12 at 10 22 42 PM" src="https://github.com/user-attachments/assets/53076a7e-a49e-47be-8ae5-20c9ee30731a" />
<img width="1253" height="834" alt="Screenshot 2026-07-12 at 10 22 30 PM" src="https://github.com/user-attachments/assets/3de21544-5de1-45fa-a798-33ddafaa4d87" />
<img width="1470" height="833" alt="Screenshot 2026-07-12 at 10 22 17 PM" src="https://github.com/user-attachments/assets/f40ce1f8-e246-45c7-9573-161ddc06f800" />
<img width="1470" height="834" alt="Screenshot 2026-07-12 at 10 22 08 PM" src="https://github.com/user-attachments/assets/f7e1a3f8-4a27-4331-80a6-bd674f44ba5e" />
<img width="1469" height="833" alt="Screenshot 2026-07-12 at 10 22 52 PM" src="https://github.com/user-attachments/assets/9ceee979-843f-4d11-b771-09b12fd9d32c" />


---

## 🔭 Future Improvements

- Persist the growing taxonomy to a database instead of an in-memory session cache
- Add trend-over-time views per issue cluster
- Support additional LLM providers (OpenAI, Anthropic, xAI) behind the same interface
- Multi-language review support

---

## 👤 Author

Built by **Sahil Ballewar** — [LinkedIn](https://www.linkedin.com/in/sahil-ballewar-a888a632a/) · [Portfolio](https://sahil-portfolio-topaz.vercel.app) · [Email](sahil.magfirm@gmail.com)

If you're a recruiter or product manager reviewing this project: happy to walk through the architecture decisions, tradeoffs, and design rationale behind the hybrid classification pipeline in more depth.

---

