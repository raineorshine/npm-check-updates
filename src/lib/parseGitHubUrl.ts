/** Parsed GitHub URL result. */
interface ParsedGitHubUrl {
  protocol: string | null
  auth: string | null
  host: string
  path: string | null
  pathname: string | null
  branch: string
  owner: string | null
  name: string | null
  repo: string | null
  repository: string | null
  blob: string | null
  filepath: string | null
}

/**
 * Parses a GitHub URL into its components using the WHATWG URL API.
 * Replaces the `parse-github-url` package to avoid the deprecated `url.parse()`.
 *
 * @param str - GitHub URL or shorthand (e.g. "owner/repo#semver:^1.0.0")
 * @returns Parsed URL components or null if the input is invalid
 */
function parseGitHubUrl(str: string): ParsedGitHubUrl | null {
  if (!str || typeof str !== 'string') return null
  if (str.indexOf('git@gist') !== -1 || str.indexOf('//gist') !== -1) return null

  // Try WHATWG URL parsing
  let parsed: URL | null = null
  try {
    parsed = new URL(str)
  } catch {
    // Not a valid standard URL — fall through to manual parsing below
  }

  if (parsed) {
    const protocol = parsed.protocol || null
    const auth =
      parsed.username
        ? parsed.password
          ? `${parsed.username}:${parsed.password}`
          : parsed.username
        : null
    // For opaque-origin URLs like `github:owner/repo`, hostname is empty string
    const host = parsed.hostname || 'github.com'
    // For opaque-origin URLs the owner is in the pathname without a leading slash
    const path = parsed.hostname ? parsed.pathname.replace(/^\//, '') : parsed.pathname
    const branch = parsed.hash ? parsed.hash.slice(1) : 'master'
    const seg = path ? path.split('/').filter(Boolean) : []
    const ownerStr = seg[0] ? seg[0].replace(/\.git$/, '') : null
    const nameStr = seg[1] ? seg[1].replace(/\.git$/, '') : null
    const repo = ownerStr && nameStr ? `${ownerStr}/${nameStr}` : null
    return {
      protocol,
      auth,
      host,
      path,
      pathname: path,
      branch,
      owner: ownerStr,
      name: nameStr,
      repo,
      repository: repo,
      blob: null,
      filepath: null,
    }
  }

  // Manual parsing for formats not handled by WHATWG URL:
  // - Bare shorthand: "owner/repo#branch"
  // - SCP-like SSH:   "git@github.com:owner/repo#branch"

  let rest = str
  let branch = 'master'
  const hashIdx = str.indexOf('#')
  if (hashIdx !== -1) {
    branch = str.slice(hashIdx + 1)
    rest = str.slice(0, hashIdx)
  }

  let host = 'github.com'
  let path: string | null = null

  if (rest.startsWith('git@')) {
    // git@github.com:owner/repo.git
    const match = rest.match(/^git@([^:]+):(.+)$/)
    if (match) {
      host = match[1]
      path = match[2]
    }
  } else {
    // Bare "owner/repo" shorthand
    path = rest
  }

  const seg = path ? path.split('/').filter(Boolean) : []
  const ownerStr = seg[0] ? seg[0].replace(/\.git$/, '') : null
  const nameStr = seg[1] ? seg[1].replace(/\.git$/, '') : null
  const repo = ownerStr && nameStr ? `${ownerStr}/${nameStr}` : null

  return {
    protocol: null,
    auth: null,
    host,
    path,
    pathname: path,
    branch,
    owner: ownerStr,
    name: nameStr,
    repo,
    repository: repo,
    blob: null,
    filepath: null,
  }
}

export default parseGitHubUrl
