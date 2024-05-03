#!/bin/bash

cwd=$(pwd)
e2e_dir=$(dirname "$(readlink -f "$0")")
temp_dir=$(mktemp -d)
registry_port=4873
registry_local="http://localhost:$registry_port"
registry_log=$temp_dir/verdaccio.log
verdaccio_config=$temp_dir/verdaccio-config.yaml

# cleanup on exit
cleanup() {

  exit_status=$?

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

  # return to working directory
  cd $cwd

  if [ $exit_status -ne 0 ]; then
    echo Error
  else
    echo Done
  fi
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
  '**':
    access: \$all
    proxy: npmjs
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
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
npm publish --registry $registry_local

# Test: ncu -v
echo ncu -v
npx --registry $registry_local npm-check-updates -v

# Test: cli
# Create a package.json file with a dependency on npm-check-updates since it is already published to the local registry
echo Test: cli
echo '{
  "dependencies": {
    "npm-check-updates": "1.0.0"
  }
}' >$temp_dir/package.json

# --configFilePath to avoid reading the repo .ncurc
# --cwd to point to the temp package file
# --pre 1 to ensure that an upgrade is always suggested even if npm-check-updates is on a prerelease version
npx --registry $registry_local npm-check-updates --configFilePath $temp_dir --cwd $temp_dir --pre 1 --registry $registry_local

rm $temp_dir/package.json
cp -r $e2e_dir/e2e $temp_dir

# Test: cjs
echo Test: cjs
cd $temp_dir/e2e/cjs

echo Installing
npm i npm-check-updates@latest --registry $registry_local

echo Running test
REGISTRY=$registry_local node $temp_dir/e2e/cjs/index.js

# Test: esm
echo Test: esm
cd $temp_dir/e2e/esm

echo Installing
npm i npm-check-updates@latest --registry $registry_local

echo Running test
REGISTRY=$registry_local node $temp_dir/e2e/esm/index.js

# Test: typescript
echo Test: typescript
cd $temp_dir/e2e/typescript

echo Installing
npm i npm-check-updates@latest --registry $registry_local
npm i typescript@5.4.5
echo 'import ncu from "npm-check-updates"

ncu.run({})' >index.ts

echo Running test
npx tsc index.ts
REGISTRY=$registry_local node $temp_dir/e2e/typescript/index.js
