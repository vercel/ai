import { expectTypeOf, it } from 'vitest';
import {
  createQuiverAI,
  type QuiverAILanguageModelOptions,
  type QuiverAILanguageModelId,
} from '.';

it('exposes typed language models, options, and custom tools', () => {
  const provider = createQuiverAI({ apiKey: 'test' });
  const modelId = 'arrow-2-telos' satisfies QuiverAILanguageModelId;

  expectTypeOf(provider(modelId)).toEqualTypeOf(
    provider.languageModel(modelId),
  );

  const options = {
    reasoningEffort: 'xhigh',
    reasoningSummary: 'auto',
  } satisfies QuiverAILanguageModelOptions;
  expectTypeOf(options.reasoningEffort).toEqualTypeOf<'xhigh'>();

  const customTool = provider.tools.customTool({
    description: 'Return SVG source',
    format: { type: 'text' },
    execute: async input => input.length,
  });
  expectTypeOf(customTool.execute).not.toBeUndefined();
});
