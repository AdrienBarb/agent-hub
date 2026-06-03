import { createClient } from "@supabase/supabase-js";
import { STORAGE_BUCKET } from "../packages/agent-jobhunt/src/manifest";

const BUCKET = STORAGE_BUCKET;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

async function main(): Promise<void> {
  const supabase = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: existing, error: listError } =
    await supabase.storage.listBuckets();

  if (listError) {
    throw new Error(`listBuckets failed: ${listError.message}`);
  }

  if (existing?.some((b) => b.name === BUCKET)) {
    console.log(`[storage-setup] bucket "${BUCKET}" already exists`);
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(BUCKET, {
    public: false,
  });

  if (createError) {
    throw new Error(`createBucket failed: ${createError.message}`);
  }

  console.log(`[storage-setup] created private bucket "${BUCKET}"`);
}

main().catch((err) => {
  console.error("[storage-setup] failed:", err);
  process.exit(1);
});
