import 'dotenv/config';
import { createXai } from '@ai-sdk/xai';
import { experimental_generateVideo as generateVideo } from 'ai';

/**
 * Probe: what do xAI video HTTP responses actually carry in their HEADERS?
 *
 * The request-id capture work assumed xAI's resource request_id lives only in
 * the response body (surfaced via providerMetadata.xai.requestId) and that
 * headers carry nothing useful for video. That assumption was never verified.
 *
 * This wraps fetch to dump the response headers of EVERY xAI video HTTP call —
 * the create POST /videos/generations and each poll GET /videos/:id — because
 * the SDK exposes only the poll headers (result.responses[].headers) and discards
 * the create-POST headers entirely. Use it to decide, per provider, whether
 * header-based extraction (extractProviderRequestId) should also apply to video
 * or whether body/providerMetadata is the only source. Separate from
 * request-id.ts on purpose.
 *
 * Run:
 *   cd examples/ai-functions
 *   pnpm tsx src/generate-video/xai/response-headers.ts
 *
 * Iterate against a moderated/failing input the same way as request-id.ts:
 *   XAI_VIDEO_PROMPT="..." XAI_VIDEO_IMAGE_URL="https://..." pnpm tsx ...
 */

const DEFAULT_IMAGE =
  'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-functions/data/comic-cat.png';
const DEFAULT_PROMPT = 'The cat slowly turns its head and blinks';

// Header names that might carry a provider request/response/correlation id.
const ID_HINT = /request|response|trace|correlation|(^|[-_])id($|[-_])/i;

function dumpHeaders(label: string, headers: Headers): void {
  const all: Record<string, string> = {};
  headers.forEach((value, key) => {
    all[key] = value;
  });
  console.log(`\n[${label}]`);
  console.log(JSON.stringify(all, null, 2));
  const idish = Object.keys(all).filter(key => ID_HINT.test(key));
  console.log(
    idish.length > 0
      ? `  → id-like headers: ${idish.map(key => `${key}=${all[key]}`).join(', ')}`
      : '  → id-like headers: none',
  );
}

const loggingFetch: typeof globalThis.fetch = async (input, init) => {
  const response = await globalThis.fetch(input, init);
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  dumpHeaders(`${init?.method ?? 'GET'} ${url}`, response.headers);
  return response;
};

async function main(): Promise<void> {
  const xai = createXai({ fetch: loggingFetch });
  const prompt = process.env.XAI_VIDEO_PROMPT ?? DEFAULT_PROMPT;
  const image = process.env.XAI_VIDEO_IMAGE_URL ?? DEFAULT_IMAGE;

  console.log('=== xAI video response-header probe ===');
  console.log('Dumping headers for the create POST and every poll GET.');

  try {
    const result = await generateVideo({
      model: xai.video('grok-imagine-video'),
      prompt: { image, text: prompt },
      duration: 5,
    });

    // Core exposes per-call metadata as `responses[]` (one entry per HTTP call
    // it surfaced) — for xAI video these are poll-GET headers, which carry no
    // id header. NOT `result.response` (singular), which does not exist.
    console.log(
      '\n=== SDK-exposed result.responses[].headers (poll GET only) ===',
    );
    const exposed = (
      result as { responses?: Array<{ headers?: Record<string, string> }> }
    ).responses?.map(entry => entry.headers ?? {});
    console.log(JSON.stringify(exposed ?? [], null, 2));

    console.log('\n=== providerMetadata.xai ===');
    const meta = (
      result.providerMetadata as { xai?: Record<string, unknown> } | undefined
    )?.xai;
    console.log(JSON.stringify(meta ?? {}, null, 2));

    console.log(
      '\nCompare: is any id-like header equal to the providerMetadata requestId,' +
        ' or is it a distinct per-HTTP-call id?',
    );
  } catch (error) {
    console.log(
      '\n=== errored — the headers dumped above still show what xAI returned ===',
    );
    console.error(error);
  }
}

main().catch(err => {
  console.error('probe threw:', err);
  process.exitCode = 1;
});
