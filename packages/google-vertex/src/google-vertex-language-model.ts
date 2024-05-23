import { LanguageModelV1 } from '@ai-sdk/provider';
import { VertexAI } from '@google-cloud/vertexai';
import {
  GoogleVertexModelId,
  GoogleVertexSettings,
} from './google-vertex-settings';
import { convertToGoogleVertexContentRequest } from './convert-to-google-vertex-content-request';
import { mapGoogleVertexFinishReason } from './map-google-vertex-finish-reason';

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

  async doGenerate(
    options: Parameters<LanguageModelV1['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<LanguageModelV1['doGenerate']>>> {
    console.log('doGenerate', options);

    // TODO settings

    const generativeModel = this.config.vertexAI.getGenerativeModel({
      model: this.modelId,
    });

    const contentRequest = convertToGoogleVertexContentRequest(options.prompt);

    const { response } = await generativeModel.generateContent(contentRequest);

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
    throw new Error('Method not implemented.');
  }
}
