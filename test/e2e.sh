#!/bin/bash

temp_dir=$(mktemp -d)
registry_port=4873
registry_local="http://localhost:$registry_port"
registry_log=$temp_dir/verdaccio.log
verdaccio_config=$temp_dir/verdaccio-config.yaml

# cleanup on exit
cleanup() {

  # shut down verdaccio
  verdaccio_pid=$(lsof -t -i :$registry_port)
  if [ -n "$verdaccio_pid" ]; then
    echo Shutting down verdaccio
    kill -9 $verdaccio_pid
    wait $verdaccio_pid 2>/dev/null
  fi

  # delete authToken
  # WARNING: The original authToken cannot be restored because it is protected and cannot be read with 'npm config get'.
  npm config delete "//localhost:$registry_port/:_authToken"

  # remove temp directory
  rm -rf $temp_dir

  echo Done
}

trap cleanup EXIT

# create verdaccio config
#   - store packages in temp directory so they are deleted on exit
#   - allow anyone to publish to avoid npm login
echo "
storage: $temp_dir/storage
packages:
  npm-check-updates:
    access: \$all
    publish: \$all
" >$verdaccio_config

# start verdaccio and wait for it to boot
echo Starting local registry
nohup verdaccio -l $registry_port -c $verdaccio_config &>$registry_log &
grep -q 'http address' <(tail -f $registry_log)

# set dummy authToken which is required to publish
# https://github.com/verdaccio/verdaccio/issues/212#issuecomment-308578500
npm config set "//localhost:$registry_port/:_authToken=e2e_dummy"

# publish to local registry
echo Publishing to local registry
npm publish --registry $registry_local --ignore-scripts

# Test: ncu -v
echo ncu -v
npx --registry $registry_local npm-check-updates -v

# Test: ncu
# Create a package.json file with a dependency on npm-check-updates since it is already published to the local registry
echo ncu
echo '{
  "dependencies": {
    "npm-check-updates": "1.0.0"
  }
}' >$temp_dir/package.json

# --configFilePath to avoid reading the repo .ncurc
# --cwd to point to the temp package file
# --pre 1 to ensure that an upgrade is always suggested even if npm-check-updates is on a prerelease version
npx --registry $registry_local npm-check-updates --configFilePath $temp_dir --cwd $temp_dir --pre 1 --registry $registry_local
