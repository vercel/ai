import express from 'express';

/** Adapt the SDK's Web Request/Response handler to a local Express route. */
export async function startWebhookServer(
  webhook: (request: Request) => Promise<Response>,
) {
  const app = express();
  app.post(
    '/mcp-events',
    // Signature verification needs the exact bytes received from the server.
    express.raw({ type: 'application/json', limit: '256kb' }),
    async (request, response) => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (value != null)
          headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      const result = await webhook(
        new Request(`http://127.0.0.1:3003${request.originalUrl}`, {
          method: 'POST',
          headers,
          body: new Uint8Array(request.body),
        }),
      );
      response.status(result.status);
      result.headers.forEach((value, name) => response.setHeader(name, value));
      response.send(Buffer.from(await result.arrayBuffer()));
    },
  );
  const server = app.listen(3003, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
