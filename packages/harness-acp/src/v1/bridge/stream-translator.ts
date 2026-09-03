import type { HarnessV1StreamPart } from '@ai-sdk/harness';
import type { PromptResponse, SessionUpdate } from '@agentclientprotocol/sdk';
import type {
  ACPToolCall,
  ACPToolCallStatus,
  ACPToolKind,
} from '../../acp-tool-call';
import type { ACPBuiltinToolMapping } from '../acp-v1-bridge-protocol';

type HarnessUsage = Extract<
  HarnessV1StreamPart,
  { readonly type: 'finish' }
>['totalUsage'];
type HarnessToolResult = Extract<
  HarnessV1StreamPart,
  { readonly type: 'tool-result' }
>['result'];
type HarnessJSONValue = HarnessToolResult | null;

type ToolState = {
  readonly toolCallId: string;
  readonly values: Record<string, unknown>;
  readonly emittedFilePaths: Set<string>;
  emittedCall: boolean;
  emittedResult: boolean;
  toolName?: string;
  nativeName?: string;
};

export type ACPSessionUpdate = SessionUpdate;
export type ACPPromptResponse = PromptResponse;

export function createACPStreamTranslator({
  emit,
  emitToolCallCandidate,
  builtinTools = [],
}: {
  emit: (event: HarnessV1StreamPart) => void;
  emitToolCallCandidate?: (options: { toolCall: ACPToolCall }) => void;
  builtinTools?: ReadonlyArray<ACPBuiltinToolMapping>;
}): {
  update: (
    options:
      | ACPSessionUpdate
      | {
          update: ACPSessionUpdate;
          rawUpdate?: unknown;
          preserveRaw?: boolean;
        },
  ) => void;
  permissionToolCall: (options: {
    toolCall: Extract<
      ACPSessionUpdate,
      { sessionUpdate: 'tool_call' | 'tool_call_update' }
    >;
  }) => void;
  raw: (options: { rawValue: unknown }) => void;
  close: () => void;
  finish: (response: ACPPromptResponse) => void;
  hostToolCall: (options: {
    toolCallId: string;
    toolName: string;
    input: Readonly<Record<string, unknown>>;
  }) => void;
  hostToolResult: (options: {
    toolCallId: string;
    toolName: string;
    output: unknown;
    isError?: boolean;
  }) => void;
  getToolCall: (options: { toolCallId: string }) => ACPToolCall | undefined;
} {
  let openBlock:
    | {
        readonly type: 'text' | 'reasoning';
        readonly id: string;
        readonly messageId: string | null;
      }
    | undefined;
  let blockCounter = 0;
  let stepOpen = false;
  let finished = false;
  const blockIdCounts = new Map<string, number>();
  const toolStates = new Map<string, ToolState>();
  const pendingToolCallIds = new Set<string>();
  const builtinToolsByName = indexBuiltinTools({ builtinTools });

  const closeBlock = () => {
    if (openBlock == null) return;
    emit({
      type: openBlock.type === 'text' ? 'text-end' : 'reasoning-end',
      id: openBlock.id,
    });
    openBlock = undefined;
  };

  const createBlockId = ({
    type,
    messageId,
  }: {
    type: 'text' | 'reasoning';
    messageId: string | null;
  }): string => {
    const base = messageId ?? `acp-${type}-${++blockCounter}`;
    const count = (blockIdCounts.get(base) ?? 0) + 1;
    blockIdCounts.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  };

  const emitContent = ({
    type,
    text,
    messageId,
  }: {
    type: 'text' | 'reasoning';
    text: string;
    messageId?: string | null;
  }) => {
    const normalizedMessageId = messageId ?? null;
    if (
      openBlock == null ||
      openBlock.type !== type ||
      openBlock.messageId !== normalizedMessageId
    ) {
      closeBlock();
      const id = createBlockId({ type, messageId: normalizedMessageId });
      emit({
        type: type === 'text' ? 'text-start' : 'reasoning-start',
        id,
      });
      openBlock = { type, id, messageId: normalizedMessageId };
    }
    emit({
      type: type === 'text' ? 'text-delta' : 'reasoning-delta',
      id: openBlock.id,
      delta: text,
    });
    stepOpen = true;
  };

  const emitInferredStep = ({
    finishReason,
  }: {
    finishReason: Extract<
      HarnessV1StreamPart,
      { readonly type: 'finish-step' }
    >['finishReason'];
  }) => {
    closeBlock();
    emit({
      type: 'finish-step',
      finishReason,
      usage: unknownUsage(),
      harnessMetadata: { acp: { inferredStep: true } },
    });
    stepOpen = false;
  };

  const finishCompletedToolStep = () => {
    if (!stepOpen || pendingToolCallIds.size > 0) {
      return;
    }
    emitInferredStep({
      finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
    });
  };

  const emitToolUpdate = ({
    update,
    rawUpdate,
    forceEmit = false,
  }: {
    update: Extract<
      ACPSessionUpdate,
      { sessionUpdate: 'tool_call' | 'tool_call_update' }
    >;
    rawUpdate: unknown;
    forceEmit?: boolean;
  }) => {
    closeBlock();
    const state =
      toolStates.get(update.toolCallId) ??
      ({
        toolCallId: update.toolCallId,
        values: {},
        emittedFilePaths: new Set(),
        emittedCall: false,
        emittedResult: false,
      } satisfies ToolState);
    toolStates.set(update.toolCallId, state);
    mergeToolUpdate({ state, update, rawUpdate });

    if (
      !forceEmit &&
      !state.emittedCall &&
      update.sessionUpdate === 'tool_call' &&
      update.status === 'pending'
    ) {
      return;
    }

    if (!state.emittedCall) {
      const programmaticName = getStringProperty({
        value: state.values,
        property: 'name',
      });
      const builtin = resolveBuiltinTool({
        programmaticName,
        metadata: state.values._meta,
        title: getStringProperty({
          value: state.values,
          property: 'title',
        }),
        kind: isACPToolKind(state.values.kind) ? state.values.kind : undefined,
        rawInput: state.values.rawInput,
        builtinTools,
        builtinToolsByName,
      });
      emitToolCallCandidate?.({ toolCall: createACPToolCall({ state }) });
      if (
        !forceEmit &&
        builtin?.inputSchema != null &&
        state.values.status !== 'completed' &&
        state.values.status !== 'failed' &&
        !hasRequiredBuiltinToolInput({
          rawInput: state.values.rawInput,
          inputSchema: builtin.inputSchema,
        })
      ) {
        return;
      }
      if (builtin != null) {
        state.toolName = builtin.toolName;
        state.nativeName =
          builtin.nativeName != null && builtin.toolName !== builtin.nativeName
            ? builtin.nativeName
            : undefined;
      } else {
        state.toolName = createDynamicToolName({
          programmaticName,
          toolCallId: state.toolCallId,
        });
      }
      emit({
        type: 'tool-call',
        toolCallId: state.toolCallId,
        toolName: state.toolName,
        input: stringifyToolInput({ input: state.values.rawInput }),
        providerExecuted: true,
        ...(state.nativeName == null ? {} : { nativeName: state.nativeName }),
      });
      state.emittedCall = true;
      stepOpen = true;
      pendingToolCallIds.add(state.toolCallId);
    }

    emitFileChanges({ state, emit });

    if (
      !state.emittedResult &&
      (state.values.status === 'completed' || state.values.status === 'failed')
    ) {
      emit({
        type: 'tool-result',
        toolCallId: state.toolCallId,
        toolName: state.toolName!,
        result: createToolResult({ state }),
        ...(state.values.status === 'failed' ? { isError: true } : {}),
      });
      state.emittedResult = true;
      pendingToolCallIds.delete(state.toolCallId);
      finishCompletedToolStep();
    }
  };

  const hostToolCall = ({
    toolCallId,
    toolName,
    input,
  }: {
    toolCallId: string;
    toolName: string;
    input: Readonly<Record<string, unknown>>;
  }) => {
    closeBlock();
    emit({
      type: 'tool-call',
      toolCallId,
      toolName,
      input: stringifyToolInput({ input }),
      providerExecuted: false,
    });
    stepOpen = true;
    pendingToolCallIds.add(toolCallId);
  };

  const hostToolResult = ({
    toolCallId,
    toolName,
    output,
    isError,
  }: {
    toolCallId: string;
    toolName: string;
    output: unknown;
    isError?: boolean;
  }) => {
    closeBlock();
    emit({
      type: 'tool-result',
      toolCallId,
      toolName,
      result: toSafeJSONValue({ value: output, fallback: {} }) ?? {},
      ...(isError ? { isError: true } : {}),
    });
    pendingToolCallIds.delete(toolCallId);
    finishCompletedToolStep();
  };

  return {
    update: options => {
      const { update, rawUpdate, preserveRaw } =
        'update' in options
          ? {
              update: options.update,
              rawUpdate: options.rawUpdate,
              preserveRaw: options.preserveRaw,
            }
          : { update: options, rawUpdate: options, preserveRaw: true };
      const preservedUpdate = rawUpdate === undefined ? update : rawUpdate;
      if (preserveRaw !== false) {
        emit({ type: 'raw', rawValue: preservedUpdate });
      }
      if (
        update.sessionUpdate === 'agent_message_chunk' &&
        update.content?.type === 'text' &&
        typeof update.content.text === 'string'
      ) {
        emitContent({
          type: 'text',
          text: update.content.text,
          messageId: update.messageId,
        });
        return;
      }
      if (
        update.sessionUpdate === 'agent_thought_chunk' &&
        update.content?.type === 'text' &&
        typeof update.content.text === 'string'
      ) {
        emitContent({
          type: 'reasoning',
          text: update.content.text,
          messageId: update.messageId,
        });
        return;
      }
      if (
        update.sessionUpdate === 'agent_message_chunk' ||
        update.sessionUpdate === 'agent_thought_chunk'
      ) {
        closeBlock();
        return;
      }
      if (
        update.sessionUpdate === 'tool_call' ||
        update.sessionUpdate === 'tool_call_update'
      ) {
        emitToolUpdate({ update, rawUpdate: preservedUpdate });
      }
    },
    permissionToolCall: ({ toolCall }) => {
      emitToolUpdate({
        update: toolCall,
        rawUpdate: toolCall,
        forceEmit: true,
      });
    },
    raw: ({ rawValue }) => {
      emit({ type: 'raw', rawValue });
    },
    close: closeBlock,
    hostToolCall,
    hostToolResult,
    getToolCall: ({ toolCallId }) => {
      const state = toolStates.get(toolCallId);
      return state == null ? undefined : createACPToolCall({ state });
    },
    finish: response => {
      if (finished) return;
      finished = true;
      emit({ type: 'raw', rawValue: response });
      const finishReason = mapACPFinishReason({
        stopReason: response.stopReason,
      });
      const usageMetadata =
        response.usage == null
          ? undefined
          : mapACPUsageMetadata({ usage: response.usage });
      if (stepOpen) {
        emitInferredStep({ finishReason });
      } else {
        closeBlock();
      }
      emit({
        type: 'finish',
        finishReason,
        totalUsage: mapACPUsage({ usage: response.usage }),
        harnessMetadata: {
          acp: {
            stopReason: response.stopReason,
            ...(usageMetadata == null ? {} : { usage: usageMetadata }),
          },
        },
      });
    },
  };
}

