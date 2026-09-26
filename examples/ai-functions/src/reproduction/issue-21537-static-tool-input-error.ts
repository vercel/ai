import {
  convertToModelMessages,
  readUIMessageStream,
  safeValidateUIMessages,
  tool,
  type ToolSet,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';
import { z } from 'zod/v4';

const reproductionSignal =
  'ISSUE_21537_REPRODUCED: SDK-generated static tool-input-error uses deprecated rawInput and emits legacy warnings';

type WarningEvent = {
  phase: string;
  setting: string | undefined;
};

function findToolPart(message: UIMessage) {
  const part = message.parts.find(
    part => 'toolCallId' in part && part.toolCallId === 'c1',
  );

  if (part == null) {
    throw new Error('Expected tool part c1.');
  }

  return part as Record<string, unknown>;
}

async function validate(message: UIMessage, tools: ToolSet) {
  const result = await safeValidateUIMessages({
    messages: [structuredClone(message)],
    tools,
  });

  if (!result.success) {
    throw result.error;
  }

  return findToolPart(result.data[0]).type;
}

async function main() {
  const warningEvents: WarningEvent[] = [];
  let phase = 'stream';

  globalThis.AI_SDK_LOG_WARNINGS = ({ warnings }) => {
    for (const warning of warnings) {
      warningEvents.push({
        phase,
        setting: warning.type === 'deprecated' ? warning.setting : undefined,
      });
    }
  };

  const chunks: UIMessageChunk[] = [
    { type: 'start', messageId: 'm1' },
    { type: 'start-step' },
    {
      type: 'tool-input-start',
      toolCallId: 'c1',
      toolName: 'cityAttractions',
    },
    {
      type: 'tool-input-error',
      toolCallId: 'c1',
      toolName: 'cityAttractions',
      input: '{broken',
      errorText: 'Invalid input',
    },
    {
      type: 'tool-output-error',
      toolCallId: 'c1',
      errorText: 'Invalid input',
    },
    { type: 'finish-step' },
    { type: 'finish' },
  ];
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  let message: UIMessage | undefined;
  for await (const update of readUIMessageStream({ stream })) {
    message = update;
  }

  if (message == null) {
    throw new Error('Expected a completed UI message.');
  }

  const streamPart = findToolPart(message);

  phase = 'conversion';
  const modelMessages = await convertToModelMessages([message]);
  const assistantMessage = modelMessages.find(
    modelMessage => modelMessage.role === 'assistant',
  );
  if (assistantMessage == null || !Array.isArray(assistantMessage.content)) {
    throw new Error('Expected an assistant model message.');
  }
  const modelToolCall = assistantMessage.content.find(
    part => part.type === 'tool-call',
  );
  if (modelToolCall == null) {
    throw new Error('Expected a model tool-call part.');
  }

  const tools = {
    cityAttractions: tool({
      inputSchema: z.object({ cities: z.array(z.string()) }),
    }),
  };

  phase = 'validation';
  const validatedType = await validate(message, tools);
  const freshWarnings = warningEvents.slice();

  const currentContractMessage = structuredClone(message);
  const currentContractPart = findToolPart(currentContractMessage);
  if (
    currentContractPart.input === undefined &&
    currentContractPart.rawInput !== undefined
  ) {
    currentContractPart.input = currentContractPart.rawInput;
    delete currentContractPart.rawInput;
  }
  phase = 'current-contract-validation';
  const currentContractValidatedType = await validate(
    currentContractMessage,
    tools,
  );

  const legacyMessage = structuredClone(currentContractMessage);
  const legacyPart = findToolPart(legacyMessage);
  legacyPart.rawInput = legacyPart.input;
  legacyPart.input = undefined;
  const legacyWarningStart = warningEvents.length;

  phase = 'legacy-conversion';
  const legacyModelMessages = await convertToModelMessages([legacyMessage]);
  const legacyAssistantMessage = legacyModelMessages.find(
    modelMessage => modelMessage.role === 'assistant',
  );
  if (
    legacyAssistantMessage == null ||
    !Array.isArray(legacyAssistantMessage.content)
  ) {
    throw new Error('Expected a legacy assistant model message.');
  }
  const legacyModelToolCall = legacyAssistantMessage.content.find(
    part => part.type === 'tool-call',
  );
  if (legacyModelToolCall == null) {
    throw new Error('Expected a legacy model tool-call part.');
  }

  phase = 'legacy-validation';
  await validate(legacyMessage, tools);
  const legacyWarnings = warningEvents.slice(legacyWarningStart);

  console.log(
    JSON.stringify(
      {
        streamPart: {
          type: streamPart.type,
          input: streamPart.input,
          rawInput: streamPart.rawInput,
        },
        modelInput: modelToolCall.input,
        validatedType,
        currentContractValidatedType,
        freshWarnings,
        legacyModelInput: legacyModelToolCall.input,
        legacyWarnings,
      },
      null,
      2,
    ),
  );

  const freshContractFailed =
    streamPart.input !== '{broken' ||
    streamPart.rawInput !== undefined ||
    modelToolCall.input !== '{broken' ||
    validatedType !== 'dynamic-tool' ||
    freshWarnings.length !== 0;

  if (freshContractFailed) {
    throw new Error(reproductionSignal);
  }

  if (currentContractValidatedType !== 'dynamic-tool') {
    throw new Error(
      'Current input-field contract did not normalize invalid static tool input to dynamic-tool.',
    );
  }

  const legacyWarningPhases = legacyWarnings.map(event => event.phase);
  if (
    legacyModelToolCall.input !== '{broken' ||
    !legacyWarningPhases.includes('legacy-conversion') ||
    !legacyWarningPhases.includes('legacy-validation')
  ) {
    throw new Error(
      'Legacy rawInput compatibility warning or conversion fallback regressed.',
    );
  }
}

main().catch(error => {
  if (error instanceof Error && error.message === reproductionSignal) {
    console.error(reproductionSignal);
    process.exitCode = 1;
    return;
  }

  console.error('UNEXPECTED_REPRODUCTION_ERROR', error);
  process.exitCode = 2;
});
