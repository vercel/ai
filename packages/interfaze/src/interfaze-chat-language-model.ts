import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4Content,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
  SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import {
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import type { InterfazeChatModelId } from './interfaze-chat-language-model-options';
import { injectInterfazeVideoSentinels } from './interfaze-video-parts';
import {
  SideChannelFilter,
  stripJsonFence,
  stripSideChannels,
} from './side-channels';

type InterfazeChatConfig = ConstructorParameters<
  typeof OpenAICompatibleChatLanguageModel
>[1];

/** Interfaze uses schema-less `json_object` mode only when no schema is given. */
function isFencedJsonMode(
  responseFormat: LanguageModelV4CallOptions['responseFormat'],
): boolean {
  return responseFormat?.type === 'json' && responseFormat.schema == null;
}

function mergeInterfazeMetadata(
  providerMetadata: LanguageModelV4GenerateResult['providerMetadata'],
  extracted: { reasoning?: string; precontext?: unknown[] },
): SharedV4ProviderMetadata | undefined {
  const existing = (providerMetadata?.interfaze ?? {}) as {
    vcache?: boolean;
    reasoning?: string;
    precontext?: unknown[];
  };

  if (extracted.reasoning == null && extracted.precontext == null) {
    return providerMetadata;
  }

  return {
    ...providerMetadata,
    interfaze: {
      ...existing,
      ...(existing.reasoning == null && extracted.reasoning != null
        ? { reasoning: extracted.reasoning }
        : {}),
      ...(existing.precontext == null && extracted.precontext != null
        ? { precontext: extracted.precontext }
        : {}),
      // `precontext` may hold arbitrary provider-defined JSON entries that
      // aren't statically known to satisfy `JSONValue`, even though they
      // always do at runtime (parsed straight out of the response JSON).
    } as SharedV4ProviderMetadata[string],
  };
}

export class InterfazeChatLanguageModel
  extends OpenAICompatibleChatLanguageModel
  implements LanguageModelV4
{
  static [WORKFLOW_SERIALIZE](model: InterfazeChatLanguageModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: InterfazeChatModelId;
    config: InterfazeChatConfig;
  }) {
    return new InterfazeChatLanguageModel(options.modelId, options.config);
  }

  async doGenerate(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
    const result = await super.doGenerate({
      ...options,
      prompt: injectInterfazeVideoSentinels(options.prompt),
    });

    let extractedReasoning: string | undefined;
    let extractedPrecontext: unknown[] | undefined;
    const fencedJsonMode = isFencedJsonMode(options.responseFormat);

    const content: LanguageModelV4Content[] = [];
    for (const part of result.content) {
      if (part.type !== 'text') {
        content.push(part);
        continue;
      }

      // Interfaze's non-streaming responses normally already
      // separate `<think>`/`<precontext>` into top-level fields, so this is a
      // no-op unless a tag leaks into `content`.
      const stripped = stripSideChannels(part.text);
      extractedReasoning = stripped.reasoning ?? extractedReasoning;
      extractedPrecontext = stripped.precontext ?? extractedPrecontext;

      const text = fencedJsonMode
        ? stripJsonFence(stripped.text)
        : stripped.text;
      if (text.length > 0) {
        content.push({ ...part, text });
      }
    }

    return {
      ...result,
      content,
      providerMetadata: mergeInterfazeMetadata(result.providerMetadata, {
        reasoning: extractedReasoning,
        precontext: extractedPrecontext,
      }),
    };
  }

  async doStream(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4StreamResult> {
    const result = await super.doStream({
      ...options,
      prompt: injectInterfazeVideoSentinels(options.prompt),
    });

    const filter = new SideChannelFilter();
    let rawAccumulated = '';

    return {
      ...result,
      stream: result.stream.pipeThrough(
        new TransformStream<
          LanguageModelV4StreamPart,
          LanguageModelV4StreamPart
        >({
          transform(part, controller) {
            if (part.type === 'text-delta') {
              if (part.delta.length > 0) {
                rawAccumulated += part.delta;
                const visible = filter.feed(part.delta);
                if (visible.length > 0) {
                  controller.enqueue({ ...part, delta: visible });
                }
              }
              return;
            }

            if (part.type === 'text-end') {
              const tail = filter.flush();
              if (tail.length > 0) {
                controller.enqueue({
                  type: 'text-delta',
                  id: part.id,
                  delta: tail,
                });
              }
              controller.enqueue(part);
              return;
            }

            if (part.type === 'finish') {
              const { reasoning, precontext } =
                stripSideChannels(rawAccumulated);
              controller.enqueue({
                ...part,
                providerMetadata: mergeInterfazeMetadata(
                  part.providerMetadata,
                  {
                    reasoning,
                    precontext,
                  },
                ),
              });
              return;
            }

            controller.enqueue(part);
          },
        }),
      ),
    };
  }
}