export function mapACPFinishReason({ stopReason }: { stopReason: string }): {
  unified:
    | 'stop'
    | 'length'
    | 'content-filter'
    | 'tool-calls'
    | 'error'
    | 'other';
  raw: string;
} {
  switch (stopReason) {
    case 'end_turn':
      return { unified: 'stop', raw: stopReason };
    case 'max_tokens':
    case 'max_turn_requests':
      return { unified: 'length', raw: stopReason };
    case 'refusal':
      return { unified: 'content-filter', raw: stopReason };
    default:
      return { unified: 'other', raw: stopReason };
  }
}

function indexBuiltinTools({
  builtinTools,
}: {
  builtinTools: ReadonlyArray<ACPBuiltinToolMapping>;
}): ReadonlyMap<string, ACPBuiltinToolMapping> {
  const matches = new Map<string, ACPBuiltinToolMapping | null>();
  for (const builtinTool of builtinTools) {
    addBuiltinToolMatch({
      matches,
      name: builtinTool.toolName,
      builtinTool,
    });
    if (builtinTool.nativeName != null) {
      addBuiltinToolMatch({
        matches,
        name: builtinTool.nativeName,
        builtinTool,
      });
    }
  }
  return new Map(
    [...matches].filter(
      (entry): entry is [string, ACPBuiltinToolMapping] => entry[1] != null,
    ),
  );
}

