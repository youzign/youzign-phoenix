#!/bin/zsh
# codex-job.sh <workdir> <logbase> "<prompt>"
# Runs codex exec with live JSONL event streaming + a liveness watchdog:
# if the event log stops growing for 15 minutes, the job is killed (exit 99)
# instead of spinning silently for hours. Progress is greppable at any time:
#   tail -f <logbase>.events   (live event stream)
#   cat <logbase>.result       (final message when done)
set -u
WORKDIR="$1"; LOGBASE="$2"; PROMPT="$3"
EVENTS="$LOGBASE.events"; RESULT="$LOGBASE.result"
: > "$EVENTS"

codex exec --sandbox workspace-write --json -o "$RESULT" -C "$WORKDIR" "$PROMPT" < /dev/null >> "$EVENTS" 2>&1 &
CODEX_PID=$!

STALL_LIMIT=900  # 15 min without any new event = stuck
last_size=0; stalled_for=0
while kill -0 $CODEX_PID 2>/dev/null; do
  sleep 30
  size=$(wc -c < "$EVENTS" 2>/dev/null || echo 0)
  if [ "$size" -gt "$last_size" ]; then
    last_size=$size; stalled_for=0
  else
    stalled_for=$((stalled_for + 30))
    if [ $stalled_for -ge $STALL_LIMIT ]; then
      echo "WATCHDOG: no events for ${STALL_LIMIT}s — killing stuck codex job" | tee -a "$EVENTS"
      kill -9 $CODEX_PID 2>/dev/null
      exit 99
    fi
  fi
done
wait $CODEX_PID
RC=$?
echo "CODEX EXIT: $RC" >> "$EVENTS"
exit $RC
