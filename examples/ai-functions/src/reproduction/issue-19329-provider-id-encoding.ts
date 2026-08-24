import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { createXai } from '@ai-sdk/xai';

type CapturedRequest = {
  rawUrl: string;
  effectiveUrl: string;
  credentialed: boolean;
};

function getUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }

  return input instanceof URL ? input.href : input.url;
}

function hasHeader(
  init: RequestInit | undefined,
  name: string,
  expectedValue: string,
): boolean {
  return new Headers(init?.headers).get(name) === expectedValue;
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function reproduceXai(): Promise<CapturedRequest> {
  const providerId = 'abc/../../internal';
  const requests: CapturedRequest[] = [];
  let callCount = 0;

  const xai = createXai({
    apiKey: 'xai-api-key',
    baseURL: 'https://api.x.ai/v1',
    fetch: async (input, init) => {
      const rawUrl = getUrl(input);
      requests.push({
        rawUrl,
        effectiveUrl: new URL(rawUrl).href,
        credentialed: hasHeader(init, 'authorization', 'Bearer xai-api-key'),
      });

      callCount++;
      return callCount === 1
        ? jsonResponse({ request_id: providerId })
        : jsonResponse({
            status: 'done',
            video: { url: 'https://example.com/video.mp4' },
          });
    },
  });

  const model = xai.video('grok-imagine-video');
  const start = await model.doStart!({
    prompt: 'test video',
    providerOptions: {},
  } as never);
  await model.doStatus!({ operation: start.operation } as never);

  return requests[1]!;
}

async function reproduceGoogle(): Promise<CapturedRequest> {
  const providerId = 'files/evil/../../secret';
  const requests: CapturedRequest[] = [];
  let callCount = 0;

  const google = createGoogle({
    apiKey: 'google-api-key',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    fetch: async (input, init) => {
      const rawUrl = getUrl(input);
      requests.push({
        rawUrl,
        effectiveUrl: new URL(rawUrl).href,
        credentialed: hasHeader(init, 'x-goog-api-key', 'google-api-key'),
      });

      callCount++;
      if (callCount === 1) {
        return new Response(null, {
          status: 200,
          headers: {
            'x-goog-upload-url':
              'https://generativelanguage.googleapis.com/upload/session',
          },
        });
      }

      if (callCount === 2) {
        return jsonResponse({
          file: {
            name: providerId,
            mimeType: 'text/plain',
            uri: 'https://example.com/file',
            state: 'PROCESSING',
          },
        });
      }

      return jsonResponse({
        name: providerId,
        mimeType: 'text/plain',
        uri: 'https://example.com/file',
        state: 'ACTIVE',
      });
    },
  });

  await google.files().uploadFile({
    data: { type: 'data', data: new Uint8Array([1]) },
    mediaType: 'text/plain',
    providerOptions: {
      google: {
        pollIntervalMs: 1,
        pollTimeoutMs: 1000,
      },
    },
  });

  return requests[2]!;
}

async function reproduceAnthropic(): Promise<CapturedRequest> {
  const skillId = 'skill/../../admin';
  const version = 'v1/../../admin';
  const requests: CapturedRequest[] = [];
  let callCount = 0;

  const anthropic = createAnthropic({
    apiKey: 'anthropic-api-key',
    baseURL: 'https://api.anthropic.com/v1',
    fetch: async (input, init) => {
      const rawUrl = getUrl(input);
      requests.push({
        rawUrl,
        effectiveUrl: new URL(rawUrl).href,
        credentialed: hasHeader(init, 'x-api-key', 'anthropic-api-key'),
      });

      callCount++;
      return callCount === 1
        ? jsonResponse({
            id: skillId,
            latest_version: version,
            source: 'custom',
            created_at: '2026-08-24T00:00:00Z',
            updated_at: '2026-08-24T00:00:00Z',
          })
        : jsonResponse({
            type: 'skill_version',
            skill_id: skillId,
            name: 'test-skill',
            description: 'test skill',
          });
    },
  });

  await anthropic.skills().uploadSkill({
    files: [
      {
        path: 'test/SKILL.md',
        data: {
          type: 'data',
          data: new TextEncoder().encode('# Test skill'),
        },
      },
    ],
  });

  return requests[1]!;
}

function preservesPathSegments(
  request: CapturedRequest,
  providerIds: string[],
): boolean {
  return providerIds.every(providerId =>
    request.rawUrl.includes(encodeURIComponent(providerId)),
  );
}

async function main() {
  const xai = await reproduceXai();
  const google = await reproduceGoogle();
  const anthropic = await reproduceAnthropic();

  const results = [
    {
      provider: 'xAI',
      request: xai,
      safe: preservesPathSegments(xai, ['abc/../../internal']),
    },
    {
      provider: 'Google',
      request: google,
      safe: preservesPathSegments(google, ['files/evil/../../secret']),
    },
    {
      provider: 'Anthropic',
      request: anthropic,
      safe: preservesPathSegments(anthropic, [
        'skill/../../admin',
        'v1/../../admin',
      ]),
    },
  ];

  console.log(JSON.stringify(results, null, 2));

  const missingCredentials = results.filter(
    result => !result.request.credentialed,
  );
  if (missingCredentials.length > 0) {
    throw new Error(
      `Reproduction setup error: expected credentialed requests for ${missingCredentials
        .map(result => result.provider)
        .join(', ')}.`,
    );
  }

  const unsafeProviders = results
    .filter(result => !result.safe)
    .map(result => result.provider);

  if (unsafeProviders.length > 0) {
    console.error(`Unsafe providers: ${unsafeProviders.join(', ')}`);
    throw new Error(
      'ISSUE_19329_REPRODUCED: provider-returned IDs escaped credentialed URL path segments.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