function addBuiltinToolMatch({
  matches,
  name,
  builtinTool,
}: {
  matches: Map<string, ACPBuiltinToolMapping | null>;
  name: string;
  builtinTool: ACPBuiltinToolMapping;
}): void {
  if (!matches.has(name)) {
    matches.set(name, builtinTool);
    return;
  }
  if (matches.get(name)?.toolName !== builtinTool.toolName) {
    matches.set(name, null);
  }
}

function resolveBuiltinTool({
  programmaticName,
  metadata,
  title,
  kind,
  rawInput,
  builtinTools,
  builtinToolsByName,
}: {
  programmaticName: string | undefined;
  metadata: unknown;
  title: string | undefined;
  kind: ACPToolKind | undefined;
  rawInput: unknown;
  builtinTools: ReadonlyArray<ACPBuiltinToolMapping>;
  builtinToolsByName: ReadonlyMap<string, ACPBuiltinToolMapping>;
}): ACPBuiltinToolMapping | undefined {
  if (programmaticName != null) {
    return builtinToolsByName.get(programmaticName);
  }

  const metadataMatch = findBuiltinToolsInMetadata({
    metadata,
    builtinToolsByName,
  });
  if (metadataMatch.hasProgrammaticName) {
    return metadataMatch.matches.length === 1
      ? metadataMatch.matches[0]
      : undefined;
  }

  const titleMatch = findBuiltinToolByTitle({
    title,
    kind,
    builtinTools,
  });
  if (titleMatch != null) return titleMatch;

  const schemaMatches = builtinTools.filter(tool =>
    matchesBuiltinToolInput({ rawInput, inputSchema: tool.inputSchema }),
  );
  return schemaMatches.length === 1 ? schemaMatches[0] : undefined;
}

