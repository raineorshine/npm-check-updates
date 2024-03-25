#!/usr/bin/env bash
# Install bun if not installed.
# Must be run in a prepare script instead of devDependencies to avoid npm install failing on Windows.
bun -v &> /dev/null
BUN_EXISTS="$?"

if [ $BUN_EXISTS -ne 0 ]; then
  npm install -g bun
fi

# Always return success, even if the install script fails.
# Windows is expected to fail and the bun tests will be skipped.
exit 0
