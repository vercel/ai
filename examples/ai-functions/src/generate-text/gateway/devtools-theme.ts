import { DevToolsTelemetry } from '@ai-sdk/devtools';
import { generateText, registerTelemetry } from 'ai';
import { run } from '../../lib/run';

registerTelemetry(DevToolsTelemetry());

run(async () => {
  const { text } = await generateText({
    model: 'anthropic/claude-haiku-4.5',
    prompt: 'Explain why readable developer tools improve debugging.',
    telemetry: {
      functionId: 'devtools-theme-example',
    },
  });

  console.log(text);
  console.log();
  console.log(
    'Run `npx @ai-sdk/devtools@latest`, then use the theme button in the viewer header to switch between dark and light themes.',
  );
});