function findBuiltinToolByTitle({
  title,
  kind,
  builtinTools,
}: {
  title: string | undefined;
  kind: ACPToolKind | undefined;
  builtinTools: ReadonlyArray<ACPBuiltinToolMapping>;
}): ACPBuiltinToolMapping | undefined {
  if (title == null) return undefined;
  const matches = builtinTools.filter(
    tool =>
      tool.title != null &&
      title.startsWith(tool.title) &&
      isCompatibleToolKind({ toolUseKind: tool.toolUseKind, kind }),
  );
  if (matches.length === 0) return undefined;
  const longestPrefixLength = Math.max(
    ...matches.map(tool => tool.title!.length),
  );
  const longestMatches = matches.filter(
    tool => tool.title!.length === longestPrefixLength,
  );
  return longestMatches.length === 1 ? longestMatches[0] : undefined;
}

function isCompatibleToolKind({
  toolUseKind,
  kind,
}: {
  toolUseKind: ACPBuiltinToolMapping['toolUseKind'];
  kind: ACPToolKind | undefined;
}): boolean {
  if (toolUseKind == null || kind == null) return true;
  switch (toolUseKind) {
    case 'readonly':
      return (
        kind === 'read' ||
        kind === 'search' ||
        kind === 'fetch' ||
        kind === 'think'
      );
    case 'edit':
      return kind === 'edit' || kind === 'delete' || kind === 'move';
    case 'bash':
      return kind === 'execute';
  }
}

