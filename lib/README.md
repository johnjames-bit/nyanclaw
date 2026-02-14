# lib/ — void nyan Module Architecture

## Philosophy: Kernel + Satellites

Inspired by **vegapunk model** — modular satellites orbiting a central kernel.

**Goal:** Minimize token bleed. Only load what's needed.

---

## Kernel (Always Loaded)

| File | Purpose |
|------|---------|
| `void-pipeline.js` | O(1) orchestrator — routes queries to correct satellite |
| `context-router.js` | Expert routing by keyword — loads only relevant modules |
| `index.js` | Unified entry point |

---

## Satellites (On-Demand)

| File | Trigger Keywords | Purpose |
|------|------------------|---------|
| `nyan-api.js` | Ψ-EMA, atomic, nyan | Nyan API queries |
| `psi-ema.js` | Ψ-EMA, theta, z-score | Ψ-EMA calculations |
| `financial-physics.js` | fp, physics, momentum | Financial physics |
| `stock-fetcher.js` | stock, price, CPO | Stock/commodity prices |
| `web-search.js` | search, web | Web search |
| `memory-manager.js` | memory, remember | Memory operations |
| `mode-registry.js` | mode, detect | Mode detection |

---

## Utilities

| File | Purpose |
|------|---------|
| `env-detect.js` | Environment detection |
| `startup-tui.js` | Terminal startup UI |
| `llm-client.js` | LLM client wrapper |

---

## Token Strategy

- **Context Router:** ~4KB (keyword matching)
- **Satellite:** Only load when triggered
- **Memory:** Single-pass, no redundant context
- **Result:** ~2KB per query vs ~374KB monolithic

---

## Adding a Satellite

1. Create `lib/your-satellite.js`
2. Export your function
3. Add trigger keywords to `context-router.js`
4. That's it — kernel handles loading

---

## Testing

```bash
node lib/startup-tui.js
```

---

_φ² Genesis — O(1) with parallel cores_
