import { extractJsonMiddleware } from './packages/ai/src/middleware/extract-json-middleware';

async function main() {
  const middleware = extractJsonMiddleware();

  const wrapped = await middleware.wrapStream!({
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });
          controller.enqueue({ type: 'text-start', id: 't' });
          controller.enqueue({ type: 'text-delta', id: 't', delta: 'there' });
          controller.enqueue({ type: 'text-delta', id: 't', delta: ' altogether?' });
          controller.enqueue({ type: 'text-end', id: 't' });
          controller.close();
        },
      }),
    }),
  } as any);

  const chunks: string[] = [];
  for await (const chunk of wrapped.stream as any) {
    if (chunk.type === 'text-delta') chunks.push(chunk.delta);
  }

  console.log(JSON.stringify({ chunks, text: chunks.join('') }));
}

main();