function findBuiltinToolsInMetadata({
  metadata,
  builtinToolsByName,
}: {
  metadata: unknown;
  builtinToolsByName: ReadonlyMap<string, ACPBuiltinToolMapping>;
}): {
  hasProgrammaticName: boolean;
  matches: ReadonlyArray<ACPBuiltinToolMapping>;
} {
  const matches = new Map<string, ACPBuiltinToolMapping>();
  let hasProgrammaticName = false;
  const seen = new Set<object>();
  const visit = (value: unknown): void => {
    if (value == null || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    for (const [property, child] of Array.isArray(value)
      ? value.entries()
      : Object.entries(value as Record<string, unknown>)) {
      if (
        (property === 'name' || property === 'toolName') &&
        typeof child === 'string'
      ) {
        hasProgrammaticName = true;
        const builtin = builtinToolsByName.get(child);
        if (builtin != null) matches.set(builtin.toolName, builtin);
      }
      visit(child);
    }
  };
  visit(metadata);
  return { hasProgrammaticName, matches: [...matches.values()] };
}

function matchesBuiltinToolInput({
  rawInput,
  inputSchema,
}: {
  rawInput: unknown;
  inputSchema: ACPBuiltinToolMapping['inputSchema'];
}): boolean {
  if (!isRecord(rawInput) || !isRecord(inputSchema)) return false;
  if (inputSchema.type !== 'object') return false;
  const required = inputSchema.required;
  if (
    !Array.isArray(required) ||
    required.length === 0 ||
    !required.every(property => typeof property === 'string')
  ) {
    return false;
  }
  if (!hasRequiredBuiltinToolInput({ rawInput, inputSchema })) return false;

  const properties = isRecord(inputSchema.properties)
    ? inputSchema.properties
    : {};
  return Object.entries(properties)
    .filter(([, schema]) => isJSONSchemaDiscriminator({ schema }))
    .every(([property, schema]) => {
      if (!Object.prototype.hasOwnProperty.call(rawInput, property)) {
        return false;
      }
      return matchesJSONSchemaValue({ value: rawInput[property], schema });
    });
}

function hasRequiredBuiltinToolInput({
  rawInput,
  inputSchema,
}: {
  rawInput: unknown;
  inputSchema: ACPBuiltinToolMapping['inputSchema'];
}): boolean {
  if (!isRecord(inputSchema) || inputSchema.type !== 'object') return true;
  if (!isRecord(rawInput)) return false;
  const required = inputSchema.required;
  if (!Array.isArray(required) || required.length === 0) return true;
  if (!required.every(property => typeof property === 'string')) return true;
  const properties = isRecord(inputSchema.properties)
    ? inputSchema.properties
    : {};
  return required.every(property => {
    if (!Object.prototype.hasOwnProperty.call(rawInput, property)) return false;
    return matchesJSONSchemaValue({
      value: rawInput[property],
      schema: properties[property],
    });
  });
}

function isJSONSchemaDiscriminator({ schema }: { schema: unknown }): boolean {
  return (
    isRecord(schema) &&
    ('const' in schema ||
      (Array.isArray(schema.enum) && schema.enum.length === 1))
  );
}

function matchesJSONSchemaValue({
  value,
  schema,
}: {
  value: unknown;
  schema: unknown;
}): boolean {
  if (schema === true) return true;
  if (schema === false || !isRecord(schema)) return false;
  if ('const' in schema && !Object.is(value, schema.const)) return false;
  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some(candidate => Object.is(value, candidate))
  ) {
    return false;
  }
  for (const alternatives of [schema.anyOf, schema.oneOf]) {
    if (
      Array.isArray(alternatives) &&
      !alternatives.some(alternative =>
        matchesJSONSchemaValue({ value, schema: alternative }),
      )
    ) {
      return false;
    }
  }
  if (typeof schema.type !== 'string') return true;
  switch (schema.type) {
    case 'null':
      return value === null;
    case 'boolean':
      return typeof value === 'boolean';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'string':
      return typeof value === 'string';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return isRecord(value);
    default:
      return true;
  }
}

