const WEAK_SECRETS = new Set([
  'change-me-in-production',
  'northstar-dev-session-secret-change-me',
])

export function authDisabled(): boolean {
  return process.env.AUTH_DISABLED === 'true' || process.env.AUTH_DISABLED === '1'
}

/** Refuse to boot with a missing/weak secret when auth is enabled. */
export function assertAuthConfig(): void {
  if (authDisabled()) {
    console.warn('[auth] AUTH_DISABLED=true — GraphQL and upload auth checks are OFF')
    return
  }
  const secret = process.env.SESSION_SECRET?.trim()
  if (!secret || secret.length < 32 || WEAK_SECRETS.has(secret)) {
    throw new Error(
      'SESSION_SECRET must be a cryptographically random string (≥32 chars). ' +
        'Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))". ' +
        'Or set AUTH_DISABLED=true for local development only.',
    )
  }
}

export function graphqlDevToolsEnabled(): boolean {
  return process.env.NODE_ENV !== 'production'
}
