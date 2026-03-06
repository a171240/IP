#!/usr/bin/env bash
set -euo pipefail

REPO="${1:-/Users/zhuan/IP项目/ip-content-factory}"

if ! /usr/bin/git -C "$REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "git repo not found: $REPO" >&2
  exit 1
fi

if ! /usr/bin/git -C "$REPO" rev-parse --verify main >/dev/null 2>&1; then
  echo "main branch not found in $REPO" >&2
  exit 1
fi

SPECS=(
  "codex/voicecoach-integration:/private/tmp/ip-vc-integration"
  "codex/voicecoach-contract:/private/tmp/ip-vc-contract"
  "codex/voicecoach-fastpath:/private/tmp/ip-vc-fastpath"
  "codex/voicecoach-realtime:/private/tmp/ip-vc-realtime"
  "codex/voicecoach-miniapp:/private/tmp/ip-vc-miniapp"
)

seed_shared_baseline() {
  local worktree="$1"
  /bin/mkdir -p "$worktree/docs/voicecoach-parallel" "$worktree/lib/voice-coach" "$worktree/scripts"
  /usr/bin/rsync -a "$REPO/docs/voicecoach-parallel/" "$worktree/docs/voicecoach-parallel/"
  /usr/bin/rsync -a "$REPO/lib/voice-coach/realtime-contract.ts" "$worktree/lib/voice-coach/"
  /usr/bin/rsync -a "$REPO/scripts/setup_voicecoach_parallel.sh" "$worktree/scripts/"
  /usr/bin/rsync -a "$REPO/scripts/bench_voicecoach.mjs" "$worktree/scripts/"
  /usr/bin/rsync -a "$REPO/scripts/analyze_voicecoach_obs.mjs" "$worktree/scripts/"
  /usr/bin/rsync -a "$REPO/scripts/run_voicecoach_obs_oneclick.mjs" "$worktree/scripts/"
  /usr/bin/rsync -a "$REPO/.env.example" "$worktree/.env.example"
}

for spec in "${SPECS[@]}"; do
  IFS=":" read -r branch worktree <<<"$spec"
  if [ -e "$worktree" ]; then
    echo "skip_existing_worktree branch=$branch path=$worktree"
  elif /usr/bin/git -C "$REPO" show-ref --verify --quiet "refs/heads/$branch"; then
    echo "attach_existing_branch branch=$branch path=$worktree"
    /usr/bin/git -C "$REPO" worktree add "$worktree" "$branch"
  else
    echo "create_branch_and_worktree branch=$branch path=$worktree from=main"
    /usr/bin/git -C "$REPO" worktree add -b "$branch" "$worktree" main
  fi

  if [ "$branch" = "codex/voicecoach-contract" ] || [ "$branch" = "codex/voicecoach-integration" ]; then
    echo "seed_shared_baseline branch=$branch path=$worktree"
    seed_shared_baseline "$worktree"
  fi
done

echo
/usr/bin/git -C "$REPO" worktree list
