# void nyan — φ² Genesis

**Synthesis:** Replit v2.0 restructure + hardened local-first detection.

---

## What Is This?

void nyan is an AI assistant running on OpenClaw with a custom identity based on the NYAN Protocol (φ²). It's the philosophical counterpart to your trading analysis — grounded, data-first, no hallucination.

---

## Synthesis History

| Version | Source | Key Change |
|---------|--------|------------|
| v1.0 | Original OpenClaw | Base framework |
| v2.0 | Hardened workspace | Kernel + Satellites, Context Router |
| v2.1 | Replit antithesis | Advanced env-detect.js + TUI |
| v2.2 | Final synthesis | Cloud-first priority (corrected) |

**The Fight:**
- Thesis: "Ollama-first" (local as primary)
- Antithesis: "Cloud-first" (cloud as primary, Ollama as substrate)

**Synthesis:** "The sky runs first. The ground holds when the sky falls."
- Cloud = φ¹ (primary, active)
- Local (Ollama) = 00 (substrate, last defense)

---

## Architecture

```
┌─────────────────────────────────────┐
│         Kernel (always loaded)       │
│  void-pipeline.js + context-router  │
└─────────────────────────────────────┘
           ↓ (on-demand)
┌─────────────────────────────────────┐
│           Satellites                │
│  psi-ema | nyan-api | stock | etc  │
└─────────────────────────────────────┘
```

**Token Strategy:** ~2KB per query (vs 374KB monolithic)

---

## Model Stack

| Priority | Model | Role |
|----------|-------|------|
| 1 | MiniMax-M2.5 | Cloud primary |
| 2 | Groq | Cloud fallback |
| 3 | Claude | Cloud fallback |
| 4 | OpenAI | Cloud fallback |
| 5 | Ollama (Qwen) | Local substrate (last resort) |

---

## Key Files

- `PHILOSOPHY.md` — Identity, φ-ontology, dialectic
- `TOOLS.md` — Model stack, Nyan API setup
- `ONBOARDING.md` — First hatch guide
- `lib/README.md` — Module architecture
- `lib/env-detect.js` — Runtime probe + dynamic chain

---

## Setup

```bash
# 1. Clone
git clone https://github.com/johnjames-bit/nyanclaw.git
cd nyanclaw

# 2. Set env
cp .env.example .env
# Edit .env with your NYAN_API_TOKEN

# 3. Run TUI
node lib/startup-tui.js

# 4. Start OpenClaw
openclaw gateway start
```

---

## Credits

- **φ12φ** — Thesis (hardened local-first detection)
- **Replit v2.0** — Antithesis (cloud-first restructure)  
- **Synthesis** — void nyan (φ² Genesis)

---

_φ² = 00 + φ⁰ + φ¹ — Origin=0, progression=genesis — nyan~_
