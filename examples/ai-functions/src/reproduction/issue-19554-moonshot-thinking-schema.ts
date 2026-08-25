import {
  createMoonshotAI,
  type MoonshotAIChatModelId,
} from '@ai-sdk/moonshotai';
import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';

type RequestBody = Record<string, any>;

const prompt: LanguageModelV4CallOptions['prompt'] = [
  {
    role: 'user',
    content: [{ type: 'text', text: 'Reply with OK.' }],
  },
];

async function captureRequest(
  modelId: MoonshotAIChatModelId,
  options: Omit<LanguageModelV4CallOptions, 'prompt'>,
) {
  let requestBody: RequestBody | undefined;

  const provider = createMoonshotAI({
    apiKey: 'reproduction-key',
    fetch: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));

      return new Response(
        JSON.stringify({
          id: 'chatcmpl-reproduction',
          object: 'chat.completion',
          created: 0,
          model: modelId,
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
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    },
  });

  const result = await provider.chatModel(modelId).doGenerate({
    prompt,
    ...options,
  });

  if (requestBody == null) {
    throw new Error('The Moonshot provider did not issue a request.');
  }

  return { body: requestBody, warnings: result.warnings };
}

async function main() {
  const violations: string[] = [];
  const check = (condition: boolean, message: string) => {
    if (!condition) {
      violations.push(message);
    }
  };

  const k27Disabled = await captureRequest('kimi-k2.7-code', {
    providerOptions: {
      moonshotai: { thinking: { type: 'disabled' } },
    },
  });
  check(
    k27Disabled.body.thinking?.type !== 'disabled',
    'K2.7 emitted thinking.type="disabled"',
  );
  check(
    k27Disabled.warnings.length > 0,
    'K2.7 did not warn about disabled thinking',
  );

  const k27Preserved = await captureRequest('kimi-k2.7-code', {
    providerOptions: {
      moonshotai: { reasoningHistory: 'preserved' },
    },
  });
  check(
    k27Preserved.body.thinking == null ||
      (k27Preserved.body.thinking.type === 'enabled' &&
        (k27Preserved.body.thinking.keep == null ||
          k27Preserved.body.thinking.keep === 'all')),
    'K2.7 emitted thinking.keep without the required thinking.type',
  );

  const k3Thinking = await captureRequest('kimi-k3', {
    providerOptions: {
      moonshotai: { thinking: { type: 'enabled' } },
    },
  });
  check(
    k3Thinking.body.thinking == null,
    'K3 emitted the unsupported thinking field',
  );
  check(
    k3Thinking.warnings.length > 0,
    'K3 did not warn about the unsupported thinking option',
  );

  const k3Preserved = await captureRequest('kimi-k3', {
    providerOptions: {
      moonshotai: { reasoningHistory: 'preserved' },
    },
  });
  check(
    k3Preserved.body.thinking == null,
    'K3 emitted thinking.keep for preserved reasoning history',
  );
  check(
    k3Preserved.warnings.length > 0,
    'K3 did not warn that preserved reasoning history is unsupported',
  );

  const v1Thinking = await captureRequest('moonshot-v1-8k', {
    providerOptions: {
      moonshotai: { thinking: { type: 'enabled' } },
    },
  });
  check(
    v1Thinking.body.thinking == null,
    'Moonshot V1 emitted the unsupported thinking field',
  );
  check(
    v1Thinking.warnings.length > 0,
    'Moonshot V1 did not warn about the unsupported thinking option',
  );

  const budgetTokens = await captureRequest('kimi-k2.6', {
    providerOptions: {
      moonshotai: {
        thinking: { type: 'enabled', budgetTokens: 2048 },
      },
    },
  });
  check(
    budgetTokens.body.thinking?.budget_tokens == null,
    'K2.6 emitted the non-standard thinking.budget_tokens field',
  );
  check(
    budgetTokens.warnings.length > 0,
    'K2.6 did not warn that budgetTokens is omitted',
  );

  const preservedK26 = await captureRequest('kimi-k2.6', {
    providerOptions: {
      moonshotai: { reasoningHistory: 'preserved' },
    },
  });
  check(
    preservedK26.body.thinking?.type === 'enabled' &&
      preservedK26.body.thinking?.keep === 'all',
    'K2.6 emitted thinking.keep without the required thinking.type',
  );

  const disabledK26 = await captureRequest('kimi-k2.6', {
    providerOptions: {
      moonshotai: { thinking: { type: 'disabled' } },
    },
  });
  check(
    disabledK26.body.thinking?.type === 'disabled',
    'K2.6 did not preserve its supported disabled thinking setting',
  );

  const enabledK25 = await captureRequest('kimi-k2.5', {
    providerOptions: {
      moonshotai: {
        thinking: { type: 'enabled' },
        reasoningHistory: 'preserved',
      },
    },
  });
  check(
    enabledK25.body.thinking?.type === 'enabled' &&
      enabledK25.body.thinking.keep == null,
    'K2.5 did not emit its supported thinking type without keep',
  );
  check(
    enabledK25.warnings.length > 0,
    'K2.5 did not warn that preserved reasoning history is unsupported',
  );

  const explicitUnsupportedEffort = await captureRequest('kimi-k2.6', {
    providerOptions: {
      moonshotai: { reasoningEffort: 'max' },
    },
  });
  check(
    explicitUnsupportedEffort.body.reasoning_effort == null,
    'K2.6 emitted reasoning_effort, which is only supported by K3',
  );
  check(
    explicitUnsupportedEffort.warnings.length > 0,
    'K2.6 did not warn about unsupported reasoningEffort',
  );

  const genericUnsupportedEffort = await captureRequest('kimi-k2.5', {
    reasoning: 'high',
  });
  check(
    genericUnsupportedEffort.body.reasoning_effort == null,
    'generic reasoning emitted reasoning_effort for K2.5',
  );
  check(
    genericUnsupportedEffort.warnings.length > 0,
    'K2.5 did not warn about unsupported generic reasoning',
  );

  const explicitPrecedence = await captureRequest('kimi-k3', {
    reasoning: 'low',
    providerOptions: {
      moonshotai: { reasoningEffort: 'high' },
    },
  });
  check(
    explicitPrecedence.body.reasoning_effort === 'high',
    'explicit K3 reasoningEffort did not deterministically override generic reasoning',
  );

  const supportedK3Effort = await captureRequest('kimi-k3', {
    reasoning: 'xhigh',
  });
  check(
    supportedK3Effort.body.reasoning_effort === 'max',
    'K3 did not map supported generic reasoning to reasoning_effort',
  );

  if (violations.length > 0) {
    throw new Error(
      `ISSUE_19554_REPRODUCED: Moonshot request serialization violates model schemas\n- ${violations.join(
        '\n- ',
      )}`,
    );
  }

  console.log('Moonshot thinking and reasoning requests match model schemas.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
