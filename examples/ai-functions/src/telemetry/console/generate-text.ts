import { openai } from '@ai-sdk/openai';
import { generateText, registerTelemetry } from 'ai';
import { run } from '../../lib/run';
import { consoleTelemetry } from './console-telemetry';

registerTelemetry(consoleTelemetry);

run(async () => {
  await generateText({
    model: openai('gpt-5-mini'),
    prompt: 'Invent a new holiday and describe its traditions.',
    telemetry: {
      functionId: 'my-awesome-function',
    },
    runtimeContext: {
      something: 'custom',
      someOtherThing: 'other-value',
      secretApiKey: 'sk-secret',
    },
    sensitiveRuntimeContext: {
      secretApiKey: true,
    },
  });
});
