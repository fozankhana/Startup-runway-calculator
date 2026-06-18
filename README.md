# Startup Runway Calculator

A powerful, real-time financial runway calculator for startup founders. Instantly visualize when your money runs out across three growth scenarios, with AI-powered analysis that auto-fills your numbers and gives strategic recommendations grounded in live market data.

---

## Features

### Financial Modeling
- **3-scenario runway projection** — Pessimistic (0% growth), Base (5%/mo), Optimistic (15%/mo)
- **Real-time chart** — Interactive line chart showing cash balance over time with a $0 reference line
- **Exact zero-crossing** — Linear interpolation gives you the precise day you run out, not just the month
- **Burn trend modes** — Model flat, slow (+1%/mo), or aggressive (+3%/mo) burn growth
- **Metric cards** — Per-scenario: runway months, runout date, net burn, total capital deployed

### AI Auto-Fill
Paste a plain-English description of your startup and the AI extracts your cash, burn, and revenue automatically.

> *"We raised $1.2M seed, spending $90K/month on a team of 6, currently at $15K MRR"*

Extracted values are shown with a confidence rating (high / medium / low) and can be applied to the calculator in one click.

### Cloud AI (5 Providers)
Connect any of the major AI APIs — the app stores your keys locally in the browser, never on a server:

| Provider | Models |
|---|---|
| **Anthropic** | Claude 3.5 Sonnet, Claude 3 Haiku |
| **OpenAI** | GPT-4o, GPT-4o mini |
| **Google Gemini** | Gemini 1.5 Pro, Gemini 1.5 Flash |
| **Groq** | LLaMA 3.1 70B, Mixtral 8x7B |
| **OpenRouter** | Access to 100+ models |

**Auto-fallback** — Toggle on to automatically switch to a local model if your cloud API hits a rate limit or runs out of credits.

### Local AI (Runs in Your Browser)
No API key needed. Models download once and run entirely on your GPU via **WebGPU** — no installation, no terminal, no Ollama required.

- One-click download for 10+ models directly in the browser
- Models are cached after first download (loads in ~30s on return visits)
- VRAM compatibility badges based on your detected GPU
- Auto-recommends the best model for your hardware

**Supported models (browser-native):**

| Model | Size | VRAM | Tool Calling |
|---|---|---|---|
| Llama 3.2 1B | 0.8 GB | 1.3 GB | ✓ |
| Gemma 2 2B | 1.5 GB | 1.6 GB | — |
| Llama 3.2 3B | 1.9 GB | 2 GB | ✓ |
| Qwen 2.5 3B | 2 GB | 2 GB | ✓ |
| DeepSeek R1 7B | 4.5 GB | 4.7 GB | ✓ |
| **Qwen 2.5 7B** *(recommended for 6GB+)* | 4.7 GB | 4.7 GB | ✓ |
| Llama 3.1 8B | 5 GB | 4.9 GB | ✓ |
| DeepSeek R1 14B | 9 GB | 9 GB | ✓ |
| Qwen 2.5 14B | 9 GB | 9 GB | ✓ |

### Agentic Analysis
The AI doesn't just summarize your numbers — it **researches live market data** before advising:

1. Searches Hacker News for current VC funding trends and market conditions
2. Pulls curated 2024–2025 startup benchmarks (burn multiples, growth rates, churn, fundraising norms)
3. Synthesizes findings into 3 specific, numbered, actionable recommendations grounded in what it found

---

## Tech Stack

- **Vite 6** + **React 18** + **TypeScript**
- **Recharts v2** — composable line charts
- **Tailwind CSS v4** — via `@tailwindcss/vite` plugin
- **@mlc-ai/web-llm** — browser-native LLM inference via WebGPU
- **Anthropic SDK** — with `dangerouslyAllowBrowser` for client-side usage
- **HN Algolia API** — free, no key required, for live market data search

---

## Getting Started

### Prerequisites
- Node.js 18+
- A modern browser (Chrome or Edge 113+ for Local AI / WebGPU)

### Install & Run

