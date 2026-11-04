import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createGoogleVertex } from '@ai-sdk/google-vertex';
import type { OAuth2Client as OAuth2ClientType } from '../../../../packages/google-vertex/node_modules/google-auth-library/build/src/index.js';

const requireFromGoogleVertex = createRequire(
  new URL('../../../../packages/google-vertex/package.json', import.meta.url),
);
const { OAuth2Client } = requireFromGoogleVertex('google-auth-library') as {
  OAuth2Client: typeof OAuth2ClientType;
};

const operations = [
  {
    name: 'generateContent',
    expectedUrlPart: ':generateContent',
    run: (vertex: ReturnType<typeof createGoogleVertex>) =>
      vertex('gemini-2.5-flash').doGenerate({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      }),
  },
  {
    name: 'streamGenerateContent',
    expectedUrlPart: ':streamGenerateContent',
    run: (vertex: ReturnType<typeof createGoogleVertex>) =>
      vertex('gemini-2.5-flash').doStream({
        prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      }),
  },
  {
    name: 'embedding predict',
    expectedUrlPart: ':predict',
    run: (vertex: ReturnType<typeof createGoogleVertex>) =>
      vertex.embeddingModel('text-embedding-004').doEmbed({
        values: ['hello'],
      }),
  },
] as const;

type OperationName = (typeof operations)[number]['name'];
type Capture = { headers: Headers; url: string };

async function captureRequests({
  providerHeaders,
}: {
  providerHeaders?: Record<string, string>;
}): Promise<Map<OperationName, Capture>> {
  const authClient = new OAuth2Client({ quotaProjectId: 'fake-quota' });
  authClient.setCredentials({
    access_token: 'fake-token',
    expiry_date: Date.now() + 3_600_000,
  });
  authClient.transporter.request = async () => {
    throw new Error('AUTH NETWORK FORBIDDEN');
  };

  const authHeaders = await authClient.getRequestHeaders();
  assert.equal(authHeaders.get('authorization'), 'Bearer fake-token');
  assert.equal(authHeaders.get('x-goog-user-project'), 'fake-quota');

  let activeOperation: OperationName | undefined;
  const captures = new Map<OperationName, Capture>();
  const vertex = createGoogleVertex({
    project: 'fake-resource',
    location: 'global',
    googleAuthOptions: { authClient },
    headers: providerHeaders,
    fetch: async (url, init) => {
      assert.ok(activeOperation);
      captures.set(activeOperation, {
        headers: new Headers(init?.headers),
        url: url.toString(),
      });
      throw new Error(`CAPTURED ${activeOperation}`);
    },
  });

  for (const operation of operations) {
    activeOperation = operation.name;
    await assert.rejects(
      async () => {
        await operation.run(vertex);
      },
      new RegExp(`CAPTURED ${operation.name}`),
    );
  }

  return captures;
}

async function main() {
  delete process.env.GOOGLE_VERTEX_API_KEY;
  globalThis.fetch = async () => {
    throw new Error('NETWORK FORBIDDEN');
  };

  const defaultCaptures = await captureRequests({});
  const explicitCaptures = await captureRequests({
    providerHeaders: { 'X-Goog-User-Project': 'explicit-quota' },
  });

  const quotaHeaderMismatches: string[] = [];

  for (const operation of operations) {
    const defaultCapture = defaultCaptures.get(operation.name);
    const explicitCapture = explicitCaptures.get(operation.name);

    assert.ok(defaultCapture, `missing default capture for ${operation.name}`);
    assert.ok(
      explicitCapture,
      `missing explicit capture for ${operation.name}`,
    );
    assert.ok(defaultCapture.url.includes(operation.expectedUrlPart));
    assert.ok(explicitCapture.url.includes(operation.expectedUrlPart));
    assert.equal(
      defaultCapture.headers.get('authorization'),
      'Bearer fake-token',
    );
    assert.equal(
      explicitCapture.headers.get('authorization'),
      'Bearer fake-token',
    );
    assert.equal(
      explicitCapture.headers.get('x-goog-user-project'),
      'explicit-quota',
      `case-insensitive explicit header override failed for ${operation.name}`,
    );

    const actualQuotaHeader = defaultCapture.headers.get('x-goog-user-project');
    if (actualQuotaHeader !== 'fake-quota') {
      quotaHeaderMismatches.push(
        `${operation.name}: expected fake-quota, received ${String(
          actualQuotaHeader,
        )}`,
      );
    }
  }

  if (quotaHeaderMismatches.length > 0) {
    throw new Error(
      `BUG: auth-client quota header was not propagated to all Vertex transports\n${quotaHeaderMismatches.join(
        '\n',
      )}`,
    );
  }
}

await main();
