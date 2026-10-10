import assert from 'node:assert/strict';
import { cosineSimilarity } from 'ai';

async function main() {
  const results = [1, 1e200, 1e-200].map(scale => ({
    scale,
    result: cosineSimilarity([scale, scale], [scale, scale]),
  }));

  console.log(results);

  assert.ok(
    results.every(
      ({ result }) => Number.isFinite(result) && Math.abs(result - 1) < 1e-12,
    ),
    'ISSUE_22625: identical finite nonzero vectors must have cosine similarity approximately 1 at every tested scale',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
