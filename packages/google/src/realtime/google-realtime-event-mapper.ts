import type {
  Experimental_RealtimeModelV4 as RealtimeModelV4,
  Experimental_RealtimeModelV4ClientEvent as RealtimeModelV4ClientEvent,
  Experimental_RealtimeModelV4FunctionCallOutput as RealtimeModelV4FunctionCallOutput,
  Experimental_RealtimeModelV4ServerEvent as RealtimeModelV4ServerEvent,
  Experimental_RealtimeModelV4SessionConfig as RealtimeModelV4SessionConfig,
  Experimental_RealtimeModelV4Usage as RealtimeModelV4Usage,
} from '@ai-sdk/provider';
import { safeParseJSON } from '@ai-sdk/provider-utils';
import { convertJSONSchemaToOpenAPISchema } from '../convert-json-schema-to-openapi-schema';
import { getModelPath } from '../get-model-path';

type GoogleRealtimeFunctionCall = {
  id: string;
  name: string;
  args?: Record<string, unknown>;
};

type GoogleRealtimeServerContent = {
  interrupted?: boolean;
  modelTurn?: {
    parts?: Array<{
      inlineData?: { data?: string };
      text?: string;
    }>;
  };
  outputTranscription?: { text?: string };
  inputTranscription?: { text?: string };
  turnComplete?: boolean;
};

type GoogleRealtimeTokenDetail = {
  modality?: string;
  tokenCount?: number;
};

type GoogleRealtimeUsageMetadata = {
  promptTokenCount?: number;
  responseTokenCount?: number;
  totalTokenCount?: number;
  promptTokensDetails?: GoogleRealtimeTokenDetail[];
  responseTokensDetails?: GoogleRealtimeTokenDetail[];
};

type GoogleRealtimeWireEvent = {
  setupComplete?: unknown;
  toolCall?: {
    functionCalls?: GoogleRealtimeFunctionCall[];
  };
  toolCallCancellation?: unknown;
  serverContent?: GoogleRealtimeServerContent;
  inputTranscription?: { text?: string };
  usageMetadata?: GoogleRealtimeUsageMetadata;
};

/**
 * Stateful event mapper for Google's Gemini Live API.
 *
 * Unlike OpenAI/xAI, Google's events don't have response/item IDs and
 * a single message can contain multiple pieces of data. This class
 * tracks turn state to generate consistent synthetic IDs.
 */
export class GoogleRealtimeEventMapper {
  private turnCounter = 0;
  private hasAudio = false;
  private hasText = false;
  private hasTranscript = false;
  private turnClosed = false;
  private inputAudioRate = 16000;

  private get responseId(): string {
    return `google-resp-${this.turnCounter}`;
  }

  private get itemId(): string {
    return `google-item-${this.turnCounter}`;
  }

  /**
   * Rolls over to the next turn lazily, only once new model content actually
   * arrives. `turnComplete` merely marks the current turn closed; the counter
   * is not advanced until the next response begins. This keeps a transcript
   * that arrives shortly after `turnComplete` attached to the turn it belongs
   * to, since Google delivers transcription independently with no guaranteed
   * ordering relative to `turnComplete`.
   */
  private beginTurnIfClosed(): void {
    if (!this.turnClosed) return;
    this.turnCounter++;
    this.hasAudio = false;
    this.hasText = false;
    this.hasTranscript = false;
    this.turnClosed = false;
  }

  parseServerEvent(
    raw: unknown,
  ): RealtimeModelV4ServerEvent | RealtimeModelV4ServerEvent[] {
    const data = raw as GoogleRealtimeWireEvent;

    if (data.setupComplete != null) {
      return { type: 'session-created', raw };
    }

    if (data.toolCall != null) {
      this.beginTurnIfClosed();
      const functionCalls = data.toolCall.functionCalls ?? [];
      return functionCalls.flatMap(functionCall => {
        const args = JSON.stringify(functionCall.args ?? {});
        return [
          {
            type: 'function-call-arguments-delta' as const,
            responseId: this.responseId,
            itemId: this.itemId,
            callId: functionCall.id,
            delta: args,
            raw,
          },
          {
            type: 'function-call-arguments-done' as const,
            responseId: this.responseId,
            itemId: this.itemId,
            callId: functionCall.id,
            name: functionCall.name,
            arguments: args,
            raw,
          },
        ];
      });
    }

    if (data.toolCallCancellation != null) {
      return {
        type: 'custom',
        rawType: 'toolCallCancellation',
        raw,
      };
    }

    if (data.serverContent != null) {
      return this.parseServerContent(
        data.serverContent,
        raw,
        data.usageMetadata,
      );
    }

    if (data.inputTranscription?.text != null) {
      return {
        type: 'input-transcription-completed',
        itemId: `google-input-${this.turnCounter}`,
        transcript: data.inputTranscription.text,
        raw,
      };
    }

    return { type: 'custom', rawType: String(Object.keys(data)[0]), raw };
  }

