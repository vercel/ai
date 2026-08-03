import 'dotenv/config';
import { type XaiVideoModelOptions, xai } from '@ai-sdk/xai';
import { APICallError, experimental_generateVideo as generateVideo } from 'ai';

/**
 * Diagnostic harness for xAI video provider request-id capture.
 *
 * Context: for `xai/grok-imagine-video` the AI Gateway records NO
 * providerRequestId/providerResponseId on any attempt (success or failure),
 * so we cannot hand xAI the request id (e.g. `e8720dcc-...`) they need to
 * reconcile a moderation rejection against their own logs.
 *
 * This script proves WHERE xAI's resource `request_id` is observable in each
 * outcome, so we know exactly what the gateway must read:
 *   - success            → result.providerMetadata.xai.requestId
 *   - moderation 400     → thrown APICallError from the poll GET /videos/:id
 *   - failed/timeout/etc → AISDKError thrown by the SDK poll loop
 *
 * `recoverRequestId()` below is the extraction strategy we intend to port into
 * the gateway (execute-video-query). Run this before/after any @ai-sdk/xai
 * change to confirm the id is surfaced on every path.
 *
 * Run:
 *   cd examples/ai-functions
 *   pnpm tsx src/generate-video/xai/request-id.ts
 *
 * Iterate on the moderation path by overriding the prompt/image with a
 * combination you know xAI moderates (no need to edit this file):
 *   XAI_VIDEO_PROMPT="..." XAI_VIDEO_IMAGE_URL="https://..." \
 *     pnpm tsx src/generate-video/xai/request-id.ts
 */

const DEFAULT_IMAGE =
  'https://raw.githubusercontent.com/vercel/ai/refs/heads/main/examples/ai-functions/data/comic-cat.png';
const DEFAULT_PROMPT = 'The cat slowly turns its head and blinks';

// xAI's resource id is the `{id}` in the poll URL `/videos/{id}`, which is also
// the id embedded in the returned video filename and in xAI's own meta.requestId.
const VIDEOS_PATH_ID = /\/videos\/([^/?#]+)/;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

type Recovered =
  | { value: string; source: string }
  | { value: null; source: 'NOT FOUND' };

/**
 * Every place xAI's resource request_id could be recovered from, in
 * preference order. Mirrors the logic the gateway will need.
 */
function recoverRequestId(error: unknown): Recovered {
  const anyErr = error as Record<string, unknown> | null;

  // 0. The contract the @ai-sdk/xai fix establishes: xAI's request_id attached
  //    as an own property on every thrown error (success uses providerMetadata).
  //    This is what the gateway should read.
  if (typeof anyErr?.requestId === 'string' && anyErr.requestId) {
    return { value: anyErr.requestId, source: 'error.requestId' };
  }

  // 1. Structured field an updated SDK may attach (cleanest — target state).
  const data = anyErr?.data as Record<string, unknown> | undefined;
  const fromData = data?.requestId ?? data?.request_id;
  if (typeof fromData === 'string' && fromData) {
    return { value: fromData, source: 'error.data.requestId' };
  }
  const meta = anyErr?.providerMetadata as
    | { xai?: { requestId?: unknown } }
    | undefined;
  if (typeof meta?.xai?.requestId === 'string' && meta.xai.requestId) {
    return {
      value: meta.xai.requestId,
      source: 'error.providerMetadata.xai.requestId',
    };
  }

  // 2. Interim, no-SDK-change recovery: the poll GET URL carries /videos/:id.
  if (APICallError.isInstance(error) && typeof error.url === 'string') {
    const m = error.url.match(VIDEOS_PATH_ID);
    if (m?.[1]) {
      return { value: m[1], source: 'APICallError.url (/videos/:id)' };
    }
  }

  // 3. Last resort: any uuid in the message.
  const msg = anyErr?.message;
  if (typeof msg === 'string') {
    const m = msg.match(UUID);
    if (m?.[0]) {
      return { value: m[0], source: 'error.message (uuid scan)' };
    }
  }

  return { value: null, source: 'NOT FOUND' };
}

function dumpError(error: unknown): void {
  const e = error as Record<string, unknown>;
  console.log('  name:        ', e?.name);
  console.log('  message:     ', e?.message);
  if (APICallError.isInstance(error)) {
    console.log('  [APICallError]');
    console.log('  statusCode:  ', error.statusCode);
    console.log('  url:         ', error.url);
    console.log('  responseBody:', error.responseBody);
    console.log('  data:        ', JSON.stringify(error.data));
    console.log(
      '  x-request-id (poll HTTP call, NOT the resource id):',
      error.responseHeaders?.['x-request-id'],
    );
  }
}

async function main(): Promise<void> {
  const prompt = process.env.XAI_VIDEO_PROMPT ?? DEFAULT_PROMPT;
  const image = process.env.XAI_VIDEO_IMAGE_URL ?? DEFAULT_IMAGE;
  // Set a tiny value (e.g. 1) to force XAI_VIDEO_GENERATION_TIMEOUT and
  // deterministically exercise the error path without needing moderated input.
  const pollTimeoutMs = Number(process.env.XAI_VIDEO_POLL_TIMEOUT_MS ?? 600000);

  console.log('=== xAI video request-id diagnostic ===');
  console.log('prompt:', prompt);
  console.log('image: ', image);
  console.log();

  try {
    const result = await generateVideo({
      model: xai.video('grok-imagine-video'),
      prompt: { image, text: prompt },
      duration: 5,
      providerOptions: {
        xai: { pollTimeoutMs } satisfies XaiVideoModelOptions,
      },
    });

    const requestId = (
      result.providerMetadata?.xai as { requestId?: unknown } | undefined
    )?.requestId;

    console.log('OUTCOME: success');
    console.log(
      'providerMetadata:',
      JSON.stringify(result.providerMetadata, null, 2),
    );
    console.log();
    console.log(
      requestId
        ? `VERDICT: request_id FOUND on success → providerMetadata.xai.requestId = ${requestId}`
        : 'VERDICT: request_id MISSING on success (unexpected — check providerMetadata shape)',
    );
  } catch (error) {
    console.log('OUTCOME: error');
    dumpError(error);
    console.log();
    const recovered = recoverRequestId(error);
    console.log(
      recovered.value
        ? `VERDICT: request_id RECOVERABLE → "${recovered.value}" via ${recovered.source}`
        : 'VERDICT: request_id NOT RECOVERABLE from the thrown error (SDK must attach it)',
    );
  }
}

main().catch(err => {
  console.error('harness itself threw:', err);
  process.exitCode = 1;
});
