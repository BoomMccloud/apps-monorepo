// Bindings `wrangler types` cannot see: secrets have no local default, and the
// rate limiter and the switch-rules KV space are declared in wrangler.jsonc but
// typed here so a regenerated worker-configuration.gen.d.ts and this file agree.
declare namespace Cloudflare {
  interface Env {
    /** JSON-encoded private JWK registered with Rhinestone (ES256). */
    RHINESTONE_JWT_PRIVATE_KEY?: string
    RHINESTONE_INTEGRATOR_ID?: string
    RHINESTONE_PROJECT_ID?: string
    RHINESTONE_APP_ID?: string
    RHINESTONE_KEY_ID?: string
    RHINESTONE_TOKEN_RATE_LIMIT?: RateLimit
    /** PostHog project secret key limited to reading feature flags. */
    POSTHOG_PROJECT_SECRET_API_KEY?: string
    /** The last good feature-switch rules, refreshed by the scheduled job. */
    POSTHOG_SWITCH_RULES: KVNamespace
  }
}
