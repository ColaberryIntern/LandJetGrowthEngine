#!/bin/bash
# PostToolUse hook: blocks em-dash characters in Mandrill email send scripts.
# Drop this file at: <your-project>/.claude/hooks/check-emdash.sh
# Make it executable: chmod +x .claude/hooks/check-emdash.sh
# Register in .claude/settings.json under hooks.PostToolUse with
#   pathMatcher: "backend/src/scripts/send.*\.(js|ts)$"
#
# Source of truth: Ali Personal BC ticket 9981757450.

set -e
FILE="${CLAUDE_HOOK_FILE_PATH:-$1}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then exit 0; fi

# Check for unicode em-dash (U+2014) and en-dash (U+2013)
if grep -P "[\xE2\x80\x94\xE2\x80\x93]" "$FILE" >/dev/null 2>&1; then
  echo "BLOCKED: em-dash or en-dash found in $FILE" >&2
  echo "Use a slash, hyphen with spaces, comma, or 'and'/'but' instead." >&2
  grep -nP "[\xE2\x80\x94\xE2\x80\x93]" "$FILE" >&2 || true
  exit 2
fi
exit 0
