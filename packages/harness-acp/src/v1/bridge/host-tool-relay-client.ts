import { Agent, request } from 'node:http';

/*
 * A host-tool call can remain pending while a person reviews an approval.
 * The loopback connection therefore must not impose an inactivity deadline.
 */
const relayAgent = new Agent({ keepAlive: true, timeout: 0 });

export async function postHostToolRelay({
  relayUrl,
  relayCredential,
  path,
  body,
}: {
  relayUrl: string;
  relayCredential: string;
  path: string;
  body: Readonly<Record<string, unknown>>;
}): Promise<{ status: number; ok: boolean; value: unknown }> {
  const serializedBody = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const relayRequest = request(
      new URL(path, relayUrl),
      {
        agent: relayAgent,
        method: 'POST',
        headers: {
          authorization: `Bearer ${relayCredential}`,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(serializedBody),
        },
      },
      response => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () => {
          void new Response(Buffer.concat(chunks)).json().then(value => {
            const status = response.statusCode ?? 0;
            resolve({
              status,
              ok: status >= 200 && status < 300,
              value,
            });
          }, reject);
        });
      },
    );
    relayRequest.on('error', reject);
    relayRequest.end(serializedBody);
  });
}
