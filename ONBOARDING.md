# ONBOARDING.md — void nyan Setup

## First Hatch Flow

### 1. OpenClaw Boot
```
╔════════════════════════════════════════╗
║     VOID NYAN — φ² Genesis             ║
╚════════════════════════════════════════╝

  ✓ Nyan API Token — configured
  ✓ Node — v24.13.0
  ✓ Platform — darwin
  ✓ WhatsApp — linked

  Ready for φ² progression...
```

### 2. Check Environment

Run locally:
```bash
node lib/startup-tui.js
```

This probes:
- Ollama (localhost:11434) — local substrate
- MiniMax API — cloud primary
- Nyan API — atomic brain

### 3. Set Up Secrets

```bash
# Create .env file
cp .env.example .env
# Edit with your keys:
# - NYAN_API_TOKEN
# - MINIMAX_API_KEY (optional)
```

### 4. Connect Channels

```bash
# WhatsApp
openclaw channels login whatsapp
```

### 5. First Interaction

Send a message on your connected channel. The system will:
1. Detect mode (identity/stock/psi-ema/general)
2. Route to appropriate satellite
3. Return response with φ² signature

---

## φ² Progression

| Stage | Command | Meaning |
|-------|---------|---------|
| Hatch | `nyan~` | Identity check |
| Grow | Any query | Learn your preferences |
| Bond | Memory updates | Remember context |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Token missing" | Check .env has NYAN_API_TOKEN |
| Ollama not found | Run `ollama serve` |
| WhatsApp not linking | `openclaw channels login whatsapp` |

---

_Last updated: 2026-02-13_