  private parseServerContent(
    serverContent: GoogleRealtimeServerContent,
    raw: unknown,
    usageMetadata?: GoogleRealtimeUsageMetadata,
  ): RealtimeModelV4ServerEvent | RealtimeModelV4ServerEvent[] {
    const events: RealtimeModelV4ServerEvent[] = [];

    if (serverContent.interrupted) {
      events.push({
        type: 'speech-started',
        raw,
      });
    }

    if (serverContent.modelTurn?.parts) {
      // New model response content marks the start of the next turn.
      this.beginTurnIfClosed();
      for (const part of serverContent.modelTurn.parts) {
        if (part.inlineData?.data) {
          this.hasAudio = true;
          events.push({
            type: 'audio-delta',
            responseId: this.responseId,
            itemId: this.itemId,
            delta: part.inlineData.data,
            raw,
          });
        }
        if (part.text) {
          this.hasText = true;
          events.push({
            type: 'text-delta',
            responseId: this.responseId,
            itemId: this.itemId,
            delta: part.text,
            raw,
          });
        }
      }
    }

    if (serverContent.outputTranscription?.text) {
      this.hasTranscript = true;
      events.push({
        type: 'audio-transcript-delta',
        responseId: this.responseId,
        itemId: this.itemId,
        delta: serverContent.outputTranscription.text,
        raw,
      });
    }

    if (serverContent.inputTranscription?.text) {
      events.push({
        type: 'input-transcription-completed',
        itemId: `google-input-${this.turnCounter}`,
        transcript: serverContent.inputTranscription.text,
        raw,
      });
    }

    if (serverContent.turnComplete) {
      if (this.hasAudio) {
        events.push({
          type: 'audio-done',
          responseId: this.responseId,
          itemId: this.itemId,
          raw,
        });
      }
      if (this.hasText) {
        events.push({
          type: 'text-done',
          responseId: this.responseId,
          itemId: this.itemId,
          raw,
        });
      }
      if (this.hasTranscript) {
        events.push({
          type: 'audio-transcript-done',
          responseId: this.responseId,
          itemId: this.itemId,
          raw,
        });
      }
      // Usage is attached to `response-done`, which is emitted on `turnComplete`.
      // This assumes Gemini delivers the turn's final `usageMetadata` on the
      // same message as `turnComplete`; a usage-only trailing frame (no
      // `turnComplete`) would not be captured here.
      const usage = mapGoogleUsage(usageMetadata);
      events.push({
        type: 'response-done',
        responseId: this.responseId,
        status: 'completed',
        ...(usage != null ? { usage } : {}),
        raw,
      });
      // Mark the turn closed but defer advancing the counter until the next
      // response actually begins (see `beginTurnIfClosed`).
      this.turnClosed = true;
    }

    if (events.length === 0) {
      return { type: 'custom', rawType: 'serverContent', raw };
    }

    return events.length === 1 ? events[0] : events;
  }

  serializeClientEvent(
    event: RealtimeModelV4ClientEvent,
    modelId: string,
  ): ReturnType<RealtimeModelV4['serializeClientEvent']> {
    switch (event.type) {
      case 'session-update':
        // Capture the configured capture rate so input audio blobs advertise
        // the real rate. Google accepts any rate as long as the blob's mimeType
        // matches; a mismatched label corrupts custom-rate audio.
        if (event.config.inputAudioFormat?.rate != null) {
          this.inputAudioRate = event.config.inputAudioFormat.rate;
        }
        return {
          setup: buildGoogleSessionConfig(event.config, modelId),
        };

      case 'input-audio-append':
        return {
          realtimeInput: {
            audio: {
              data: event.audio,
              mimeType: `audio/pcm;rate=${this.inputAudioRate}`,
            },
          },
        };

      case 'input-audio-commit':
      case 'input-audio-clear':
      case 'response-create':
      case 'response-cancel':
      case 'conversation-item-truncate':
        return null;

      case 'conversation-item-create': {
        const item = event.item;
        switch (item.type) {
          case 'text-message':
            return {
              realtimeInput: {
                text: item.text,
              },
            };
          case 'function-call-output':
            return serializeFunctionCallOutput(item);
          case 'audio-message':
            return null;
        }
        break;
      }
    }

    return null;
  }
}

