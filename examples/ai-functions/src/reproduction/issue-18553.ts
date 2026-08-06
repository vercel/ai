import 'dotenv/config';
import { amazonBedrock } from '@ai-sdk/amazon-bedrock';
import { readUIMessageStream, streamText } from 'ai';

const scenarios = [
  {
    name: 'opus-4.8-without-reasoning-options',
    modelId: 'us.anthropic.claude-opus-4-8',
  },
  {
    name: 'sonnet-5-without-reasoning-options',
    modelId: 'us.anthropic.claude-sonnet-5',
  },
  {
    name: 'sonnet-5-with-summarized-reasoning',
    modelId: 'us.anthropic.claude-sonnet-5',
    providerOptions: {
      bedrock: {
        reasoningConfig: {
          type: 'adaptive' as const,
          display: 'summarized' as const,
          maxReasoningEffort: 'high' as const,
        },
      },
    },
  },
] as const;

async function checkScenario(scenario: (typeof scenarios)[number]) {
  const { name, modelId } = scenario;
  const result = streamText({
    model: amazonBedrock(modelId),
    prompt:
      'Three players A, B, and C each have a jar with balls numbered 1 through 100. They simultaneously draw one ball. A beats B if A has the higher number modulo 100, B similarly competes with C, and C with A. Is uniform random play a mixed-strategy Nash equilibrium? If not, characterize an equilibrium and prove your answer.',
    include: { rawChunks: true },
    ...('providerOptions' in scenario
      ? { providerOptions: scenario.providerOptions }
      : {}),
  });

  const fullPartsPromise = (async () => {
    const parts = [];
    for await (const part of result.fullStream) {
      parts.push(part);
    }
    return parts;
  })();

  const uiMessagesPromise = (async () => {
    const messages = [];
    for await (const message of readUIMessageStream({
      stream: result.toUIMessageStream({ sendReasoning: true }),
      terminateOnError: true,
    })) {
      messages.push(message);
    }
    return messages;
  })();

  const [fullParts, uiMessages, steps] = await Promise.all([
    fullPartsPromise,
    uiMessagesPromise,
    result.steps,
  ]);

  const rawChunks = fullParts
    .filter(part => part.type === 'raw')
    .map(part => part.rawValue);
  const errors = fullParts.filter(part => part.type === 'error');
  const reasoning = steps.flatMap(step =>
    step.content.filter(part => part.type === 'reasoning'),
  );

  if (errors.length > 0) {
    throw new Error(
      `${modelId} emitted stream errors: ${JSON.stringify(errors)}`,
    );
  }

  if (uiMessages.length === 0) {
    throw new Error(`${modelId} produced no UI messages`);
  }

  return {
    name,
    modelId,
    rawContentBlockStarts: rawChunks.filter(
      chunk =>
        typeof chunk === 'object' &&
        chunk != null &&
        'contentBlockStart' in chunk,
    ).length,
    rawReasoningDeltas: rawChunks.filter(
      chunk =>
        typeof chunk === 'object' &&
        chunk != null &&
        'contentBlockDelta' in chunk &&
        typeof chunk.contentBlockDelta === 'object' &&
        chunk.contentBlockDelta != null &&
        'delta' in chunk.contentBlockDelta &&
        typeof chunk.contentBlockDelta.delta === 'object' &&
        chunk.contentBlockDelta.delta != null &&
        'reasoningContent' in chunk.contentBlockDelta.delta,
    ).length,
    rawReasoningTextDeltas: rawChunks.filter(
      chunk =>
        typeof chunk === 'object' &&
        chunk != null &&
        'contentBlockDelta' in chunk &&
        typeof chunk.contentBlockDelta === 'object' &&
        chunk.contentBlockDelta != null &&
        'delta' in chunk.contentBlockDelta &&
        typeof chunk.contentBlockDelta.delta === 'object' &&
        chunk.contentBlockDelta.delta != null &&
        'reasoningContent' in chunk.contentBlockDelta.delta &&
        typeof chunk.contentBlockDelta.delta.reasoningContent === 'object' &&
        chunk.contentBlockDelta.delta.reasoningContent != null &&
        'text' in chunk.contentBlockDelta.delta.reasoningContent,
    ).length,
    streamErrors: errors.length,
    stepReasoningParts: reasoning.length,
    uiMessages: uiMessages.length,
  };
}

async function main() {
  const summaries = [];

  for (const scenario of scenarios) {
    summaries.push(await checkScenario(scenario));
  }

  console.log(JSON.stringify(summaries));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
