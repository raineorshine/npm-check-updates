#!/bin/bash

# Enable strict mode:
# -E: inherit ERR traps in functions/subshells
# -e: exit on any command failure
# -u: error on unset variables
# -o pipefail: fail pipelines if any command fails
set -Eeuo pipefail

cwd="$(pwd)"
e2e_dir="$(dirname "$(readlink -f "$0")")"
temp_dir="$(mktemp -d)"
registry_host=127.0.0.1
registry_port=4873
registry_addr="${registry_host}:${registry_port}"
registry_local="http://${registry_addr}"
registry_log="${temp_dir}/verdaccio.log"
verdaccio_config="${temp_dir}/verdaccio-config.yaml"

# Keep npm config and cache in the temp dir so the run never touches the user's,
# and so npx cannot reuse a stale tarball of the same version from a previous run
export NPM_CONFIG_USERCONFIG="${temp_dir}/npmrc"
export NPM_CONFIG_CACHE="${temp_dir}/npm-cache"

verdaccio_pid=""

# Cleanup on exit
cleanup() {
  local exit_status=$?

  # Shut down Verdaccio
  if [[ -n "${verdaccio_pid}" ]]; then
    echo "Shutting down Verdaccio"
    kill -9 "${verdaccio_pid}" 2>/dev/null || true
    wait "${verdaccio_pid}" 2>/dev/null || true
  fi

  # Return to working directory
  cd "${cwd}" || true

  # Remove temp directory
  rm -rf -- "${temp_dir}"

  if [[ "${exit_status}" -ne 0 ]]; then
    echo "Error"
  else
    echo "Done"
  fi
}

trap 'cleanup' EXIT

# Used instead of `timeout`, which is not available on macOS
retry() {
  local attempts=20
  local arg="${1-}"
  local i

  if [[ "${arg}" =~ ^[0-9]+$ ]]; then
    attempts="${arg}"
    shift
  fi

  for ((i = 0; i < attempts; i++)); do
    "$@" && return 0
    sleep 1
  done

  return 1
}

# Create Verdaccio config
#   - store packages in temp directory so they are deleted on exit
#   - allow anyone to publish to avoid npm login
#   - increase body size to accommodate current package tarball size
cat <<EOF > "${verdaccio_config}"
storage: ${temp_dir}/storage
max_body_size: 50mb
packages:
  npm-check-updates:
    access: \$all
    publish: \$all
  '**':
    access: \$all
    proxy: npmjs
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
EOF

# Start Verdaccio and wait for it to boot
echo "Starting local registry"
nohup verdaccio -l "${registry_addr}" -c "${verdaccio_config}" >"${registry_log}" 2>&1 &
verdaccio_pid=$!

if ! retry 30 grep -q 'http address' "${registry_log}"; then
  echo "Verdaccio did not start within 30s" >&2
  cat "${registry_log}" >&2
  exit 1
fi

# Set dummy authToken which is required to publish
# https://github.com/verdaccio/verdaccio/issues/212#issuecomment-308578500
npm config set "//${registry_addr}/:_authToken=e2e_dummy"

# Publish to local registry
echo "Publishing to local registry"
npm publish --registry "${registry_local}"

package_version="$(node -p "require('./package.json').version")"
npm view "npm-check-updates@${package_version}" version --registry "${registry_local}" >/dev/null

# npm-check-updates -v
echo "npm-check-updates -v"
npx --yes --registry "${registry_local}" npm-check-updates -v

# CLI
# Create a package.json file with a dependency on npm-check-updates since it is already published to the local registry
echo "Test: CLI"
cat <<'EOF' > "${temp_dir}/package.json"
{
  "dependencies": {
    "npm-check-updates": "1.0.0"
  }
}
EOF

# --configFilePath to avoid reading the repo .ncurc
# --cwd to point to the temp package file
# --pre 1 to ensure that an upgrade is always suggested even if npm-check-updates is on a prerelease version
npx --yes --registry "${registry_local}" npm-check-updates \
  --configFilePath "${temp_dir}" \
  --cwd "${temp_dir}" \
  --pre 1 \
  --registry "${registry_local}"

rm -f -- "${temp_dir}/package.json"
cp -a "${e2e_dir}/e2e" "${temp_dir}"

for variant in cjs esm; do
  echo "Test: ${variant}"
  cd "${temp_dir}/e2e/${variant}"

  echo "Installing"
  npm i npm-check-updates@latest --registry "${registry_local}"

  echo "Running test"
  REGISTRY="${registry_local}" node index.js
done
