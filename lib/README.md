# lib/ — MY OPENCLAW Module Architecture

## Philosophy: Kernel + Satellites

Inspired by **vegapunk model** — modular satellites orbiting a central kernel.

**Goal:** Minimize token bleed. Only load what's needed per query.

---

## Kernel (Always Loaded)

| File | Purpose |
|------|---------|
| `void-pipeline.js` | O(n) single-pass orchestrator — DETECT, GATE, CONTEXT, CALL, SIGN |
| `context-router.js` | MoE-inspired expert routing — loads relevant identity/philosophy files |
| `llm-client.js` | Multi-provider LLM client with dynamic fallback chain |
| `index.js` | Unified barrel export |

---

## Satellites (On-Demand)

| File | Trigger | Purpose |
|------|---------|---------|
| `nyan-api.js` | atomic, nyan queries | nyanbook.io API client |
| `psi-ema.js` | psi-ema, theta, z-score | Financial analysis + documentation |
| `financial-physics.js` | fp, physics, momentum | Financial physics calculations |
| `stock-fetcher.js` | stock, price, CPO | Stock/commodity data |
| `forex-fetcher.js` | forex, currency | Forex data |
| `legal-analysis.js` | legal, contract | Legal analysis tools |
| `web-search.js` | search, web | Web search integration |
| `data-package.js` | data, package | Data packaging |
| `code-context.js` | code, context | Code analysis |
| `memory-manager.js` | remember, memory | Session memory (shared across modes/providers) |
| `mode-registry.js` | mode detection | prescribe/scribe/describe routing |

---

## Infrastructure

| File | Purpose |
|------|---------|
| `env-detect.js` | Startup probe: Ollama, API keys, runtime detection, dynamic chain building |
| `startup-tui.js` | Colored terminal banner with provider status and setup guidance |
| `preflight-router.js` | Request preflight routing |
| `model-fallback.js` | Legacy CLI model fallback tool |

---

## Hooks

| File | Purpose |
|------|---------|
| `hooks/whatsapp-cc.js` | WhatsApp integration via Twilio |

---

## Token Strategy

- **Kernel:** ~4KB (pipeline + context router + LLM client)
- **Satellite:** Only loaded when triggered by keyword match
- **Memory:** Single-pass, no redundant context injection
- **Result:** ~2KB per query vs ~374KB monolithic (old architecture)

---

## Adding a Satellite

1. Create `lib/your-satellite.js`
2. Export your function
3. Add trigger keywords to `context-router.js` TRIGGERS
4. Add files to `context-router.js` EXPERTS if needed
5. Kernel handles the rest — pipeline routes automatically

---

## Dynamic Fallback Chain

Built at startup by `env-detect.js`. Priority: **Cloud first** (fast, smart), then **Ollama last** as local substrate (safety net when cloud fails).

```
minimax -> groq -> claude -> openai -> ollama
  ^         ^        ^         ^         ^
  |         |        |         |         |
cloud    cloud    cloud     cloud     local
(primary  (if key  (if key   (if key  (substrate
 if set)   set)     set)      set)    last resort)
```

---

_φ² Genesis — O(n) with parallel satellites_
