import {
  RealtimeModelV4ClientEvent,
  RealtimeModelV4ServerEvent,
  RealtimeModelV4SessionConfig,
} from '@ai-sdk/provider';
import { convertJSONSchemaToOpenAPISchema } from '../convert-json-schema-to-openapi-schema';
import { getModelPath } from '../get-model-path';

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

  private get responseId(): string {
    return `google-resp-${this.turnCounter}`;
  }

  private get itemId(): string {
    return `google-item-${this.turnCounter}`;
  }

  private nextTurn(): void {
    this.turnCounter++;
    this.hasAudio = false;
    this.hasText = false;
    this.hasTranscript = false;
  }

  parseServerEvent(
    raw: unknown,
  ): RealtimeModelV4ServerEvent | RealtimeModelV4ServerEvent[] {
    const data = raw as Record<string, any>;

    if (data.setupComplete != null) {
      return { type: 'session-created', raw };
    }

    if (data.toolCall != null) {
      const functionCalls = data.toolCall.functionCalls ?? [];
      return functionCalls.map(
        (fc: { id: string; name: string; args?: Record<string, unknown> }) => ({
          type: 'function-call-arguments-done' as const,
          responseId: this.responseId,
          itemId: this.itemId,
          callId: fc.id,
          name: fc.name,
          arguments: JSON.stringify(fc.args ?? {}),
          raw,
        }),
      );
    }

    if (data.toolCallCancellation != null) {
      return {
        type: 'unknown',
        rawType: 'toolCallCancellation',
        raw,
      };
    }

    if (data.serverContent != null) {
      return this.parseServerContent(data.serverContent, raw);
    }

    return { type: 'unknown', rawType: String(Object.keys(data)[0]), raw };
  }

  private parseServerContent(
    serverContent: Record<string, any>,
    raw: unknown,
  ): RealtimeModelV4ServerEvent | RealtimeModelV4ServerEvent[] {
    const events: RealtimeModelV4ServerEvent[] = [];

    if (serverContent.interrupted) {
      events.push({
        type: 'speech-started',
        raw,
      });
    }

    if (serverContent.modelTurn?.parts) {
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
      events.push({
        type: 'response-done',
        responseId: this.responseId,
        status: 'completed',
        raw,
      });
      this.nextTurn();
    }

    if (events.length === 0) {
      return { type: 'unknown', rawType: 'serverContent', raw };
    }

    return events.length === 1 ? events[0] : events;
  }

  serializeClientEvent(
    event: RealtimeModelV4ClientEvent,
    modelId: string,
  ): unknown {
    switch (event.type) {
      case 'session-update':
        return { setup: { model: getModelPath(modelId) } };

      case 'input-audio-append':
        return {
          realtimeInput: {
            audio: {
              data: event.audio,
              mimeType: 'audio/pcm;rate=16000',
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
              clientContent: {
                turns: [{ role: 'user', parts: [{ text: item.text }] }],
                turnComplete: true,
              },
            };
          case 'function-call-output': {
            let response: unknown = {};
            try {
              response = JSON.parse(item.output);
            } catch {
              // fall back to empty object
            }
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

  if (config?.providerOptions != null) {
    Object.assign(setup, config.providerOptions);
  }

  return setup;
}
