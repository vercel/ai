import { googleModelCapabilities } from '@ai-sdk/google';
import { run } from '../../lib/run';

run(async () => {
  const model = googleModelCapabilities('gemini-2.5-pro');
  console.dir(model, { depth: null });
  console.log(
    'Google Search:',
    model?.endpoints.generateContent?.capabilities.tools.googleSearch,
  );
  console.dir(googleModelCapabilities('gemini-embedding-001'), { depth: null });
});
