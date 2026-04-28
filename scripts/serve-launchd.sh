#!/usr/bin/env bash
# Wrapper for launchd — loads secrets and execs the HTTP MCP server.
# Used by com.vibes.agent-cortex.plist
#
# Secrets live in ~/.config/agent-cortex/env (not checked into git).
# Format: KEY=VALUE, one per line, no export prefix.

set -euo pipefail

ENV_FILE="${HOME}/.config/agent-cortex/env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FATAL: Missing env file: $ENV_FILE" >&2
  echo "Create it with: SUPABASE_DB_URL, OPENAI_API_KEY, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, BEDROCK_MODEL_ID" >&2
  exit 1
fi

# Load env vars (skip comments and blank lines)
while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" == \#* ]] && continue
  export "$key"="$value"
done < "$ENV_FILE"

export PORT="${PORT:-3100}"
export NODE_ENV="${NODE_ENV:-production}"

exec /usr/local/bin/node /Users/donalocallaghan/workspace/vibes/agent_cortex/dist/serve.js
