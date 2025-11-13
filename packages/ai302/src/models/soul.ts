import type {
  ImageModelV2CallOptions,
  ImageModelV2CallWarning,
} from '@ai-sdk/provider';
import { combineHeaders, postJsonToApi } from '@ai-sdk/provider-utils';
import { type SoulSubmitResponse, type SoulTaskResponse } from '../ai302-types';
import {
  createJsonResponseHandler,
  statusCodeErrorResponseHandler,
} from '../utils/api-handlers';
import { BaseModelHandler } from './base-model';

const SUPPORTED_ASPECT_RATIOS = [
  '9:16',
  '3:4',
  '2:3',
  '1:1',
  '4:3',
  '16:9',
  '3:2',
] as const;

const SUPPORTED_QUALITIES = ['basic', 'high'] as const;

const POLL_INTERVAL = 2000; // 2 seconds
const MAX_POLL_TIME = 300000; // 5 minutes

// Default style ID for GENERAL style
const DEFAULT_STYLE_ID = '464ea177-8d40-4940-8d9d-b438bab269c7';

export class SoulHandler extends BaseModelHandler {
  private async pollTask(
    taskId: string,
    abortSignal?: AbortSignal,
  ): Promise<SoulTaskResponse> {
    const startTime = Date.now();
    const fetchFn = this.config.fetch || fetch;

    while (true) {
      if (abortSignal?.aborted) {
        throw new Error('Task polling aborted');
      }

      if (Date.now() - startTime > MAX_POLL_TIME) {
        throw new Error('Task polling timed out');
      }

      const response = await fetchFn(
        `${this.config.url({ modelId: this.modelId, path: `/higgsfield/task/${taskId}/fetch` })}`,
        {
          method: 'GET',
          headers: this.config.headers() as HeadersInit,
          signal: abortSignal,
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as SoulTaskResponse;

      // If jobs exist and all are completed, return the result
      if (data.jobs && data.jobs.length > 0) {
        const allCompleted = data.jobs.every(job => job.status === 'completed');
        const anyFailed = data.jobs.some(job => job.status === 'failed');

        if (anyFailed) {
          throw new Error('Some image generation jobs failed');
        }

        if (allCompleted) {
          return data;
        }
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }
  }

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

    if (n != null && n > 4) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'n',
        details:
          'Soul generates 4 images per request. Use n parameter to control how many to return (max 4)',
      });
    }

    // Convert size to aspect ratio if provided
    const sizeBasedAspectRatio = this.sizeToAspectRatio(
      size,
      SUPPORTED_ASPECT_RATIOS,
      warnings,
    );

    if (size != null && aspectRatio != null) {
      warnings.push({
        type: 'other',
        message:
          'Both size and aspectRatio provided. Size will be converted to aspect ratio and aspectRatio parameter will be ignored.',
      });
    }

    // Validate and set aspect ratio (prioritize size-based aspect ratio)
    let validatedAspectRatio = '1:1'; // default
    const targetAspectRatio = sizeBasedAspectRatio || aspectRatio;

    if (targetAspectRatio) {
      if (SUPPORTED_ASPECT_RATIOS.includes(targetAspectRatio as any)) {
        validatedAspectRatio = targetAspectRatio;
      } else {
        warnings.push({
          type: 'unsupported-setting',
          setting: sizeBasedAspectRatio ? 'size' : 'aspectRatio',
          details: `Unsupported aspect ratio: ${targetAspectRatio}. Supported values are: ${SUPPORTED_ASPECT_RATIOS.join(', ')}. Using default 1:1`,
        });
      }
    }

    // Get parameters from providerOptions
    const ai302Options = providerOptions?.ai302 || {};
    const quality = (ai302Options.quality as string) || 'high';
    const styleId = (ai302Options.style_id as string) || DEFAULT_STYLE_ID;
    const enhancePrompt = (ai302Options.enhance_prompt as boolean) ?? true;
    const negativePrompt = (ai302Options.negative_prompt as string) || '';

    // Validate quality
    if (!SUPPORTED_QUALITIES.includes(quality as any)) {
      warnings.push({
        type: 'other',
        message: `Invalid quality: ${quality}. Supported values are: ${SUPPORTED_QUALITIES.join(', ')}. Using default high`,
      });
    }

    const { value: submitResponse, responseHeaders } =
      await postJsonToApi<SoulSubmitResponse>({
        url: this.config.url({
          modelId: this.modelId,
          path: `/higgsfield/text2image_soul`,
        }),
        headers: combineHeaders(this.config.headers(), headers),
        body: {
          quality: SUPPORTED_QUALITIES.includes(quality as any)
            ? quality
            : 'high',
          aspect_ratio: validatedAspectRatio,
          prompt,
          enhance_prompt: enhancePrompt,
          seed: seed || Math.floor(Math.random() * 1000000),
          style_id: styleId,
          negative_prompt: negativePrompt,
          ...ai302Options,
        },
        failedResponseHandler: statusCodeErrorResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(),
        abortSignal,
        fetch: this.config.fetch,
      });

    const taskResult = await this.pollTask(submitResponse.id, abortSignal);

    if (!taskResult.jobs || taskResult.jobs.length === 0) {
      throw new Error('No images generated');
    }

    // Extract image URLs - prefer 'raw' over 'min' for higher quality
    const imageUrls: string[] = [];
    taskResult.jobs.forEach(job => {
      if (job.results?.raw?.url) {
        imageUrls.push(job.results.raw.url);
      } else if (job.results?.min?.url) {
        imageUrls.push(job.results.min.url);
      }
    });

    if (imageUrls.length === 0) {
      throw new Error('No valid image URLs found in response');
    }

    // Limit to requested number of images
    const finalImageUrls =
      n && n < imageUrls.length ? imageUrls.slice(0, n) : imageUrls;

    const images = await this.downloadImages(finalImageUrls);

    return {
      images,
      warnings,
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }
}
