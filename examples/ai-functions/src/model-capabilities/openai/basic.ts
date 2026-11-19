import { openaiModelCapabilities } from '@ai-sdk/openai';
import { run } from '../../lib/run';

run(async () => {
  const model = openaiModelCapabilities('gpt-5.6');

  console.dir(model, { depth: null });
  console.log(
    'Responses reasoning efforts:',
    model?.endpoints.responses?.capabilities.reasoning.efforts,
  );
  console.log(
    'Chat reasoning efforts:',
    model?.endpoints.chat?.capabilities.reasoning.efforts,
  );
  console.dir(openaiModelCapabilities('text-embedding-3-small'), {
    depth: null,
  });
});
