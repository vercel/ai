import {
  LanguageModelV1,
  LanguageModelV1Prompt,
  LanguageModelV1StreamPart,
} from '@ai-sdk/provider';
import { GenerateContentResponse, VertexAI } from '@google-cloud/vertexai';
import { convertToGoogleVertexContentRequest } from './convert-to-google-vertex-content-request';
import {
  GoogleVertexModelId,
  GoogleVertexSettings,
} from './google-vertex-settings';
import { mapGoogleVertexFinishReason } from './map-google-vertex-finish-reason';
import { convertAsyncGeneratorToReadableStream } from '@ai-sdk/provider-utils';

type GoogleVertexAIConfig = {
  vertexAI: VertexAI;
  generateId: () => string;
};

export class GoogleVertexLanguageModel implements LanguageModelV1 {
  readonly specificationVersion = 'v1';
  readonly provider = 'google-vertex';
  readonly defaultObjectGenerationMode = 'json';

  readonly modelId: GoogleVertexModelId;
  readonly settings: GoogleVertexSettings;

  private readonly config: GoogleVertexAIConfig;

  constructor(
    modelId: GoogleVertexModelId,
    settings: GoogleVertexSettings,
    config: GoogleVertexAIConfig,
  ) {
    this.modelId = modelId;
    this.settings = settings;
    this.config = config;
  }

  // TODO setting support
  private getArgs({ prompt }: { prompt: LanguageModelV1Prompt }) {
    const model = this.config.vertexAI.getGenerativeModel({
      model: this.modelId,
    });

    const contentRequest = convertToGoogleVertexContentRequest(prompt);

    return {
      model,
      contentRequest,
    };
  }

  async doGenerate(
    options: Parameters<LanguageModelV1['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>> {
    console.log('doGenerate', options);

    const { model, contentRequest } = this.getArgs(options);

    const { response } = await model.generateContent(contentRequest);

    console.log(JSON.stringify(response, null, 2));

    const firstCandidate = response.candidates?.[0];

    if (firstCandidate == null) {
      // TODO dedicated error
      throw new Error('No candidates returned');
    }

    const usageMetadata = response.usageMetadata;

    return {
      text: firstCandidate.content.parts.map(part => part.text).join(''),
      finishReason: mapGoogleVertexFinishReason({
        finishReason: firstCandidate.finishReason,
        hasToolCalls: false,
      }),
      usage: {
        promptTokens: usageMetadata?.promptTokenCount ?? NaN,
        completionTokens: usageMetadata?.candidatesTokenCount ?? NaN,
      },
      rawCall: {
        rawPrompt: contentRequest,
        rawSettings: {},
      },
    };
  }

  async doStream(
    options: Parameters<LanguageModelV1['doStream']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doStream']>>> {
    console.log('doStream', options);

    const { model, contentRequest } = this.getArgs(options);

    const { stream } = await model.generateContentStream(contentRequest);

    return {
      stream: convertAsyncGeneratorToReadableStream(stream).pipeThrough(
        new TransformStream<GenerateContentResponse, LanguageModelV1StreamPart>(
          {
            transform(chunk, controller) {
              // console.log(JSON.stringify(chunk, null, 2));

              const firstCandidate = chunk.candidates?.[0];

              if (firstCandidate == null) {
                return;
              }

              const textDelta = firstCandidate.content.parts
                .map(part => part.text)
                .join('');

              controller.enqueue({
                type: 'text-delta',
                textDelta,
              });
            },

            flush(controller) {},
          },
        ),
      ),
      rawCall: {
        rawPrompt: contentRequest,
        rawSettings: {},
      },
    };
  }
}
