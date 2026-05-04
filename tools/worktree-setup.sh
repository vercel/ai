# Path to the main worktree root.
ROOT=$(git worktree list | head -1 | awk '{print $1}')

# Path to this worktree root.
WORKTREE_ROOT=$(git rev-parse --show-toplevel)

if [ "$(pwd)" != "$WORKTREE_ROOT" ]; then
  echo "Must be run from the worktree root ($WORKTREE_ROOT)" >&2
  exit 1
fi

if [ "$(pwd)" = "$ROOT" ]; then
  echo "Must be run outside the main worktree ($ROOT)" >&2
  exit 1
fi

# Link .env files.
[ -f "$ROOT/.env" ] && ln -sf "$ROOT/.env" ./
if [ ! -d ./examples/ai-functions/ ]; then
  AI_FUNCTIONS_DIR=./examples/ai-core/
else
  AI_FUNCTIONS_DIR=./examples/ai-functions/
fi
[ -f "$ROOT/examples/ai-functions/.env" ] && ln -sf "$ROOT/examples/ai-functions/.env" "$AI_FUNCTIONS_DIR"
[ -f "$ROOT/examples/ai-e2e-next/.env" ] && ln -sf "$ROOT/examples/ai-e2e-next/.env" ./examples/ai-e2e-next/

pnpm install
