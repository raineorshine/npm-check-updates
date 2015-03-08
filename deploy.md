# Deployment Instructions

## General
Add tests
Update README
Add and commit all changes
Update HISTORY

## stable
npm version minor
git push
git push --tags
npm publish

## unstable
Manually bump version number in package.json
git add -A
git commit -m "vX.X.X"
git tag vX.X.X-alpha.1
git push
git push --tags
npm publish --tag unstable