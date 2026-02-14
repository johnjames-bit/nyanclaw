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

- **Primary:** MiniMax-M2.5 (minimax-portal)
- **Fallback:** Qwen2.5 Coder 7B (ollama local)
- **Router:** ClawRouter (blockrun/auto)

### Manual Fallback (when MiniMax fails)

Just type in chat:
- `/model qwen` → switches to local Qwen
- `/model minimax` → switches back to MiniMax
- `/model auto` → ClawRouter smart routing

---

## Nyan API Fallback Strategy

**Endpoint:** https://nyanbook.io/api/v1/nyan  
**Token:** Stored in `lib/nyan-api.js`

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
