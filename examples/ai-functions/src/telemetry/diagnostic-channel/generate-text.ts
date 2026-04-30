import { subscribe } from 'node:diagnostics_channel';
import {
  AI_SDK_TELEMETRY_DIAGNOSTIC_CHANNEL,
  generateText,
  gateway,
  type TelemetryDiagnosticChannelMessage,
} from 'ai';
import { run } from '../../lib/run';

subscribe(AI_SDK_TELEMETRY_DIAGNOSTIC_CHANNEL, message => {
  const telemetry = message as TelemetryDiagnosticChannelMessage;

  console.log(
    `[diagnostic-channel] ${telemetry.type}`,
    JSON.stringify(telemetry.event, null, 2),
  );
});

run(async () => {
  await generateText({
    model: gateway('openai/gpt-5-nano'),
    prompt: 'Say hello in 5 words.',
    telemetry: {
      functionId: 'diagnostic-channel-example',
    },
  });
});
