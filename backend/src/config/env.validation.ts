const REQUIRED_KEYS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'] as const;

export function validate(
  env: Record<string, unknown>,
): Record<string, unknown> {
  const missing = REQUIRED_KEYS.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        `Copy backend/.env.example to backend/.env and fill in your Supabase project values.`,
    );
  }
  return env;
}
