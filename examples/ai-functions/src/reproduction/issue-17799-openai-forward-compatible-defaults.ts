import { generateImage } from '../../../../packages/ai/src/generate-image/generate-image';
import { createOpenAI } from '../../../../packages/openai/src/openai-provider';

type JsonObject = Record<string, unknown>;

const requests: JsonObject[] = [];

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=';

const fetchMock = async (
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> => {
  const body = JSON.parse(String(init?.body)) as JsonObject;
  requests.push(body);

  const url = String(input);

  if (url.endsWith('/chat/completions')) {
    return Response.json({
      id: 'chatcmpl-reproduction',
      object: 'chat.completion',
      created: 0,
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
      id: 'resp_reproduction',
      object: 'response',
      created_at: 0,
      status: 'completed',
      error: null,
      incomplete_details: null,
      instructions: null,
      max_output_tokens: null,
      model: body.model,
      output: [
        {
          id: 'msg_reproduction',
          type: 'message',
          status: 'completed',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'ok',
              annotations: [],
            },
          ],
        },
      ],
      parallel_tool_calls: true,
      previous_response_id: null,
      reasoning: { effort: null, summary: null },
      store: true,
      temperature: 1,
      text: { format: { type: 'text' } },
      tool_choice: 'auto',
      tools: [],
      top_p: 1,
      truncation: 'disabled',
      usage: {
        input_tokens: 1,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 1,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 2,
      },
      metadata: {},
    });
  }

  const n = Number(body.n);
  return Response.json({
    created: 0,
    data: Array.from({ length: n }, () => ({ b64_json: png })),
  });
};

const openai = createOpenAI({
  apiKey: 'reproduction-key',
  fetch: fetchMock,
});

const prompt = [
  { role: 'system' as const, content: 'Be concise.' },
  {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: 'Reply OK.' }],
  },
];

async function captureChat(
  modelId: string,
  serviceTier: 'flex' | 'priority',
  reasoningEffort?: 'none',
): Promise<JsonObject> {
  const start = requests.length;

  await openai.chat(modelId).doGenerate({
    prompt,
    maxOutputTokens: 16,
    temperature: 0.2,
    topP: 0.8,
    frequencyPenalty: 0.1,
    presencePenalty: 0.1,
    providerOptions: {
      openai: {
        logitBias: { 1: -1 },
        logprobs: true,
        reasoningEffort,
        serviceTier,
      },
    },
  });

  return requests[start];
}

async function captureResponses(
  modelId: string,
  serviceTier: 'flex' | 'priority',
): Promise<JsonObject> {
  const start = requests.length;

  await openai.responses(modelId).doGenerate({
    prompt,
    maxOutputTokens: 16,
    temperature: 0.2,
    topP: 0.8,
    providerOptions: {
      openai: {
        reasoningEffort: 'none',
        serviceTier,
      },
    },
  });

  return requests[start];
}

function messageRole(body: JsonObject): unknown {
  return (body.messages as JsonObject[])[0]?.role;
}

