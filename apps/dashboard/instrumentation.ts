export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { setupLangfuse } = await import("@hub/core/langfuse");
    setupLangfuse();
  }
}
