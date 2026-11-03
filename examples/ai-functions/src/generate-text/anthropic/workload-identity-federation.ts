import { generateText } from 'ai';
import { createWorkloadIdentityAnthropic } from '../../lib/anthropic-workload-identity';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const anthropic = createWorkloadIdentityAnthropic();

  const result = await generateText({
    model: anthropic('claude-opus-5-5'),
    prompt: 'Explain workload identity federation in one sentence.',
  });

  print('Text:', result.text);
  print('Usage:', result.usage);

  return result;
});
