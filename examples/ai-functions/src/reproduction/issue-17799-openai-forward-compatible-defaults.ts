import { createOpenAI } from '@ai-sdk/openai';
import { generateImage, generateText } from 'ai';

type JsonObject = Record<string, any>;

const requests: Array<{ url: string; body: JsonObject }> = [];
const provider = createOpenAI({
  apiKey: 'test-api-key',
  fetch: async (input, init) => {
    const url = String(input);
    const body =
      typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;

    requests.push({ url, body });

    if (url.endsWith('/chat/completions')) {
      return Response.json({
        id: 'chatcmpl_issue_17799',
        object: 'chat.completion',
        created: 1,
        model: body.model,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'ok' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
      });
    }

    if (url.endsWith('/responses')) {
      return Response.json({
        id: 'resp_issue_17799',
        object: 'response',
        created_at: 1,
        status: 'completed',
        model: body.model,
        output: [
          {
            id: 'msg_issue_17799',
            type: 'message',
            status: 'completed',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                annotations: [],
                logprobs: [],
                text: 'ok',
              },
            ],
          },
        ],
        usage: {
          input_tokens: 1,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: 1,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 2,
        },
      });
    }

    if (url.endsWith('/images/generations')) {
      return Response.json({
        created: 1,
        data: Array.from({ length: body.n }, (_, index) => ({
          b64_json: `image-${index}`,
        })),
      });
    }

    throw new Error(`Unexpected URL: ${url}`);
  },
});

function takeRequests(): Array<{ url: string; body: JsonObject }> {
  return requests.splice(0);
}

async function captureChatRequest({
  modelId,
  reasoningEffort,
  serviceTier,
}: {
  modelId: string;
  reasoningEffort?: 'none';
  serviceTier?: 'flex' | 'priority';
}) {
  await generateText({
    model: provider.chat(modelId),
    system: 'Follow the instructions.',
    prompt: 'Say ok.',
    maxOutputTokens: 64,
    temperature: 0.2,
    topP: 0.8,
    frequencyPenalty: 0.1,
    presencePenalty: 0.1,
    providerOptions: {
      openai: {
        reasoningEffort,
        serviceTier,
        logitBias: { '1': 1 },
        logprobs: 2,
      },
    },
  });

  return takeRequests()[0].body;
}

async function captureResponsesRequest({
  modelId,
  serviceTier,
}: {
  modelId: string;
  serviceTier: 'flex' | 'priority';
}) {
  await generateText({
    model: provider.responses(modelId),
    system: 'Follow the instructions.',
    prompt: 'Say ok.',
    maxOutputTokens: 64,
    temperature: 0.2,
    topP: 0.8,
    providerOptions: {
      openai: {
        reasoningEffort: 'medium',
        serviceTier,
      },
    },
  });

  return takeRequests()[0].body;
}

async function captureImageRequests(modelId: string) {
  const model = provider.image(modelId);

  await generateImage({
    model,
    prompt: 'A black square.',
    n: 2,
  });

  return {
    maxImagesPerCall:
      typeof model.maxImagesPerCall === 'function'
        ? await model.maxImagesPerCall({ modelId })
        : model.maxImagesPerCall,
    requests: takeRequests().map(request => request.body),
  };
}

function check(failures: string[], condition: boolean, message: string): void {
  if (!condition) {
    failures.push(message);
  }
}

function checkReasoningChatRequest(
  failures: string[],
  modelId: string,
  body: JsonObject,
): void {
  check(
    failures,
    body.messages[0]?.role === 'developer',
    `${modelId}: system instructions used ${body.messages[0]?.role} instead of developer`,
  );
  check(
    failures,
    body.max_completion_tokens === 64 && body.max_tokens == null,
    `${modelId}: maxOutputTokens was not remapped to max_completion_tokens`,
  );

  for (const parameter of [
    'temperature',
    'top_p',
    'frequency_penalty',
    'presence_penalty',
    'logit_bias',
    'logprobs',
    'top_logprobs',
  ]) {
    check(
      failures,
      body[parameter] == null,
      `${modelId}: unsupported reasoning parameter ${parameter} was sent`,
    );
  }
}

