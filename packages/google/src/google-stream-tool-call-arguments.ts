import {
  LanguageModelV4StreamPart,
  SharedV4ProviderMetadata,
} from '@ai-sdk/provider';

type ActiveStreamingToolCall = {
  toolCallId: string;
  toolName: string;
  accumulatedArgs: Record<string, unknown>;
  jsonText: string;
  providerMetadata?: SharedV4ProviderMetadata;
};

export type StreamingFunctionCallPart = {
  functionCall: {
    name?: string | null;
    args?: unknown;
    partialArgs?: Array<{
      jsonPath: string;
      stringValue?: string | null;
      numberValue?: number | null;
      boolValue?: boolean | null;
      nullValue?: unknown;
      willContinue?: boolean | null;
    }> | null;
    willContinue?: boolean | null;
  };
  thoughtSignature?: string | null;
};

export class GoogleStreamToolCallArguments {
  private activeStreamingToolCalls: ActiveStreamingToolCall[] = [];

  constructor(
    private readonly generateId: () => string,
    private readonly providerOptionsName: string,
  ) {}

  processStreamingFunctionCallParts(
    parts:
      | Array<StreamingFunctionCallPart | Record<string, unknown>>
      | null
      | undefined,
  ): { events: LanguageModelV4StreamPart[]; hasToolCalls: boolean } {
    if (parts == null) return { events: [], hasToolCalls: false };

    const events: LanguageModelV4StreamPart[] = [];
    let hasToolCalls = false;

    for (const part of parts) {
      if (!('functionCall' in part)) continue;

      const fc = (part as StreamingFunctionCallPart).functionCall;
      const providerMeta = (part as StreamingFunctionCallPart).thoughtSignature
        ? {
            [this.providerOptionsName]: {
              thoughtSignature: (part as StreamingFunctionCallPart)
                .thoughtSignature,
            },
          }
        : undefined;

      const isStreamingChunk =
        fc.partialArgs != null || (fc.name != null && fc.willContinue === true);
      const isTerminalChunk =
        'functionCall' in part &&
        fc.name == null &&
        fc.args == null &&
        fc.partialArgs == null &&
        fc.willContinue == null;

      if (isStreamingChunk) {
        if (fc.name != null && fc.willContinue === true) {
          const toolCallId = this.generateId();
          this.activeStreamingToolCalls.push({
            toolCallId,
            toolName: fc.name,
            accumulatedArgs: {},
            jsonText: '',
            providerMetadata: providerMeta,
          });

          events.push({
            type: 'tool-input-start',
            id: toolCallId,
            toolName: fc.name,
            providerMetadata: providerMeta,
          });

          if (fc.partialArgs != null) {
            const delta = applyPartialArgs(
              this.activeStreamingToolCalls[
                this.activeStreamingToolCalls.length - 1
              ],
              fc.partialArgs,
            );
            if (delta.length > 0) {
              events.push({
                type: 'tool-input-delta',
                id: toolCallId,
                delta,
                providerMetadata: providerMeta,
              });
            }
          }
        } else if (
          fc.partialArgs != null &&
          this.activeStreamingToolCalls.length > 0
        ) {
          const active =
            this.activeStreamingToolCalls[
              this.activeStreamingToolCalls.length - 1
            ];
          const delta = applyPartialArgs(active, fc.partialArgs);
          if (delta.length > 0) {
            events.push({
              type: 'tool-input-delta',
              id: active.toolCallId,
              delta,
              providerMetadata: providerMeta,
            });
          }
        }
      } else if (isTerminalChunk && this.activeStreamingToolCalls.length > 0) {
        const active = this.activeStreamingToolCalls.pop()!;
        const finalArgs = JSON.stringify(active.accumulatedArgs);

        const closingDelta = finalArgs.slice(active.jsonText.length);
        if (closingDelta.length > 0) {
          events.push({
            type: 'tool-input-delta',
            id: active.toolCallId,
            delta: closingDelta,
            providerMetadata: active.providerMetadata,
          });
        }

        events.push({
          type: 'tool-input-end',
          id: active.toolCallId,
          providerMetadata: active.providerMetadata,
        });

        events.push({
          type: 'tool-call',
          toolCallId: active.toolCallId,
          toolName: active.toolName,
          input: finalArgs,
          providerMetadata: active.providerMetadata,
        });

        hasToolCalls = true;
      }
    }

    return { events, hasToolCalls };
  }
}

function resolvePartialArgValue(arg: {
  stringValue?: string | null;
  numberValue?: number | null;
  boolValue?: boolean | null;
  nullValue?: unknown;
}): { value: unknown; json: string } | undefined {
  if (arg.stringValue != null)
    return { value: arg.stringValue, json: JSON.stringify(arg.stringValue) };
  if (arg.numberValue != null)
    return { value: arg.numberValue, json: JSON.stringify(arg.numberValue) };
  if (arg.boolValue != null)
    return { value: arg.boolValue, json: JSON.stringify(arg.boolValue) };
  if ('nullValue' in arg) return { value: null, json: 'null' };
  return undefined;
}

function applyPartialArgs(
  active: ActiveStreamingToolCall,
  partialArgs: Array<{
    jsonPath: string;
    stringValue?: string | null;
    numberValue?: number | null;
    boolValue?: boolean | null;
    nullValue?: unknown;
    willContinue?: boolean | null;
  }>,
): string {
  let delta = '';

  for (const arg of partialArgs) {
    const key = arg.jsonPath.replace(/^\$\./, '');
    if (!key) continue;

    const isStringContinuation =
      arg.stringValue != null && key in active.accumulatedArgs;

    if (isStringContinuation) {
      const escaped = JSON.stringify(arg.stringValue).slice(1, -1);
      active.accumulatedArgs[key] =
        (active.accumulatedArgs[key] as string) + arg.stringValue;
      active.jsonText += escaped;
      delta += escaped;
      continue;
    }

    const resolved = resolvePartialArgValue(arg);
    if (resolved == null) continue;

    active.accumulatedArgs[key] = resolved.value;

    // For strings that will continue, strip the closing quote
    const valueJson =
      arg.stringValue != null && arg.willContinue
        ? resolved.json.slice(0, -1)
        : resolved.json;

    const prefix =
      active.jsonText === '' ? '{' : active.jsonText.endsWith('{') ? '' : ',';
    const fragment = `${prefix}${JSON.stringify(key)}:${valueJson}`;
    active.jsonText += fragment;
    delta += fragment;
  }

  return delta;
}
