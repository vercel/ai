import { LanguageModelV1 } from '@ai-sdk/provider';
import { VertexAI } from '@google-cloud/vertexai';
import {
  GoogleVertexModelId,
  GoogleVertexSettings,
} from './google-vertex-settings';
import { convertToGoogleVertexContentRequest } from './convert-to-google-vertex-content-request';

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

    const result = await generativeModel.generateContent(contentRequest);

    console.log(JSON.stringify(result, null, 2));

    const firstCandidate = result.response.candidates?.[0];

    if (firstCandidate == null) {
      throw new Error('No candidates returned');
    }

    const text = firstCandidate.content.parts
      .map(part => part.text)
      .join('\n\n');

    const usageMetadata = result.response.usageMetadata;

    return {
      text,
      finishReason: 'other', // TODO
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