function mergeToolUpdate({
  state,
  update,
  rawUpdate,
}: {
  state: ToolState;
  update: Extract<
    ACPSessionUpdate,
    { sessionUpdate: 'tool_call' | 'tool_call_update' }
  >;
  rawUpdate: unknown;
}): void {
  const parsed = update as unknown as Record<string, unknown>;
  for (const property of [
    'title',
    'kind',
    'status',
    'content',
    'locations',
    'rawInput',
    'rawOutput',
    '_meta',
  ]) {
    if (
      Object.prototype.hasOwnProperty.call(parsed, property) &&
      parsed[property] !== undefined
    ) {
      state.values[property] = parsed[property];
    }
  }
  const programmaticName = getStringProperty({
    value: rawUpdate,
    property: 'name',
  });
  if (programmaticName != null) state.values.name = programmaticName;
}

function createACPToolCall({ state }: { state: ToolState }): ACPToolCall {
  const title = getStringProperty({
    value: state.values,
    property: 'title',
  });
  const kind = state.values.kind;
  const status = state.values.status;
  return {
    toolCallId: state.toolCallId,
    title: title ?? state.toolName ?? `Tool ${state.toolCallId}`,
    ...(isACPToolKind(kind) ? { kind } : {}),
    ...(isACPToolCallStatus(status) ? { status } : {}),
    ...(Array.isArray(state.values.content)
      ? { content: state.values.content as ACPToolCall['content'] }
      : {}),
    ...(Array.isArray(state.values.locations)
      ? { locations: state.values.locations as ACPToolCall['locations'] }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(state.values, 'rawInput')
      ? { rawInput: state.values.rawInput }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(state.values, 'rawOutput')
      ? { rawOutput: state.values.rawOutput }
      : {}),
    ...(state.values._meta === null || isRecord(state.values._meta)
      ? { _meta: state.values._meta }
      : {}),
  };
}

function isACPToolKind(value: unknown): value is ACPToolKind {
  return (
    value === 'read' ||
    value === 'edit' ||
    value === 'delete' ||
    value === 'move' ||
    value === 'search' ||
    value === 'execute' ||
    value === 'think' ||
    value === 'fetch' ||
    value === 'switch_mode' ||
    value === 'other'
  );
}

function isACPToolCallStatus(value: unknown): value is ACPToolCallStatus {
  return (
    value === 'pending' ||
    value === 'in_progress' ||
    value === 'completed' ||
    value === 'failed'
  );
}

function emitFileChanges({
  state,
  emit,
}: {
  state: ToolState;
  emit: (event: HarnessV1StreamPart) => void;
}): void {
  const content = Array.isArray(state.values.content)
    ? state.values.content
    : [];
  for (const item of content) {
    if (!isRecord(item) || item.type !== 'diff') continue;
    const path = getStringProperty({ value: item, property: 'path' });
    const newText = getStringProperty({ value: item, property: 'newText' });
    if (path == null || newText == null) continue;
    const oldText = item.oldText;
    const event = oldText == null ? 'create' : 'modify';
    emitFileChange({ state, emit, path, event });
  }

  if (state.values.kind !== 'edit') return;
  const locations = Array.isArray(state.values.locations)
    ? state.values.locations
    : [];
  for (const location of locations) {
    const path = getStringProperty({ value: location, property: 'path' });
    if (path != null) {
      emitFileChange({ state, emit, path, event: 'modify' });
    }
  }
}

