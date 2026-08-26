import { MockLanguageModelV4 } from 'ai/test';
import { generateText, jsonSchema, streamText, tool } from 'ai';
import {
  normalizeOpaDecision,
  opaPolicy,
} from '../../../../packages/policy-opa/dist/index.js';

const reason = 'kubectl deletion requires SRE review';

const usage = {
  inputTokens: {
    total: 3,
    noCache: 3,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: undefined,
  },
};

const tools = {
  kubectl: tool({
    inputSchema: jsonSchema<{ resource: string }>({
      type: 'object',
      properties: {
        resource: { type: 'string' },
      },
      required: ['resource'],
      additionalProperties: false,
    }),
  }),
};

function createToolApproval() {
  return opaPolicy({
    client: {
      evaluate: async () =>
        ({
          decision: 'requires-approval',
          reason,
        }) as never,
    },
    path: 'agent/call/decision',
  });
}

function getReason(value: unknown): unknown {
  return value == null ? undefined : (value as Record<string, unknown>).reason;
}

async function getGenerateRequest() {
  const result = await generateText({
    model: new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [
          {
            type: 'tool-call',
            toolCallId: 'generate-call',
            toolName: 'kubectl',
            input: '{"resource":"pod"}',
          },
        ],
        finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
        usage,
        warnings: [],
      }),
    }),
    tools,
    toolApproval: createToolApproval(),
    prompt: 'Delete the pod.',
  });

  return result.content.find(part => part.type === 'tool-approval-request');
}

async function getStreamRequest() {
  const result = streamText({
    model: new MockLanguageModelV4({
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] });
            controller.enqueue({
              type: 'tool-input-start',
              id: 'stream-call',
              toolName: 'kubectl',
            });
            controller.enqueue({
              type: 'tool-input-delta',
              id: 'stream-call',
              delta: '{"resource":"pod"}',
            });
            controller.enqueue({
              type: 'tool-input-end',
              id: 'stream-call',
            });
            controller.enqueue({
              type: 'tool-call',
              toolCallId: 'stream-call',
              toolName: 'kubectl',
              input: '{"resource":"pod"}',
            });
            controller.enqueue({
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
              usage,
            });
            controller.close();
          },
        }),
      }),
    }),
    tools,
    toolApproval: createToolApproval(),
    prompt: 'Delete the pod.',
  });

  for await (const part of result.fullStream) {
    if (part.type === 'tool-approval-request') {
      return part;
    }
  }

  return undefined;
}

async function main() {
  const normalized = normalizeOpaDecision({
    decision: 'requires-approval',
    reason,
  });
  const generateRequest = await getGenerateRequest();
  const streamRequest = await getStreamRequest();

  if (generateRequest == null || streamRequest == null) {
    throw new Error('Expected generateText and streamText approval requests.');
  }

  const missingReasonPaths = [
    getReason(generateRequest) === reason ? undefined : 'generateText',
    getReason(streamRequest) === reason ? undefined : 'streamText',
  ].filter((path): path is string => path != null);

  if (missingReasonPaths.length > 0) {
    console.error(
      `ISSUE_19654_REPRODUCED: human approval request is missing the documented policy reason in ${missingReasonPaths.join(
        ' and ',
      )}.`,
    );
    console.error(
      JSON.stringify(
        {
          policyDecision: normalized,
          generateRequest,
          streamRequest,
          expectedReason: reason,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'Issue #19654 is fixed: both human approval requests contain the policy reason.',
  );
}

main().catch(error => {
  console.error('Unexpected reproduction failure:', error);
  process.exitCode = 2;
});