async function main() {
  const o4Chat = await captureChat('o4', 'flex');
  const o5Chat = await captureChat('o5', 'flex');
  const gpt6Chat = await captureChat('gpt-6', 'priority');
  const gpt56Chat = await captureChat('gpt-5.6', 'priority', 'none');
  const gpt57Chat = await captureChat('gpt-5.7', 'priority', 'none');
  const o5Responses = await captureResponses('o5', 'flex');
  const gpt6Responses = await captureResponses('gpt-6', 'priority');
  const gpt56Responses = await captureResponses('gpt-5.6', 'priority');
  const gpt57Responses = await captureResponses('gpt-5.7', 'priority');
  const customChat = await captureChat('custom/proxy', 'priority');
  const fineTunedChat = await captureChat('ft:gpt-4o:org:model', 'priority');

  const image3 = openai.image('gpt-image-3');
  const imageRequestStart = requests.length;
  await generateImage({
    model: image3,
    prompt: 'A red dot',
    n: 2,
    maxRetries: 0,
  });
  const image3Requests = requests.slice(imageRequestStart);

  const image2 = openai.image('gpt-image-2');
  const image2RequestStart = requests.length;
  await generateImage({
    model: image2,
    prompt: 'A blue dot',
    n: 2,
    maxRetries: 0,
  });
  const image2Requests = requests.slice(image2RequestStart);

  const observations = {
    reasoning: {
      o4: {
        role: messageRole(o4Chat),
        temperatureStripped: o4Chat.temperature == null,
        maxCompletionTokens: o4Chat.max_completion_tokens,
      },
      o5: {
        role: messageRole(o5Chat),
        temperatureStripped: o5Chat.temperature == null,
        maxCompletionTokens: o5Chat.max_completion_tokens,
      },
      gpt6: {
        role: messageRole(gpt6Chat),
        temperatureStripped: gpt6Chat.temperature == null,
        maxCompletionTokens: gpt6Chat.max_completion_tokens,
      },
    },
    knownGpt56ReasoningNone: {
      chatTemperature: gpt56Chat.temperature ?? null,
      chatTopP: gpt56Chat.top_p ?? null,
      chatLogprobs: gpt56Chat.logprobs ?? null,
      responsesTemperature: gpt56Responses.temperature ?? null,
      responsesTopP: gpt56Responses.top_p ?? null,
    },
    serviceTiers: {
      o5Chat: o5Chat.service_tier ?? null,
      gpt6Chat: gpt6Chat.service_tier ?? null,
      o5Responses: o5Responses.service_tier ?? null,
      gpt6Responses: gpt6Responses.service_tier ?? null,
    },
    gpt57ReasoningNone: {
      chatTemperature: gpt57Chat.temperature ?? null,
      chatTopP: gpt57Chat.top_p ?? null,
      chatLogprobs: gpt57Chat.logprobs ?? null,
      responsesTemperature: gpt57Responses.temperature ?? null,
      responsesTopP: gpt57Responses.top_p ?? null,
    },
    images: {
      gptImage3MaxImagesPerCall: image3.maxImagesPerCall,
      gptImage3RequestCount: image3Requests.length,
      gptImage3ResponseFormat: image3Requests[0]?.response_format ?? null,
      gptImage2MaxImagesPerCall: image2.maxImagesPerCall,
      gptImage2RequestCount: image2Requests.length,
      gptImage2ResponseFormat: image2Requests[0]?.response_format ?? null,
    },
    conservativeUnknownIds: {
      customRole: messageRole(customChat),
      customTemperature: customChat.temperature ?? null,
      fineTunedRole: messageRole(fineTunedChat),
      fineTunedTemperature: fineTunedChat.temperature ?? null,
    },
  };

  console.log(JSON.stringify(observations, null, 2));

  const failures: string[] = [];

  if (o5Chat.service_tier !== 'flex' || o5Responses.service_tier !== 'flex') {
    failures.push('o5 requested flex tier was stripped');
  }
  if (
    gpt6Chat.service_tier !== 'priority' ||
    gpt6Responses.service_tier !== 'priority'
  ) {
    failures.push('gpt-6 requested priority tier was stripped');
  }
  if (
    gpt57Chat.temperature !== 0.2 ||
    gpt57Chat.top_p !== 0.8 ||
    gpt57Chat.logprobs !== true ||
    gpt57Responses.temperature !== 0.2 ||
    gpt57Responses.top_p !== 0.8
  ) {
    failures.push(
      'gpt-5.7 reasoningEffort none silently stripped supported sampling parameters',
    );
  }
  if (
    image3.maxImagesPerCall !== 10 ||
    image3Requests.length !== 1 ||
    image3Requests[0]?.response_format != null
  ) {
    failures.push(
      'gpt-image-3 sent rejected response_format and split two images into two requests',
    );
  }

  if (failures.length > 0) {
    throw new Error(`Issue 17799 reproduced: ${failures.join('; ')}`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
