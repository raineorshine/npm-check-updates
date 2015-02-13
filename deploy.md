# Deployment Instructions

## General
Add tests
Update README
Update HISTORY
Add and commit all changes

## stable
npm version minor
git push && git push --tags

## unstable
Manually bumb version number in package.json
git add -A
git commit -m "vX.X.X"
git tag vX.X.X-alpha1
npm publish --tag unstable