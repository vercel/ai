import { createOpenAI } from '@ai-sdk/openai';
import {
  OpenAIChatLanguageModel,
  OpenAIResponsesLanguageModel,
} from '@ai-sdk/openai/internal';
import { APICallError } from 'ai';
import { parseJSON, safeParseJSON } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  APIProbeError,
  display,
  matchesRequest,
  type Probe,
  type Reporter,
} from './audit';

export async function checkLive(
  modelId: string,
  probe: Probe,
  report: Reporter,
  fetchAPI: typeof fetch = fetch,
) {
  let sent = false;
  let encodingNote = '';
  const guardedFetch: typeof fetch = async (url, init) => {
    if (!matchesRequest(init?.body, probe.sent))
      throw new Error(
        'SDK omitted a required setting or context; API support was not tested.',
      );
    if (typeof init?.body === 'string') {
      const body = await parseJSON({
        text: init.body,
        schema: z.object({
          model: z.string().optional(),
          session: z.object({ model: z.string().optional() }).optional(),
        }),
      });
      if ((body.model ?? body.session?.model) !== modelId)
        throw new Error('SDK probe would call the wrong model.');
    }
    if (init?.body instanceof FormData && init.body.get('model') !== modelId)
      throw new Error('SDK probe would call the wrong model.');
    sent = true;
    return fetchAPI(url, init);
  };
  try {
    let observed: boolean | number | string;
    try {
      observed = await probe.execute(createOpenAI({ fetch: guardedFetch }));
    } catch (error) {
      if (sent || !probe.encodingModelId || probe.encodingModelId === modelId)
        throw error;
      // The target catalog is what we are auditing. Its negative declarations
      // must not prevent asking the API. These SDK adapters separate encoding
      // policy (modelId) from the actual API target (requestModelId). Every
      // capability still comes from a normal SDK setting, never patched JSON.
      const baseURL = (
        process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'
      ).replace(/\/$/, '');
      const config = {
        requestModelId: modelId,
        baseURL,
        url: ({ path }: { path: string }) => `${baseURL}${path}`,
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        fetch: guardedFetch,
      };
      const sdk = createOpenAI({ fetch: guardedFetch });
      sdk.responses = () =>
        new OpenAIResponsesLanguageModel(probe.encodingModelId!, {
          ...config,
          provider: 'openai.responses',
        });
      sdk.chat = () =>
        new OpenAIChatLanguageModel(probe.encodingModelId!, {
          ...config,
          provider: 'openai.chat',
        });
      encodingNote = `; SDK encoding policy=${probe.encodingModelId}, API target=${modelId}`;
      observed = await probe.execute(sdk);
    }
    report(
      typeof probe.expected === 'number' || probe.compare === 'value'
        ? observed === probe.expected
          ? 'MATCH'
          : 'MISMATCH'
        : !observed ||
            probe.expected === 'unknown' ||
            typeof probe.expected === 'object'
          ? 'UNVERIFIED'
          : probe.expected === false
            ? 'MISMATCH'
            : 'MATCH',
      modelId,
      `live/${probe.name}`,
      `catalog=${display(probe.expected)}; API=accepted; ${typeof observed !== 'boolean' ? `observed=${display(observed)}` : `expected output=${observed ? 'observed' : 'missing'}`}${encodingNote}`,
    );
  } catch (error) {
    const parsed =
      APICallError.isInstance(error) && error.responseBody
        ? await safeParseJSON({
            text: error.responseBody,
            schema: z.object({
              error: z.object({ param: z.string().nullish() }).nullish(),
            }),
          })
        : undefined;
    const parameter = parsed?.success ? parsed.value?.error?.param : undefined;
    const remote =
      APICallError.isInstance(error) || error instanceof APIProbeError;
    const rejection = remote
      ? `${error.message} ${error instanceof APIProbeError ? (error.parameter ?? '') : typeof parameter === 'string' ? parameter : ''}`
      : '';
    const rejected =
      (sent || error instanceof APIProbeError) &&
      remote &&
      [400, 422].includes(error.statusCode ?? 0) &&
      /unsupported|not supported|does not support|not available|only supported|not allowed|must be|must not|cannot|maximum|at most|less than or equal|expected.*(?:<=|between|one of)/i.test(
        error.message,
      ) &&
      probe.parameter != null &&
      new RegExp(probe.parameter.source, 'i').test(rejection);
    report(
      rejected && typeof probe.expected === 'boolean'
        ? probe.expected
          ? 'MISMATCH'
          : 'MATCH'
        : 'UNVERIFIED',
      modelId,
      `live/${probe.name}`,
      `catalog=${display(probe.expected)}; ${String(error)}${encodingNote}`,
    );
  }
}
