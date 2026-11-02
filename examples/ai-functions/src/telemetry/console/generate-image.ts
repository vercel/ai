import { openai } from '@ai-sdk/openai';
import { generateImage, registerTelemetry } from 'ai';
import { run } from '../../lib/run';
import { consoleTelemetry } from './console-telemetry';

registerTelemetry(consoleTelemetry);

run(async () => {
  await generateImage({
    model: openai.image('gpt-image-2.5-sunburst'),
    prompt: 'A blue cream Persian cat in Kyoto in the style of ukiyo-e',
    n: 2,
    maxImagesPerCall: 1,
    telemetry: {
      functionId: 'my-image-function',
    },
  });
});