function emitFileChange({
  state,
  emit,
  path,
  event,
}: {
  state: ToolState;
  emit: (event: HarnessV1StreamPart) => void;
  path: string;
  event: 'create' | 'modify' | 'delete';
}): void {
  if (state.emittedFilePaths.has(path)) return;
  state.emittedFilePaths.add(path);
  emit({
    type: 'file-change',
    path,
    event,
    harnessMetadata: {
      acp: {
        toolCallId: state.toolCallId,
      },
    },
  });
}

function createDynamicToolName({
  programmaticName,
  toolCallId,
}: {
  programmaticName: string | undefined;
  toolCallId: string;
}): string {
  const source = programmaticName ?? `acp_tool_${toolCallId}`;
  const normalized = source
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 128);
  if (normalized.length === 0) return 'acp_tool';
  return /^[A-Za-z_]/.test(normalized) ? normalized : `acp_${normalized}`;
}

function stringifyToolInput({ input }: { input: unknown }): string {
  return JSON.stringify(toSafeJSONValue({ value: input, fallback: {} }));
}

function createToolResult({ state }: { state: ToolState }): HarnessToolResult {
  const value =
    state.values.rawOutput != null
      ? state.values.rawOutput
      : state.values.content != null
        ? state.values.content
        : {};
  return toSafeJSONValue({ value, fallback: {} }) ?? {};
}

function toSafeJSONValue({
  value,
  fallback,
  seen = new Set(),
}: {
  value: unknown;
  fallback: HarnessJSONValue;
  seen?: Set<object>;
}): HarnessJSONValue {
  if (value == null) return fallback;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object') return fallback;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) {
    const result = value.map(item =>
      toSafeJSONValue({ value: item, fallback: null, seen }),
    );
    seen.delete(value);
    return result;
  }
  const result = Object.create(null) as Record<string, HarnessJSONValue>;
  try {
    for (const [key, item] of Object.entries(value)) {
      result[key] = toSafeJSONValue({
        value: item,
        fallback: null,
        seen,
      });
    }
  } catch {
    seen.delete(value);
    return fallback;
  }
  seen.delete(value);
  return result;
}

function getStringProperty({
  value,
  property,
}: {
  value: unknown;
  property: string;
}): string | undefined {
  if (!isRecord(value)) return undefined;
  const propertyValue = value[property];
  return typeof propertyValue === 'string' ? propertyValue : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function mapACPUsage({
  usage,
}: {
  usage: ACPPromptResponse['usage'];
}): HarnessUsage {
  if (usage == null) return unknownUsage();
  const raw = mapACPUsageMetadata({ usage });
  return {
    inputTokens: {
      total: usage.inputTokens,
      noCache: undefined,
      cacheRead: usage.cachedReadTokens ?? undefined,
      cacheWrite: usage.cachedWriteTokens ?? undefined,
    },
    outputTokens: {
      total: usage.outputTokens,
      text: undefined,
      reasoning: usage.thoughtTokens ?? undefined,
    },
    raw,
  };
}

function mapACPUsageMetadata({
  usage,
}: {
  usage: NonNullable<ACPPromptResponse['usage']>;
}) {
  return {
    totalTokens: usage.totalTokens,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    ...(usage.thoughtTokens == null
      ? {}
      : { thoughtTokens: usage.thoughtTokens }),
    ...(usage.cachedReadTokens == null
      ? {}
      : { cachedReadTokens: usage.cachedReadTokens }),
    ...(usage.cachedWriteTokens == null
      ? {}
      : { cachedWriteTokens: usage.cachedWriteTokens }),
  };
}

function unknownUsage(): HarnessUsage {
  return {
    inputTokens: {
      total: undefined,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: undefined,
      text: undefined,
      reasoning: undefined,
    },
  };
}