async function main() {
  const failures: string[] = [];

  const currentGpt = await captureChatRequest({ modelId: 'gpt-5.6' });
  checkReasoningChatRequest(failures, 'gpt-5.6', currentGpt);

  const nextOSeries = await captureChatRequest({ modelId: 'o5' });
  checkReasoningChatRequest(failures, 'o5', nextOSeries);

  const nextGptMajor = await captureChatRequest({
    modelId: 'gpt-6',
    serviceTier: 'flex',
  });
  checkReasoningChatRequest(failures, 'gpt-6', nextGptMajor);
  check(
    failures,
    nextGptMajor.service_tier === 'flex',
    'gpt-6: requested flex service tier was stripped',
  );

  const nextGptMinorWithNoReasoning = await captureChatRequest({
    modelId: 'gpt-5.7',
    reasoningEffort: 'none',
  });
  for (const parameter of ['temperature', 'top_p', 'logprobs']) {
    check(
      failures,
      nextGptMinorWithNoReasoning[parameter] != null,
      `gpt-5.7: supported ${parameter} was stripped with reasoningEffort none`,
    );
  }

  const nextGptPriority = await captureChatRequest({
    modelId: 'gpt-6',
    serviceTier: 'priority',
  });
  check(
    failures,
    nextGptPriority.service_tier === 'priority',
    'gpt-6: requested priority service tier was stripped',
  );

  const responsesFlex = await captureResponsesRequest({
    modelId: 'gpt-6',
    serviceTier: 'flex',
  });
  check(
    failures,
    responsesFlex.input[0]?.role === 'developer',
    `gpt-6 Responses API: system instructions used ${responsesFlex.input[0]?.role} instead of developer`,
  );
  check(
    failures,
    responsesFlex.temperature == null && responsesFlex.top_p == null,
    'gpt-6 Responses API: unsupported reasoning sampling parameters were sent',
  );
  check(
    failures,
    responsesFlex.service_tier === 'flex',
    'gpt-6 Responses API: requested flex service tier was stripped',
  );

  const responsesPriority = await captureResponsesRequest({
    modelId: 'gpt-6',
    serviceTier: 'priority',
  });
  check(
    failures,
    responsesPriority.service_tier === 'priority',
    'gpt-6 Responses API: requested priority service tier was stripped',
  );

  const currentImage = await captureImageRequests('gpt-image-2');
  check(
    failures,
    currentImage.maxImagesPerCall === 10 &&
      currentImage.requests.length === 1 &&
      currentImage.requests[0].response_format == null,
    'gpt-image-2 comparison did not retain its known GPT Image behavior',
  );

  const nextImage = await captureImageRequests('gpt-image-3');
  check(
    failures,
    nextImage.maxImagesPerCall === 10,
    `gpt-image-3: maxImagesPerCall was ${nextImage.maxImagesPerCall} instead of 10`,
  );
  check(
    failures,
    nextImage.requests.length === 1,
    `gpt-image-3: generating 2 images was split into ${nextImage.requests.length} calls`,
  );
  check(
    failures,
    nextImage.requests.every(body => body.response_format == null),
    'gpt-image-3: rejected response_format parameter was sent',
  );

  const fineTuned = await captureChatRequest({
    modelId: 'ft:gpt-6:org:custom:abc123',
  });
  check(
    failures,
    fineTuned.messages[0]?.role === 'system' &&
      fineTuned.max_tokens === 64 &&
      fineTuned.temperature === 0.2,
    'fine-tuned model id did not retain conservative legacy behavior',
  );

  const custom = await captureChatRequest({ modelId: 'acme-gpt-6-proxy' });
  check(
    failures,
    custom.messages[0]?.role === 'system' &&
      custom.max_tokens === 64 &&
      custom.temperature === 0.2,
    'custom proxy model id did not retain conservative legacy behavior',
  );

  const customImage = await captureImageRequests('acme-image-model');
  check(
    failures,
    customImage.maxImagesPerCall === 1 &&
      customImage.requests.length === 2 &&
      customImage.requests.every(body => body.response_format === 'b64_json'),
    'custom image model id did not retain conservative legacy behavior',
  );

  console.log(
    JSON.stringify(
      {
        expected:
          'Recognizable future OpenAI model-family ids inherit current family behavior while fine-tuned and custom ids remain conservative.',
        failures,
        observed: {
          currentGpt,
          nextOSeries,
          nextGptMajor,
          nextGptMinorWithNoReasoning,
          nextGptPriority,
          responsesFlex,
          responsesPriority,
          currentImage,
          nextImage,
          fineTuned,
          custom,
          customImage,
        },
      },
      null,
      2,
    ),
  );

  if (failures.length > 0) {
    throw new Error(
      'Reproduced issue #17799: forward-compatible OpenAI defaults are not applied to future model IDs.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
