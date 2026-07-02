import { processUIMessageStream, createStreamingUIMessageState } from './packages/ai/src/ui/process-ui-message-stream.ts';

const chunkArg = process.argv[2] ?? 'read';
const N = Number(process.argv[3] ?? 10000);
const CHUNK = 'x'.repeat(Number(process.argv[4] ?? 200));

const stream = new ReadableStream({
  start(c) {
    c.enqueue({ type: 'text-start', id: '1' });
    for (let i = 0; i < N; i++) c.enqueue({ type: 'text-delta', id: '1', delta: CHUNK });
    c.enqueue({ type: 'text-end', id: '1' });
    c.close();
  }
});

const state = createStreamingUIMessageState({ lastMessage: undefined, messageId: 'm1' });
let bytesObserved = 0;
const write = chunkArg === 'json'
  ? () => { bytesObserved += JSON.stringify(state.message).length; }
  : chunkArg === 'read'
    ? () => { bytesObserved += state.message.parts[0]?.text?.length ?? 0; }
    : () => {};

const t0 = performance.now();
const out = processUIMessageStream({
  stream,
  runUpdateMessageJob: (job) => job({ state, write }),
  onError: (e) => { throw e; },
});
const reader = out.getReader();
while ((await reader.read()).done === false) {}
const ms = performance.now() - t0;
console.log(JSON.stringify({ mode: chunkArg, N, chunkSize: CHUNK.length, elapsedMs: Math.round(ms), finalLength: state.message.parts[0].text.length, bytesObserved }));
