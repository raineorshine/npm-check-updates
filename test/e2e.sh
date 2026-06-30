#!/bin/bash

# These can be set once the fnm permission errors are figured out
# See: https://github.com/Schniz/fnm
# set -e
# set -o pipefail
# When set -e is enabled, we can drop `|| exit (1)?` from commands that are expected to fail

cwd="$(pwd)"
e2e_dir="$(dirname "$(readlink -f "$0")")"
temp_dir="$(mktemp -d)"
registry_host=127.0.0.1
registry_port=4873
registry_addr="${registry_host}:${registry_port}"
registry_local="http://${registry_addr}"
registry_log="${temp_dir}/verdaccio.log"
verdaccio_config="${temp_dir}/verdaccio-config.yaml"

verdaccio_pid=""

# cleanup on exit
cleanup() {
  local exit_status=$?

  # shut down verdaccio
  if [[ -n "${verdaccio_pid}" ]]; then
    echo Shutting down verdaccio
    kill -9 "${verdaccio_pid}" 2>/dev/null || true
    wait "${verdaccio_pid}" 2>/dev/null || true
  fi

  # delete authToken
  # WARNING: The original authToken cannot be restored because it is protected and cannot be read with 'npm config get'.
  npm config delete "//${registry_addr}/:_authToken" || true

  # return to working directory before removing temp dir
  cd "${cwd}" || true

  # remove temp directory
  rm -rf -- "${temp_dir}"

  if [[ "${exit_status}" -ne 0 ]]; then
    echo Error
  else
    echo Done
  fi
}

trap 'cleanup' EXIT

# create verdaccio config
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

# start verdaccio and wait for it to boot
echo Starting local registry
nohup verdaccio -l "${registry_addr}" -c "${verdaccio_config}" >"${registry_log}" 2>&1 &
verdaccio_pid=$!

if ! timeout 30 grep -q 'http address' <(tail -f "${registry_log}"); then
  echo "verdaccio did not start within 30s" >&2
  cat "${registry_log}" >&2
  exit 1
fi

# set dummy authToken which is required to publish
# https://github.com/verdaccio/verdaccio/issues/212#issuecomment-308578500
npm config set "//${registry_addr}/:_authToken=e2e_dummy"

# publish to local registry
echo Publishing to local registry
npm publish --registry "${registry_local}"

# wait for published version to become visible in verdaccio.
# verdaccio can accept npm publish before npm view/npx can resolve the package metadata.
# without this retry loop, e2e can fail intermittently with "no such package available".
package_version="$(node -p "require('./package.json').version")"
echo "Waiting for npm-check-updates@${package_version} in local registry"

publish_visible=false
for _ in {1..20}; do
  if npm view "npm-check-updates@${package_version}" version --registry "${registry_local}" >/dev/null 2>&1; then
    publish_visible=true
    break
  fi
  sleep 1
done

if [[ "${publish_visible}" == false ]]; then
  echo "Warning: npm-check-updates@${package_version} not visible in local registry after retry window"
fi

# Test: ncu -v
echo ncu -v
npx --registry "${registry_local}" npm-check-updates -v

# Test: cli
# Create a package.json file with a dependency on npm-check-updates since it is already published to the local registry
echo Test: cli
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
npx --registry "${registry_local}" npm-check-updates \
  --configFilePath "${temp_dir}" \
  --cwd "${temp_dir}" \
  --pre 1 \
  --registry "${registry_local}"

rm -f -- "${temp_dir}/package.json"
cp -r "${e2e_dir}/e2e" "${temp_dir}"

# Test: cjs
echo Test: cjs
cd "${temp_dir}/e2e/cjs" || exit

echo Installing
npm i npm-check-updates@latest --registry "${registry_local}"

echo Running test
REGISTRY="${registry_local}" node "${temp_dir}/e2e/cjs/index.js" || exit 1

# Test: esm
echo Test: esm
cd "${temp_dir}/e2e/esm" || exit

echo Installing
npm i npm-check-updates@latest --registry "${registry_local}"

echo Running test
REGISTRY="${registry_local}" node "${temp_dir}/e2e/esm/index.js" || exit 1
