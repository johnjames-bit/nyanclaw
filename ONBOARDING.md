# ONBOARDING.md — MY OPENCLAW Setup

## First Hatch Flow

### 1. Boot

```
╔══════════════════════════════════════════╗
║       MY OPENCLAW  hybrid ai workspace  ║
╚══════════════════════════════════════════╝

  ENVIRONMENT
  runtime:  LOCAL (your machine)
  nyan-api: [ok] connected

  LLM PROVIDERS
  [ok] minimax (MINIMAX_API_KEY)
  [--] claude  set ANTHROPIC_API_KEY to enable
  [--] groq    set GROQ_API_KEY to enable
  [--] openai  set OPENAI_API_KEY to enable
  [ok] ollama  localhost:11434
       models: qwen2.5-coder:7b

  FALLBACK CHAIN
  minimax -> ollama

  MODES
  prescribe  build/kernel  (privileged)
  scribe     create/docs   (open)
  describe   chat/general  (open)
```

### 2. Check Environment

Start the server:
```bash
node index.js
```

The startup TUI probes:
- Cloud providers — MiniMax, Groq, Claude, OpenAI (tried first, in order)
- Ollama (localhost:11434) — local substrate (last resort when cloud fails)
- Nyan API — atomic brain (nyanbook.io)
- Runtime — local, cloud deploy, or replit-dev

### 3. Set Up Secrets

```bash
# Required
export NYAN_API_TOKEN=your_token

# Primary cloud providers (tried first)
export MINIMAX_API_KEY=your_key
export GROQ_API_KEY=your_key
export ANTHROPIC_API_KEY=your_key
```

### 4. Start Ollama (Substrate)

```bash
ollama serve
ollama pull qwen2.5-coder:7b
```

Ollama is the substrate — always last in the chain, holding the ground when cloud fails. No API costs, runs locally, never disappears.

### 5. Connect Channels

```bash
# WhatsApp (via Twilio)
# Configure in lib/hooks/whatsapp-cc.js
```

### 6. First Interaction

Send a message via `/api/chat`. The system will:
1. Detect mode (prescribe/scribe/describe)
2. Check privilege gating (prescribe requires authorized caller)
3. Inject relevant expert context (MoE routing)
4. Route through dynamic fallback chain
5. Return response with personality stamp

---

## Three Modes

| Mode | Purpose | Access |
|------|---------|--------|
| prescribe | build/kernel/code | Privileged only |
| scribe | create/docs/legal | Open |
| describe | chat/general | Open |

---

## Identity Shortcuts

Some queries bypass the LLM entirely:
- `nyan~` or `who are you` → instant identity response
- `psi-ema` → documentation response (no LLM needed)

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "No providers available" | Set a cloud API key or start Ollama: `ollama serve` |
| "Token missing" | Set NYAN_API_TOKEN in environment |
| Ollama not found | `ollama serve` then restart server (substrate backup) |
| Wrong model priority | Check `/api/env` — chain should show cloud providers first, ollama last |
| Replit-dev warning | Normal — deploy to own infra for production |

---

_Last updated: 2026-02-14 (synthesis)_
