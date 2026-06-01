import "server-only";
import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),

  ANTHROPIC_API_KEY: z.string().min(1),

  INNGEST_EVENT_KEY: z.string().min(1),
  INNGEST_SIGNING_KEY: z.string().min(1),

  LANGFUSE_PUBLIC_KEY: z.string().min(1),
  LANGFUSE_SECRET_KEY: z.string().min(1),
  LANGFUSE_BASE_URL: z.string().url().default("https://cloud.langfuse.com"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

function load(): Env {
  if (cached) return cached;

  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
  if (process.env.SKIP_ENV_VALIDATION === "true" && isBuildPhase) {
    cached = new Proxy({} as Env, {
      get: (_t, key: string) =>
        key.endsWith("_URL") ? "http://localhost" : "__build_placeholder__",
    });
    return cached;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const env = new Proxy({} as Env, {
  get(_target, key: string) {
    return load()[key as keyof Env];
  },
});
