import type {
  ImageModelV2CallOptions,
  ImageModelV2CallWarning,
} from '@ai-sdk/provider';
import { combineHeaders, postJsonToApi } from '@ai-sdk/provider-utils';
import {
  type KlingRequest,
  type KlingSubmitResponse,
  type KlingTaskResponse,
  type KlingAspectRatio,
} from '../ai302-types';
import {
  createJsonResponseHandler,
  statusCodeErrorResponseHandler,
} from '../utils/api-handlers';
import { BaseModelHandler } from './base-model';

const SUPPORTED_ASPECT_RATIOS: readonly KlingAspectRatio[] = [
  '16:9',
  '9:16',
  '1:1',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
] as const;

const POLL_INTERVAL = 2000; // 2 seconds
const MAX_POLL_TIME = 300000; // 5 minutes

export class KlingHandler extends BaseModelHandler {
  private getModelName(): string {
    switch (this.modelId) {
      case 'kling-v1':
        return 'kling-v1';
      case 'kling-v1-5':
        return 'kling-v1-5';
      case 'kling-v2':
        return 'kling-v2';
      default:
        return 'kling-v2';
    }
  }

  private async pollTask(
    taskId: string,
    abortSignal?: AbortSignal,
  ): Promise<KlingTaskResponse> {
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
        `${this.config.url({ modelId: this.modelId, path: `/klingai/v1/images/generations/${taskId}` })}`,
        {
          method: 'GET',
          headers: this.config.headers() as HeadersInit,
          signal: abortSignal,
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as KlingTaskResponse;

      if (data.code !== 0) {
        throw new Error(`API error: ${data.message || 'Unknown error'}`);
      }

      const taskStatus = data.data.task_status;

      if (taskStatus === 'failed') {
        throw new Error(
          `Task failed: ${data.data.task_status_msg || 'Unknown error'}`,
        );
      }

      if (taskStatus === 'succeed') {
        return data;
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }
  }

  protected async processRequest({
    prompt,
    n,
    size,
    aspectRatio,
    providerOptions,
    headers,
    abortSignal,
  }: ImageModelV2CallOptions) {
    const warnings: ImageModelV2CallWarning[] = [];

    if (n != null && n > 9) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'n',
        details: 'Kling supports up to 9 images per generation',
      });
    }

    // Parse size and convert to aspect ratio if needed
    let parsedSize = this.parseSize(size);
    if (!parsedSize && aspectRatio) {
      parsedSize = this.aspectRatioToSize(aspectRatio, 1024, warnings);
    }

    // Validate dimensions are multiples of 32
    if (parsedSize) {
      parsedSize = this.validateDimensionsMultipleOf32(parsedSize, warnings);
    }

    // Determine aspect ratio from size or aspectRatio parameter
    let validatedAspectRatio: KlingAspectRatio | undefined = undefined;

    if (parsedSize) {
      // Convert size to aspect ratio
      const sizeAspectRatio = this.sizeToAspectRatio(
        `${parsedSize.width}x${parsedSize.height}`,
        SUPPORTED_ASPECT_RATIOS,
        warnings,
      );
      validatedAspectRatio = sizeAspectRatio as KlingAspectRatio;
    } else if (aspectRatio) {
      // Use provided aspect ratio
      if (SUPPORTED_ASPECT_RATIOS.includes(aspectRatio as KlingAspectRatio)) {
        validatedAspectRatio = aspectRatio as KlingAspectRatio;
      } else {
        const closestRatio = this.findClosestAspectRatio(
          aspectRatio as `${number}:${number}`,
          SUPPORTED_ASPECT_RATIOS,
          warnings,
        );
        validatedAspectRatio = closestRatio as KlingAspectRatio;
      }
    }

    const requestBody: KlingRequest = {
      model_name: this.getModelName() as any,
      prompt,
      ...(n && { n }),
      ...(validatedAspectRatio && { aspect_ratio: validatedAspectRatio }),
      ...(providerOptions?.ai302 || {}),
    };

    const { value: submitResponse, responseHeaders } =
      await postJsonToApi<KlingSubmitResponse>({
        url: this.config.url({
          modelId: this.modelId,
          path: `/klingai/v1/images/generations`,
        }),
        headers: combineHeaders(this.config.headers(), headers),
        body: requestBody,
        failedResponseHandler: statusCodeErrorResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(),
        abortSignal,
        fetch: this.config.fetch,
      });

    if (submitResponse.code !== 0) {
      throw new Error(
        `API error: ${submitResponse.message || 'Unknown error'}`,
      );
    }

    const taskResult = await this.pollTask(
      submitResponse.data.task_id,
      abortSignal,
    );

    if (
      !taskResult.data.task_result?.images ||
      taskResult.data.task_result.images.length === 0
    ) {
      throw new Error('No images returned from Kling API');
    }

    const imageUrls = taskResult.data.task_result.images.map(img => img.url);
    const images = await this.downloadImages(imageUrls);

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
