import assert from 'node:assert/strict';
import { generateText, jsonSchema, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

type LookupContext = {
  locale: string;
};

const rawContext: LookupContext = { locale: 'en-us' };
const normalizedContext: LookupContext = { locale: 'EN-US' };
const normalizedDescription = 'Look up entries for EN-US';

class ReproducedBugError extends Error {}

async function main() {
  let describedContext: LookupContext | undefined;
  let executedContext: LookupContext | undefined;
  let sentDescription: string | undefined;

  const model = new MockLanguageModelV4({
    doGenerate: async ({ tools }) => {
      const lookupTool = tools?.find(
        candidate =>
          candidate.type === 'function' && candidate.name === 'lookup',
      );

      assert.ok(lookupTool, 'lookup tool was not sent to the model');
      assert.equal(lookupTool.type, 'function');
      sentDescription = lookupTool.description;

      return {
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'lookup',
            input: '{}',
          },
        ],
        warnings: [],
        finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
        usage: {
          inputTokens: {
            total: 1,
            noCache: 1,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: 1,
            text: undefined,
            reasoning: undefined,
          },
        },
      };
    },
  });

  await generateText({
    model,
    prompt: 'test',
    maxRetries: 0,
    toolsContext: { lookup: rawContext },
    tools: {
      lookup: tool({
        inputSchema: jsonSchema({ type: 'object' }),
        contextSchema: jsonSchema<LookupContext>(
          {
            type: 'object',
            properties: { locale: { type: 'string' } },
            required: ['locale'],
          },
          {
            validate: value => {
              assert.ok(
                typeof value === 'object' &&
                  value != null &&
                  'locale' in value &&
                  typeof value.locale === 'string',
                'context validator received an invalid value',
              );
              return {
                success: true,
                value: { locale: value.locale.toUpperCase() },
              };
            },
          },
        ),
        description: ({ context }) => {
          describedContext = context;
          return `Look up entries for ${context.locale}`;
        },
        execute: async (_, { context }) => {
          executedContext = context;
          return 'ok';
        },
      }),
    },
  });

  assert.deepEqual(
    executedContext,
    normalizedContext,
    'execute did not receive schema-normalized context',
  );

  if (
    describedContext?.locale !== normalizedContext.locale ||
    sentDescription !== normalizedDescription
  ) {
    throw new ReproducedBugError(
      'ISSUE_22884_REPRODUCED: dynamic tool description used raw context while execute used schema-normalized context',
    );
  }

  assert.deepEqual(
    describedContext,
    executedContext,
    'description and execute must receive the same normalized context',
  );
  assert.equal(
    sentDescription,
    normalizedDescription,
    'the model must receive a description built from normalized context',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
