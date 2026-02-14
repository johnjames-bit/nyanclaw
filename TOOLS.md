# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

## Model Stack

### Cloud-First, Local Substrate (φ-ontology)

**Philosophy:**
- **Cloud (φ¹)** = primary — fast, smart, always tried first
- **Local (00)** = substrate — last defense, only when cloud fails/refuses

```
Cloud (MiniMax) → [fails] → Cloud (Groq/Claude) → [fails] → Local (Ollama) → [fails] → Error
```

"The sky runs first. The ground holds when the sky falls."

| Model | Role | Context |
|-------|------|---------|
| MiniMax-M2.5 | Primary (φ¹) | 200k |
| Groq | Cloud fallback (φ¹) — fast inference | 128k |
| Claude | Cloud fallback (φ¹) | 200k |
| Qwen2.5 Coder 7B | Substrate (00) — local last resort | 128k |

### Dynamic Chain

Built at startup from detected providers. Priority order:
1. MiniMax — if MINIMAX_API_KEY set (primary)
2. Groq — if GROQ_API_KEY set
3. Claude — if ANTHROPIC_API_KEY set
4. OpenAI — if OPENAI_API_KEY set
5. Ollama (local) — substrate, always last if running

### Manual Override

- `/model qwen` → force local
- `/model minimax` → force cloud (MiniMax)
- `/model auto` → smart routing (default, dynamic chain)

---

## Nyan API Fallback Strategy

**Endpoint:** https://nyanbook.io/api/v1/nyan
**Token:** NYAN_API_TOKEN (env secret)

### Query Priority:

1. **Internal first** → PHILOSOPHY.md, MEMORY.md, user context
2. **Fallback to Nyan API** → Real-time prices, weather, current events
3. **Always Nyan API** → Ψ-EMA calculations, chemistry, legal analysis, specialized atomic queries

### Usage:
```javascript
const { atomicQuery } = require('./lib/nyan-api.js');
// For real-time data
const result = await atomicQuery('CPO price Indonesia');
// For Ψ-EMA
const psiEma = await getPsiEMA('AAPL');
```

## Browser (Brave)
- Gmail: https://mail.google.com/mail/u/0/#inbox
- Calendar: https://calendar.google.com/calendar/u/0/r
- Account: [EMAIL_PLACEHOLDER]
- Status: Logged in, accessible
