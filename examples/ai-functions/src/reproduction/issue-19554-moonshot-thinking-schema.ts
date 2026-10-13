import assert from 'node:assert/strict';
import { createMoonshotAI } from '../../../../packages/moonshotai/src/moonshotai-provider';
import type {
  MoonshotAIChatModelId,
  MoonshotAIProviderOptions,
} from '../../../../packages/moonshotai/src/moonshotai-chat-options';

const prompt = [
  {
    role: 'user' as const,
    content: [{ type: 'text' as const, text: 'Reply with OK.' }],
  },
];

const requestBodies: Array<Record<string, unknown>> = [];

const provider = createMoonshotAI({
  apiKey: 'test-api-key',
  fetch: async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)));

    return new Response(
      JSON.stringify({
        id: 'chatcmpl-reproduction',
        object: 'chat.completion',
        created: 1,
        model: 'test-model',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'OK' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
      }),
      { headers: { 'content-type': 'application/json' } },
    );
  },
});

async function serialize(
  modelId: MoonshotAIChatModelId,
  options: MoonshotAIProviderOptions,
) {
  requestBodies.length = 0;

  const result = await provider.chatModel(modelId).doGenerate({
    prompt,
    providerOptions: { moonshotai: options },
  });

  assert.equal(requestBodies.length, 1);

  return {
    body: requestBodies[0],
    warningText: result.warnings
      .map(warning =>
        warning.type === 'unsupported-setting'
          ? warning.details
          : warning.type === 'other'
            ? warning.message
            : JSON.stringify(warning),
      )
      .join('\n'),
  };
}

async function main() {
  {
    const { body, warningText } = await serialize('kimi-k2.7-code', {
      thinking: { type: 'disabled' },
    });
    assert.equal(body.thinking, undefined);
    assert.match(warningText, /Kimi K2\.7 thinking cannot be disabled/);
  }

  {
    const { body } = await serialize('kimi-k2.7-code-highspeed', {
      thinking: { type: 'enabled' },
    });
    assert.deepEqual(body.thinking, { type: 'enabled' });
  }

  {
    const { body, warningText } = await serialize('kimi-k3', {
      thinking: { type: 'disabled' },
    });
    assert.equal(body.thinking, undefined);
    assert.match(warningText, /Kimi K3 always reasons/);
  }

  {
    const { body, warningText } = await serialize('moonshot-v1-8k', {
      thinking: { type: 'enabled' },
    });
    assert.equal(body.thinking, undefined);
    assert.match(warningText, /thinking is not supported/);
  }

  for (const modelId of ['kimi-k2.6', 'moonshot-v1-8k'] as const) {
    const { body, warningText } = await serialize(modelId, {
      reasoningEffort: 'high',
    });
    assert.equal(body.reasoning_effort, undefined);
    assert.match(warningText, /reasoningEffort is only supported by Kimi K3/);
  }

  for (const reasoningEffort of ['low', 'high', 'max'] as const) {
    const { body } = await serialize('kimi-k3', { reasoningEffort });
    assert.equal(body.reasoning_effort, reasoningEffort);
    assert.equal(body.thinking, undefined);
  }

  {
    const { body, warningText } = await serialize('kimi-k2.6', {
      thinking: { type: 'enabled', budgetTokens: 2048 },
    });
    assert.deepEqual(body.thinking, { type: 'enabled' });
    assert.equal(body.budget_tokens, undefined);
    assert.match(warningText, /does not support budget_tokens/);
  }

  {
    const { body } = await serialize('kimi-k2.6', {
      reasoningHistory: 'preserved',
    });
    assert.deepEqual(body.thinking, { type: 'enabled', keep: 'all' });
  }

  {
    const { body, warningText } = await serialize('kimi-k2.5', {
      thinking: { type: 'disabled' },
      reasoningHistory: 'preserved',
    });
    assert.deepEqual(body.thinking, { type: 'disabled' });
    assert.match(warningText, /'preserved' is not supported/);
  }

  console.log(
    'Issue #19554 not reproduced: Moonshot request bodies match the model-specific reasoning and thinking schemas.',
  );
}

main().catch(error => {
  console.error(
    'Issue #19554 reproduced: Moonshot emitted a schema-invalid reasoning or thinking request.',
  );
  console.error(error);
  process.exitCode = 1;
});
