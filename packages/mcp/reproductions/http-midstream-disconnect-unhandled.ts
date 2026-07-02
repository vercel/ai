import http from 'node:http';
import { HttpMCPTransport } from '../src/tool/mcp-http-transport';

/**
 * Reproduction for vercel/ai#16541.
 *
 * Run from the repository root:
 *
 *   pnpm exec tsx packages/mcp/reproductions/http-midstream-disconnect-unhandled.ts
 *
 * The local server sends SSE response headers/body, then destroys the socket.
 * HttpMCPTransport reports the undici `TypeError: terminated` via `onerror`,
 * but a floating rejection still reaches Node's default unhandled-rejection
 * handler and exits the process with code 1.
 */
async function main() {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(
      `event: message\ndata: ${JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { ok: true },
      })}\n\n`,
    );

    setTimeout(() => {
      res.socket?.destroy(new Error('repro forced mid-stream close'));
    }, 50);
  });

  await new Promise<void>(resolve => server.listen(0, resolve));

  const port = (server.address() as { port: number }).port;
  const transport = new HttpMCPTransport({
    url: `http://127.0.0.1:${port}/mcp`,
  });

  transport.onerror = error => {
    console.error('onerror observed:', error);
  };

  await transport.start();

  // Let undici observe the mid-stream socket close and route it to onerror.
  await new Promise(resolve => setTimeout(resolve, 200));

  // Closing after the mid-stream disconnect triggers a rejected reader.cancel()
  // promise that is ignored by the transport and becomes an unhandled rejection.
  await transport.close().catch(() => undefined);
  server.close();

  console.log('If the bug is fixed, the process should exit cleanly.');
}

main().catch(error => {
  console.error('repro setup failed:', error);
  process.exit(2);
});
