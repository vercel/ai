import type { TelemetryOptions } from './telemetry-options';

/**
 * Filters SDK-owned content fields on a copy. Only descend into SDK event
 * containers; user context has its own inclusion policy.
 */
export function filterTelemetryEvent<EVENT>(
  event: EVENT,
  telemetry: Pick<TelemetryOptions, 'recordInputs' | 'recordOutputs'>,
): EVENT {
  const hideInputs = telemetry.recordInputs === false;
  const hideOutputs = telemetry.recordOutputs === false;
  if (
    (!hideInputs && !hideOutputs) ||
    event == null ||
    typeof event !== 'object'
  ) {
    return event;
  }

  const filtered = Object.assign(
    Object.create(Object.getPrototypeOf(event)),
    event,
  ) as Record<string, unknown>;
  const replace = (fields: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(fields)) {
      if (Object.hasOwn(event, key)) {
        filtered[key] = value;
      }
    }
  };

  const isSpeech = filtered.operationId === 'ai.generateSpeech';
  if (hideInputs) {
    replace({
      instructions: undefined,
      system: undefined,
      prompt: undefined,
      messages: [],
      promptMessages: [],
      experimental_steeringMessages: [],
      tools: undefined,
      stepTools: undefined,
      schema: undefined,
      schemaName: undefined,
      schemaDescription: undefined,
      ...(typeof filtered.output === 'object' ? { output: undefined } : {}),
      providerOptions: {},
      value: '',
      values: [],
      query: '',
      documents: [],
      state: Array.isArray(filtered.state)
        ? []
        : typeof filtered.state === 'string'
          ? ''
          : {},
      questions: {},
      ...(isSpeech ? { text: '' } : {}),
    });
    if (filtered.toolCall != null) {
      filtered.toolCall = { ...filtered.toolCall, input: undefined };
    }
    if (filtered.toolOutput != null) {
      filtered.toolOutput = { ...filtered.toolOutput, input: undefined };
    }
    if (Array.isArray(filtered.ranking)) {
      filtered.ranking = filtered.ranking.map(entry =>
        'document' in entry
          ? { ...entry, document: typeof entry.document === 'string' ? '' : {} }
          : entry,
      );
    }
  }

  if (hideOutputs) {
    replace({
      content: [],
      ...(!isSpeech ? { text: '' } : {}),
      reasoning: Array.isArray(filtered.reasoning) ? [] : undefined,
      reasoningText: undefined,
      files: [],
      sources: [],
      toolCalls: [],
      staticToolCalls: [],
      dynamicToolCalls: [],
      toolResults: [],
      staticToolResults: [],
      dynamicToolResults: [],
      responseMessages: [],
      object: undefined,
      objectText: '',
      embedding: [],
      embeddings: [],
      ranking: [],
      answers: {},
      segments: [],
      words: [],
    });
    if (filtered.toolOutput != null) {
      filtered.toolOutput = {
        ...filtered.toolOutput,
        output: undefined,
        error: undefined,
      };
    }
  }

  // Raw provider payloads and errors can contain either inputs or outputs.
  replace({
    providerMetadata: undefined,
    error:
      filtered.error == null
        ? filtered.error
        : new Error('AI SDK operation failed'),
  });
  for (const key of ['toolCall', 'toolOutput'] as const) {
    const toolEvent = filtered[key];
    if (toolEvent != null && typeof toolEvent === 'object') {
      filtered[key] = {
        ...toolEvent,
        providerMetadata: undefined,
        ...('error' in toolEvent
          ? {
              error:
                toolEvent.error == null
                  ? toolEvent.error
                  : new Error('AI SDK operation failed'),
            }
          : {}),
      };
    }
  }
  for (const key of ['request', 'response'] as const) {
    const filterMetadata = (metadata: unknown) => {
      if (metadata == null || typeof metadata !== 'object') {
        return metadata;
      }
      const filteredMetadata: Record<string, unknown> = { ...metadata };
      delete filteredMetadata.body;
      if (key === 'request' ? hideInputs : hideOutputs) {
        if ('messages' in metadata) filteredMetadata.messages = [];
        if ('instructions' in metadata)
          filteredMetadata.instructions = undefined;
      }
      return filteredMetadata;
    };
    const metadata = filtered[key];
    if (metadata != null) {
      filtered[key] = Array.isArray(metadata)
        ? metadata.map(filterMetadata)
        : filterMetadata(metadata);
    }
  }

  if (Array.isArray(filtered.steps)) {
    filtered.steps = filtered.steps.map(step =>
      filterTelemetryEvent(step, telemetry),
    );
  }
  if (Object.hasOwn(event, 'finalStep')) {
    filtered.finalStep = filterTelemetryEvent(filtered.finalStep, telemetry);
  }

  return filtered as EVENT;
}
