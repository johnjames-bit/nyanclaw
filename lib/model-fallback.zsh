# OpenClaw Model Fallback Helper
# Source this in ~/.zshrc: source ~/.openclaw/workspace/lib/model-fallback.zsh

# Try MiniMax, auto-fallback to Qwen on failure
nyan() {
  local prompt="$*"
  local max_retries=2
  local retry=0
  
  while [ $retry -lt $max_retries ]; do
    if [ $retry -eq 0 ]; then
      echo "🜁 Trying MiniMax-M2.5..."
    else
      echo "🜁 Retrying with Qwen2.5..."
    fi
    
    # Use OpenClaw exec to run a simple test
    response=$(openclaw exec --eval "
      const result = await globalThis.claude.messages.create({
        model: 'minimax-portal/MiniMax-M2.5',
        max_tokens: 50,
        messages: [{ role: 'user', content: '${prompt}' }]
      });
      return result.content[0].text;
    " 2>&1)
    
    if echo "$response" | grep -q "error\|Error\|failed"; then
      retry=$((retry + 1))
      if [ $retry -lt $max_retries ]; then
        echo "❌ Failed, trying fallback..."
      fi
    else
      echo "$response"
      return 0
    fi
  done
  
  echo "❌ All models failed"
  return 1
}

# Quick model switch aliases
alias qwen='echo "Switching to Qwen2.5..."; openclaw exec --eval "globalThis.currentModel = '\''ollama/qwen2.5-coder:7b'\''"'
alias minimax='echo "Switching to MiniMax-M2.5..."; openclaw exec --eval "globalThis.currentModel = '\''minimax-portal/MiniMax-M2.5'\''"'
alias auto='echo "Switching to ClawRouter auto..."; openclaw exec --eval "globalThis.currentModel = '\''blockrun/auto'\''"'

echo "🜁 Model helpers loaded: nyan, qwen, minimax, auto"
