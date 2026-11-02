import { createGoogle } from '@ai-sdk/google';
import { createGoogleVertex } from '@ai-sdk/google-vertex';
import { generateText, jsonSchema, streamText } from 'ai';

// Synthetic, spec-shaped response: no model request, credentials, or .env needed.
const parts = [
  { text: 'A' },
  {
    functionCall: { id: 'call-1', name: 'lookup', args: { query: 'example' } },
    thoughtSignature: 'c3ludGhldGljLXNpZ25hdHVyZQ==',
  },
  { text: '', thoughtSignature: 'ZW1wdHktdGV4dC1zaWduYXR1cmU=' },
  { text: 'B' },
];

const sse = `data: ${JSON.stringify({
  candidates: [
    { content: { role: 'model', parts }, finishReason: 'STOP', index: 0 },
  ],
  usageMetadata: {
    promptTokenCount: 1,
    candidatesTokenCount: 2,
    totalTokenCount: 3,
  },
})}\n\n`;

const requests: Array<{ contents: unknown }> = [];
const localFetch: typeof fetch = async (_url, init) => {
  requests.push(JSON.parse(init?.body as string));
  return requests.length === 1
    ? new Response(sse, {
        headers: { 'content-type': 'text/event-stream' },
      })
    : Response.json({
        candidates: [
          {
            content: { role: 'model', parts: [{ text: 'Done' }] },
            finishReason: 'STOP',
            index: 0,
          },
        ],
      });
};

const models = [
  {
    provider: 'google',
    model: createGoogle({ apiKey: 'dummy-key', fetch: localFetch })(
      'gemini-2.5-flash',
    ),
  },
  {
    provider: 'google-vertex',
    model: createGoogleVertex({ apiKey: 'dummy-key', fetch: localFetch })(
      'gemini-2.5-flash',
    ),
  },
];

for (const { provider, model } of models) {
  requests.length = 0;
  const tools = {
    lookup: {
      inputSchema: jsonSchema<{ query: string }>({
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
        additionalProperties: false,
      }),
    },
  };
  const result = streamText({
    model,
    prompt: 'Synthetic order reproduction',
    tools,
  });

  const sdkEvents = [];
  for await (const event of result.stream) {
    sdkEvents.push(event);
  }
  const step = await result.finalStep;
  await generateText({
    model,
    tools,
    messages: [
      { role: 'user', content: 'Synthetic order reproduction' },
      ...step.response.messages,
      {
        role: 'tool',
        content: step.toolCalls.map(call => ({
          type: 'tool-result',
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          output: { type: 'json', value: { answer: 'example' } },
        })),
      },
      { role: 'user', content: 'Continue' },
    ],
  });

  console.log(
    JSON.stringify(
      {
        provider,
        inputParts: parts,
        sdkEvents,
        finalContent: step.content,
        responseMessages: step.response.messages,
        followUpContents: requests[1].contents,
      },
      null,
      2,
    ),
  );
}
