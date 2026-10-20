import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { createModelIdAliasFetch } from '../../lib/create-model-id-alias-fetch';
import { run } from '../../lib/run';

const modelId = 'claude-opus-5-5';
const aliasModelId = process.env.ANTHROPIC_EARLY_ACCESS_MODEL_ID;

if (aliasModelId == null) {
  throw new Error('ANTHROPIC_EARLY_ACCESS_MODEL_ID must be set.');
}

const anthropic = createAnthropic({
  fetch: createModelIdAliasFetch({ modelId, aliasModelId }),
});

run(async () => {
  const result = await generateText({
    // Use the canonical ID so the SDK applies its known capability checks.
    model: anthropic(modelId),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(result.text);
});
