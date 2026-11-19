import { anthropicModelCapabilities } from '@ai-sdk/anthropic';
import { run } from '../../lib/run';

run(async () => {
  const model = anthropicModelCapabilities('claude-opus-5');
  console.dir(model, { depth: null });
  console.log(
    'Adaptive thinking:',
    model?.endpoints.messages?.capabilities.reasoning.adaptive,
  );
});
