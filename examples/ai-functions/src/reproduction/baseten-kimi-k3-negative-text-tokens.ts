import { createBaseten } from '@ai-sdk/baseten';
import { generateText, streamText } from 'ai';

/**
 * Repro: negative `usage.outputTokens.text` from baseten Kimi-K3.
 *
 * Observed in AI Gateway logs (AI_GATEWAY_REQUEST fact, requestApiFormat
 * 'openai-compat', provider 'baseten', model 'moonshotai/kimi-k3',
 * finishReason 'length', non-streaming):
 *
 *   inputTokens: 951, outputTokens: -1, reasoningTokens: 6001
 *
 * Baseten's usage for that request was internally inconsistent:
 *
 *   completion_tokens: 6000
 *   completion_tokens_details.reasoning_tokens: 6001
 *   total_tokens: 6952  (= 951 prompt + 6001 reasoning)
 *
 * The model spent its whole budget reasoning and hit the length stop before
 * emitting any text, and Baseten's completion_tokens undercounts the actual
 * generation by one. `convertOpenAICompatibleChatUsage` computes
 * `text = completion_tokens - reasoning_tokens`, which yields -1. Downstream,
 * the gateway's usage-fact schema requires outputTokens >= 0, so the fact was
 * rejected and the request's usage/billing record was dropped.
 *
 * This example replays the incident payload through a mock fetch for both the
 * generate and stream paths. Exit code 1 = bug reproduced, 0 = fixed.
 */

const incidentUsage = {
  prompt_tokens: 951,
  completion_tokens: 6000,
  total_tokens: 6952,
  prompt_tokens_details: { cached_tokens: 60 },
  completion_tokens_details: { reasoning_tokens: 6001 },
};

const incidentResponseBody = {
  id: 'chatcmpl-repro',
  object: 'chat.completion',
  created: 1786259438,
  model: 'moonshotai/Kimi-K3',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: '',
        reasoning_content: 'Let me think about this step by step...',
      },
      finish_reason: 'length',
    },
  ],
  usage: incidentUsage,
};

const incidentStreamBody = [
  // reasoning delta
  `data: ${JSON.stringify({
    id: 'chatcmpl-repro',
    object: 'chat.completion.chunk',
    created: 1786259438,
    model: 'moonshotai/Kimi-K3',
    choices: [
      {
        index: 0,
        delta: {
          role: 'assistant',
          reasoning_content: 'Let me think about this step by step...',
        },
        finish_reason: null,
      },
    ],
  })}`,
  // final chunk: finish_reason + usage (stream_options.include_usage)
  `data: ${JSON.stringify({
    id: 'chatcmpl-repro',
    object: 'chat.completion.chunk',
    created: 1786259438,
    model: 'moonshotai/Kimi-K3',
    choices: [{ index: 0, delta: {}, finish_reason: 'length' }],
    usage: incidentUsage,
  })}`,
  'data: [DONE]',
  '',
].join('\n\n');

function mockFetch(body: string, streaming: boolean) {
  return async (): Promise<Response> =>
    new Response(body, {
      status: 200,
      headers: {
        'content-type': streaming ? 'text/event-stream' : 'application/json',
      },
    });
}

async function checkGenerate(): Promise<boolean> {
  const baseten = createBaseten({
    apiKey: 'repro-key',
    fetch: mockFetch(JSON.stringify(incidentResponseBody), false),
  });

  const result = await generateText({
    model: baseten('moonshotai/Kimi-K3'),
    prompt: 'Think hard, then answer.',
  });

  console.log('generateText usage:', JSON.stringify(result.usage, null, 2));
  const text = result.usage.outputTokenDetails?.textTokens;
  console.log(`generateText textTokens = ${text}`);
  return text != null && text >= 0;
}

async function checkStream(): Promise<boolean> {
  const baseten = createBaseten({
    apiKey: 'repro-key',
    fetch: mockFetch(incidentStreamBody, true),
  });

  const result = streamText({
    model: baseten('moonshotai/Kimi-K3'),
    prompt: 'Think hard, then answer.',
  });

  // drain the stream
  for await (const _ of result.fullStream) {
    void _;
  }

  const usage = await result.usage;
  console.log('streamText usage:', JSON.stringify(usage, null, 2));
  const text = usage.outputTokenDetails?.textTokens;
  console.log(`streamText textTokens = ${text}`);
  return text != null && text >= 0;
}

async function main() {
  const generateOk = await checkGenerate();
  const streamOk = await checkStream();

  if (!generateOk || !streamOk) {
    console.error(
      '\nBUG REPRODUCED: outputTokens.text is negative ' +
        '(completion_tokens < completion_tokens_details.reasoning_tokens).',
    );
    process.exit(1);
  }

  console.log(
    '\nOK: outputTokens.text is clamped at 0 for inconsistent usage.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