/**
 * Maps Gemini Live `usageMetadata` to normalized usage. Google reports usage
 * per modality in `promptTokensDetails` / `responseTokensDetails`.
 *
 * Field names are Live-API-specific: the Live `UsageMetadata` uses
 * `responseTokenCount` / `responseTokensDetails` for output, NOT the
 * `candidatesTokenCount` / `candidatesTokensDetails` of the regular
 * `generateContent` response (see google-language-model.ts). Do not "align"
 * these to `candidates*` — they are different wire shapes.
 *
 * Caveats (the normalized usage type only has text/audio buckets):
 * - Only AUDIO and TEXT modality entries are summed. Other modalities (e.g.
 *   IMAGE/VIDEO from screen-share or video input) are dropped, so for such
 *   sessions the normalized input total will be lower than what Google billed.
 * - When details are absent we fall back to the aggregate counts as TEXT. On an
 *   audio turn that omits details this misclassifies audio tokens as text, which
 *   matters to a consumer applying per-modality pricing.
 */
function mapGoogleUsage(
  usageMetadata: GoogleRealtimeUsageMetadata | undefined,
): RealtimeModelV4Usage | undefined {
  if (usageMetadata == null) return undefined;

  const input = sumByModality(usageMetadata.promptTokensDetails);
  const output = sumByModality(usageMetadata.responseTokensDetails);

  return compactUsage({
    inputTextTokens:
      usageMetadata.promptTokensDetails != null
        ? input.text
        : usageMetadata.promptTokenCount,
    inputAudioTokens: input.audio,
    outputTextTokens:
      usageMetadata.responseTokensDetails != null
        ? output.text
        : usageMetadata.responseTokenCount,
    outputAudioTokens: output.audio,
  });
}

/** Aggregate Gemini per-modality token details into text/audio buckets. */
function sumByModality(details: GoogleRealtimeTokenDetail[] | undefined): {
  text?: number;
  audio?: number;
} {
  if (details == null) return {};
  const totals: { text?: number; audio?: number } = {};
  for (const detail of details) {
    const count = detail.tokenCount ?? 0;
    const modality = detail.modality?.toUpperCase();
    if (modality === 'AUDIO') {
      totals.audio = (totals.audio ?? 0) + count;
    } else if (modality === 'TEXT') {
      totals.text = (totals.text ?? 0) + count;
    }
  }
  return totals;
}

/** Drop `undefined` fields; return `undefined` when nothing is observable. */
function compactUsage(
  usage: RealtimeModelV4Usage,
): RealtimeModelV4Usage | undefined {
  const result: RealtimeModelV4Usage = {};
  for (const [key, value] of Object.entries(usage)) {
    if (value != null) {
      result[key as keyof RealtimeModelV4Usage] = value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

async function serializeFunctionCallOutput(
  item: RealtimeModelV4FunctionCallOutput,
): Promise<unknown> {
  const parseResult = await safeParseJSON({ text: item.output });
  const response = parseResult.success ? parseResult.value : {};

  return {
    toolResponse: {
      functionResponses: [
        {
          id: item.callId,
          name: item.name,
          response,
        },
      ],
    },
  };
}

/**
 * Builds a Google-specific session configuration from a normalized config.
 * Used to construct the `bidiGenerateContentSetup` payload for auth token creation.
 */
export function buildGoogleSessionConfig(
  config: RealtimeModelV4SessionConfig | undefined,
  modelId: string,
): Record<string, unknown> {
  const setup: Record<string, unknown> = {
    model: getModelPath(modelId),
  };

  const generationConfig: Record<string, unknown> = {};

  if (config?.outputModalities != null) {
    generationConfig.responseModalities = config.outputModalities.map(m =>
      m.toUpperCase(),
    );
  } else {
    generationConfig.responseModalities = ['AUDIO'];
  }

  if (config?.voice != null) {
    generationConfig.speechConfig = {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: config.voice,
        },
      },
    };
  }

  setup.generationConfig = generationConfig;

  if (config?.instructions != null) {
    setup.systemInstruction = {
      parts: [{ text: config.instructions }],
    };
  }

  if (config?.tools != null && config.tools.length > 0) {
    setup.tools = [
      {
        functionDeclarations: config.tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          parameters: convertJSONSchemaToOpenAPISchema(tool.parameters),
        })),
      },
    ];
  }

  if (config?.inputAudioTranscription != null) {
    setup.inputAudioTranscription = {};
  }

  if (config?.outputAudioTranscription != null) {
    setup.outputAudioTranscription = {};
  }

  if (config?.providerOptions != null) {
    Object.assign(setup, config.providerOptions);
  }

  return setup;
}
