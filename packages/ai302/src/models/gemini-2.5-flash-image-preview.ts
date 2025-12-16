import type {
  ImageModelV2CallOptions,
  ImageModelV2CallWarning,
} from '@ai-sdk/provider';
import { combineHeaders, postJsonToApi } from '@ai-sdk/provider-utils';
import { BaseModelHandler } from './base-model';
import {
  createJsonResponseHandler,
  statusCodeErrorResponseHandler,
} from '../utils/api-handlers';

interface GeminiFlashImagePreviewApiRequest {
  contents: Array<{
    parts: Array<{
      text: string;
    }>;
  }>;
  generationConfig: {
    responseModalities: string[];
  };
}

interface GeminiFlashImagePreviewApiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text?: string;
        url?: string;
      }>;
      role: string;
    };
    finishReason: string;
  }>;
  modelVersion: string;
  responseId: string;
  usageMetadata: {
    candidatesTokenCount: number;
    candidatesTokensDetails: Array<{
      modality: string;
      tokenCount: number;
    }>;
    promptTokenCount: number;
    promptTokensDetails: Array<{
      modality: string;
      tokenCount: number;
    }>;
    totalTokenCount: number;
  };
}

export class Gemini25FlashImagePreviewHandler extends BaseModelHandler {
  protected async processRequest({
    prompt,
    n,
    size,
    aspectRatio,
    seed,
    providerOptions,
    headers,
    abortSignal,
  }: ImageModelV2CallOptions) {
    const warnings: ImageModelV2CallWarning[] = [];

    if (n != null && n > 1) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'n',
        details:
          'Gemini 2.5 Flash Image Preview does not support batch generation',
      });
    }

    if (size != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'size',
        details:
          'Gemini 2.5 Flash Image Preview does not support custom size control',
      });
    }

    if (aspectRatio != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'aspectRatio',
        details:
          'Gemini 2.5 Flash Image Preview does not support custom aspect ratio control',
      });
    }

    if (seed != null) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'seed',
        details: 'Gemini 2.5 Flash Image Preview does not support seed control',
      });
    }

    const requestBody: GeminiFlashImagePreviewApiRequest = {
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    };

    const baseUrl = this.config.url({
      modelId: this.modelId,
      path: '/google/v1/models/gemini-2.5-flash-image-preview',
    });
    const urlWithQuery = `${baseUrl}?response_format=url`;

    const { value: response, responseHeaders } =
      await postJsonToApi<GeminiFlashImagePreviewApiResponse>({
        url: urlWithQuery,
        headers: combineHeaders(this.config.headers(), headers),
        body: {
          ...requestBody,
          ...(providerOptions.ai302 ?? {}),
        },
        failedResponseHandler: statusCodeErrorResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(),
        abortSignal,
        fetch: this.config.fetch,
      });

    // Validate response structure
    if (!response.candidates || response.candidates.length === 0) {
      throw new Error(
        'Invalid response structure from Gemini 2.5 Flash Image Preview API: missing candidates.',
      );
    }

    const candidate = response.candidates[0];
    if (!candidate.content || !candidate.content.parts) {
      throw new Error(
        'Invalid response structure from Gemini 2.5 Flash Image Preview API: missing content parts.',
      );
    }

    // Find the URL part in the response
    const urlPart = candidate.content.parts.find(part => part.url);
    if (!urlPart || !urlPart.url) {
      throw new Error(
        'Invalid response structure from Gemini 2.5 Flash Image Preview API: missing image URL.',
      );
    }

    const imageUrl = urlPart.url;
    const images = await this.downloadImages([imageUrl]);

    const modelResponse = {
      timestamp: new Date(),
      modelId: this.modelId,
      headers: responseHeaders,
    };

    return {
      images,
      warnings,
      response: modelResponse,
    };
  }
}