```bash
git clone https://github.com/fozankhana/startup-runway-calculator.git
cd startup-runway-calculator
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### Build for Production

```bash
npm run build
npm run preview
```

---

## Usage

### Basic Calculator
1. Enter your **Starting Cash Balance** (e.g. $500,000)
2. Enter your **Monthly Burn Rate** (e.g. $80,000)
3. Enter your **Monthly Revenue / MRR** (e.g. $20,000)
4. The chart and metric cards update instantly

Use the **Burn Trend** selector to model whether your expenses will grow over time.

Toggle scenarios on/off using the colored chips above the chart.

### AI Auto-Fill (Cloud Mode)
1. Switch to **Cloud** tab in the AI Assistant panel
2. Select a provider and paste your API key
3. Describe your startup in plain English
4. Click **Extract** → review the extracted numbers → click **Apply**

Get a free API key:
- Anthropic: [console.anthropic.com](https://console.anthropic.com)
- OpenAI: [platform.openai.com](https://platform.openai.com)
- Google: [aistudio.google.com](https://aistudio.google.com)
- Groq: [console.groq.com](https://console.groq.com) *(free tier available)*
- OpenRouter: [openrouter.ai](https://openrouter.ai) *(free models available)*

### Local AI (No API Key)
1. Switch to **Local** tab in the AI Assistant panel
2. Click **Detect GPU** to see your hardware specs
3. Click **Browse & download models** to open the model catalog
4. Click **↓ Download** on any model with the `browser` badge
5. Wait for the download to complete (progress shown in real time)
6. Use **Extract with Local AI** or **Agent Analysis** — everything runs on your device

> **Note:** WebGPU is required. Supported on Chrome 113+, Edge 113+, and desktop platforms. Firefox requires enabling experimental flags.

---

## Project Structure

```
src/
├── App.tsx                    # Root layout, state wiring
├── types/index.ts             # Shared TypeScript interfaces
├── hooks/
│   └── useRunwayModel.ts      # useMemo wrapper running all 3 scenarios
├── lib/
│   ├── financialModel.ts      # Month-by-month simulation + zero-crossing interpolation
│   ├── scenarios.ts           # Scenario configs (growth rates, colors)
│   ├── formatters.ts          # Currency and date formatters
│   ├── universalAI.ts         # Multi-provider cloud AI (Anthropic, OpenAI, Gemini, Groq, OpenRouter)
│   ├── ollama.ts              # Ollama local API (used for cloud auto-fallback)
│   ├── ollamaAgent.ts         # Agentic tool-calling loop (Ollama)
│   ├── ollamaModels.ts        # Model catalog with VRAM requirements + WebLLM IDs
│   ├── webllmEngine.ts        # Browser-native LLM via @mlc-ai/web-llm + WebGPU
│   ├── startupData.ts         # Agent tool definitions, benchmarks, HN search
│   ├── systemDetect.ts        # GPU/VRAM detection via WebGL, RAM via navigator API
│   └── claude.ts              # Shared extraction types
└── components/
    ├── AIPanel.tsx            # Full AI assistant UI (cloud + local modes)
    ├── RunwayChart.tsx        # Recharts line chart with custom tooltip
    ├── MetricCard.tsx         # Per-scenario stats card
    ├── MetricsCards.tsx       # Row of 3 MetricCards
    ├── InputPanel.tsx         # Left sidebar with all inputs
    ├── InputField.tsx         # Labeled number input component
    └── ScenarioToggle.tsx     # Pill chips to show/hide chart lines
```

---

## Financial Model

The simulation runs month-by-month for up to 120 months:

```
revenue(n) = startingRevenue × (1 + revenueGrowthRate)^n
burn(n)    = startingBurn × (1 + burnGrowthRate)^n
balance(n) = balance(n-1) + revenue(n) - burn(n)
```

When the balance crosses zero, linear interpolation gives the exact fractional month:

```
runwayMonths = (n - 1) + prev_balance / (prev_balance - balance(n))
```

If the balance never reaches zero within 120 months, the scenario is marked as **cash flow positive**.

---

## GPU Detection

On the Local tab, the app reads your GPU via `WEBGL_debug_renderer_info` and looks it up in a built-in VRAM table covering:
- NVIDIA GTX 10xx / 16xx / RTX 20xx / 30xx / 40xx series
- AMD RX 6000 / 7000 series
- Intel Arc A-series
- Apple M1 / M2 / M3 (all variants)

Based on detected VRAM, the app recommends the most capable model that fits in GPU memory and badges each model card as:
- **✓ GPU fits** — runs entirely on your GPU
- **⚠ Partial GPU** — may spill to system RAM
- **✗ CPU heavy** — will be very slow without sufficient VRAM

---

## Privacy

- All API keys are stored in **your browser's localStorage only** — never sent to any server other than the chosen AI provider
- Local AI mode runs **100% on your device** — no data leaves your machine
- No tracking, no analytics, no backend

---

## License

No license — all rights reserved.
