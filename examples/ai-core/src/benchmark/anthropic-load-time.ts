async function main() {
  const t0 = performance.now();
  await import('@ai-sdk/anthropic');
  const t1 = performance.now();

  console.log(`Import @ai-sdk/anthropic: ${(t1 - t0).toFixed(1)} ms`);
}

main().catch(console.error);
