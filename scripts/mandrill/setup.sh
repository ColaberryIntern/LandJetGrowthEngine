#!/bin/bash
# CCPP access kit one-shot installer.
#
# Source of truth: Ali Personal BC ticket (link in the email).
#
# Assumes you have already downloaded the kit files from the ticket into
# the SAME directory as this script:
#
#   ccppClient.js
#   ccpp-exec.sh
#   sample-query.js
#   ccpp-access.md
#   common-queries.md
#   setup.sh (this file)
#
# Usage:
#   cd /path/to/extracted/kit
#   bash setup.sh /path/to/your/new/project

set -e

if [ -z "$1" ]; then
  echo "Usage: bash setup.sh /path/to/your/new/project"
  exit 1
fi

DEST="$1"
SRC="$(cd "$(dirname "$0")" && pwd)"

for f in ccppClient.js ccpp-exec.sh sample-query.js; do
  if [ ! -f "$SRC/$f" ]; then
    echo "ERROR: $f not found in $SRC"
    echo "Did you download all the kit files from the BC ticket into this directory?"
    exit 1
  fi
done

if [ ! -d "$DEST" ]; then
  echo "ERROR: destination project does not exist: $DEST"
  exit 1
fi

echo "Installing CCPP access kit into: $DEST"

mkdir -p "$DEST/backend/src/scripts/lib"
mkdir -p "$DEST/scripts"

cp "$SRC/ccppClient.js"  "$DEST/backend/src/scripts/lib/"
cp "$SRC/sample-query.js" "$DEST/backend/src/scripts/sampleCcppQuery.js"
cp "$SRC/ccpp-exec.sh"   "$DEST/scripts/"
chmod +x "$DEST/scripts/ccpp-exec.sh"

echo "  + backend/src/scripts/lib/ccppClient.js"
echo "  + backend/src/scripts/sampleCcppQuery.js"
echo "  + scripts/ccpp-exec.sh"

echo ""
echo "=== Install complete ==="
echo ""
echo "Next steps:"
echo ""
echo "  1. Test SSH access to prod:"
echo "       ssh root@95.216.199.47 'echo ok'"
echo "     (must return 'ok' without password prompt)"
echo ""
echo "  2. Smoke-test a query via the bash wrapper:"
echo "       cd $DEST"
echo "       ./scripts/ccpp-exec.sh \"SELECT TOP 1 InternFullName FROM ADF_InternshipProgram WHERE InternIsActive=1\""
echo ""
echo "  3. Run the full Node sample (4 queries + guard test):"
echo "       node $DEST/backend/src/scripts/sampleCcppQuery.js"
echo ""
echo "Pitfalls:"
echo "  - If SSH prompts for a password, register your key first:"
echo "       ssh-copy-id root@95.216.199.47"
echo "  - If the container name isn't 'accelerator-backend', edit ccppClient.js + ccpp-exec.sh"
echo "  - Read-only guard rejects INSERT/UPDATE/DELETE/etc. - pass {allowMutations:true} in code"
echo "    or set CCPP_ALLOW_MUTATIONS=1 for the bash wrapper"
echo ""
echo "Full reference: see ccpp-access.md and common-queries.md attached to the BC ticket."
