import type { Telemetry } from 'ai';

const logCallback =
  (name: string) =>
  (event: unknown): void => {
    console.log(name, JSON.stringify(event, null, 2));
  };

export const consoleTelemetry = {
  onStart: logCallback('onStart'),
  onStepStart: logCallback('onStepStart'),
  onLanguageModelCallStart: logCallback('onLanguageModelCallStart'),
  onLanguageModelCallEnd: logCallback('onLanguageModelCallEnd'),
  onToolExecutionStart: logCallback('onToolExecutionStart'),
  onToolExecutionEnd: logCallback('onToolExecutionEnd'),
  onStepFinish: logCallback('onStepFinish'),
  onObjectStepStart: logCallback('onObjectStepStart'),
  onObjectStepEnd: logCallback('onObjectStepEnd'),
  onEmbedStart: logCallback('onEmbedStart'),
  onEmbedEnd: logCallback('onEmbedEnd'),
  onRerankStart: logCallback('onRerankStart'),
  onRerankEnd: logCallback('onRerankEnd'),
  experimental_onDecideStart: logCallback('experimental_onDecideStart'),
  experimental_onDecisionModelCallStart: logCallback(
    'experimental_onDecisionModelCallStart',
  ),
  experimental_onDecisionModelCallEnd: logCallback(
    'experimental_onDecisionModelCallEnd',
  ),
  experimental_onDecideEnd: logCallback('experimental_onDecideEnd'),
  onEnd: logCallback('onEnd'),
  onError: logCallback('onError'),
  executeTool: async ({ callId, toolCallId, execute }) => {
    console.log('executeTool', JSON.stringify({ callId, toolCallId }, null, 2));
    return execute();
  },
} satisfies Telemetry;
