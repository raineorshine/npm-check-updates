// Global vitest setup, runs before every test file
process.env.NCU_TESTS = 'true'

// drop min-release-age from the repo .npmrc so tests get no implicit cooldown
// (empty rather than 0, which is still logged as an inferred cooldown)
process.env.npm_config_min_release_age = ''
