import { simulateReadableStream } from 'ai';

async function main() {
  if (typeof simulateReadableStream !== 'function') {
    throw new Error('simulateReadableStream was not imported as a function');
  }

  const reader = simulateReadableStream({
    chunks: ['workspace-ok'],
    initialDelayInMs: null,
    chunkDelayInMs: null,
  }).getReader();
  const chunks = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  if (chunks.length !== 1 || chunks[0] !== 'workspace-ok') {
    throw new Error(`Unexpected stream chunks: ${JSON.stringify(chunks)}`);
  }

  console.log('simulateReadableStream main-package import: workspace-ok');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
