import type {
  ImageModelV2CallOptions,
  ImageModelV2CallWarning,
} from '@ai-sdk/provider';
import { combineHeaders, postJsonToApi } from '@ai-sdk/provider-utils';
import {
  type MidjourneySubmitResponse,
  type MidjourneyTaskResponse,
} from '../ai302-types';
import {
  createJsonResponseHandler,
  statusCodeErrorResponseHandler,
} from '../utils/api-handlers';
import { BaseModelHandler } from './base-model';

const SUPPORTED_ASPECT_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '2:3',
  '3:2',
  '4:5',
  '5:4',
] as const;
const POLL_INTERVAL = 2000; // 2 seconds
const MAX_POLL_TIME = 300000; // 5 minutes

// Ref 1: https://302ai.apifox.cn/api-160578879
export class MidjourneyHandler extends BaseModelHandler {
  private getVersionFlag(): string {
    switch (this.modelId) {
      case 'midjourney/6.0':
        return '--v 6.0';
      case 'midjourney/6.1':
        return '--v 6.1';
      case 'midjourney/7.0':
        return '--v 7.0';
      case 'nijijourney/6.0':
        return '--niji 6';
      default:
        return '--v 6.0';
    }
  }

  private getBotType(): string {
    return this.modelId.startsWith('nijijourney')
      ? 'NIJI_JOURNEY'
      : 'MID_JOURNEY';
  }

  private async pollTask(
    taskId: string,
    abortSignal?: AbortSignal,
  ): Promise<MidjourneyTaskResponse> {
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
        `${this.config.url({ modelId: this.modelId, path: `/mj/task/${taskId}/fetch` })}`,
        {
          method: 'GET',
          headers: this.config.headers() as HeadersInit,
          signal: abortSignal,
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as MidjourneyTaskResponse;

      if (data.status === 'FAILED') {
        throw new Error(`Task failed: ${data.failReason || 'Unknown error'}`);
      }

      if (data.status === 'SUCCESS') {
        return data;
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }
  }

  private async upscaleImage(
    taskId: string,
    response: MidjourneyTaskResponse,
    abortSignal?: AbortSignal,
    buttonIndex: number = 1,
  ): Promise<MidjourneyTaskResponse> {
    const upscaleButton = response.buttons.find(
      b => b.label === `U${buttonIndex}`,
    );
    if (!upscaleButton) {
      throw new Error(`No upscale option available for U${buttonIndex}`);
    }

    const { value: actionResponse } =
      await postJsonToApi<MidjourneySubmitResponse>({
        url: this.config.url({
          modelId: this.modelId,
          path: `/mj/submit/action`,
        }),
        headers: this.config.headers(),
        body: {
          customId: upscaleButton.customId,
          taskId: taskId,
        },
        failedResponseHandler: statusCodeErrorResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(),
        abortSignal,
        fetch: this.config.fetch,
      });

    return await this.pollTask(actionResponse.result, abortSignal);
  }

  private async splitImageIntoFour(imageUrl: string): Promise<string[]> {
    const image = await this.downloadImages([imageUrl]);
    if (!image || image.length === 0) {
      throw new Error('Failed to download original image');
    }

    // The base64 string from downloadImages doesn't include the data URL prefix
    const buffer = Buffer.from(image[0], 'base64');

    // Use sharp to process the image
    const sharp = require('sharp');
    const metadata = await sharp(buffer).metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error('Failed to get image dimensions');
    }

    // Calculate dimensions for each part
    const partWidth = Math.floor(metadata.width / 2);
    const partHeight = Math.floor(metadata.height / 2);

    // Extract four parts
    const parts: string[] = [];
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const partBuffer = await sharp(buffer)
          .extract({
            left: col * partWidth,
            top: row * partHeight,
            width: partWidth,
            height: partHeight,
          })
          .toBuffer();

        // Convert to base64 without data URL prefix (to match downloadImages format)
        parts.push(partBuffer.toString('base64'));
      }
    }

    return parts;
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
        details: 'Midjourney supports up to 4 images per generation',
      });
    }

    if (size != null) {
      warnings.push({ type: 'unsupported-setting', setting: 'size' });
    }

    if (aspectRatio) {
      if (!SUPPORTED_ASPECT_RATIOS.includes(aspectRatio as any)) {
        warnings.push({
          type: 'unsupported-setting',
          setting: 'aspectRatio',
          details: `Unsupported aspect ratio: ${aspectRatio}. Supported values are: ${SUPPORTED_ASPECT_RATIOS.join(', ')}`,
        });
      } else {
        prompt = `${prompt} --ar ${aspectRatio}`;
      }
    }

    if (seed != null) {
      prompt = `${prompt} --seed ${seed}`;
    }

    prompt = `${prompt} ${this.getVersionFlag()}`;

    const { value: submitResponse, responseHeaders } =
      await postJsonToApi<MidjourneySubmitResponse>({
        url: this.config.url({
          modelId: this.modelId,
          path: `/mj/submit/imagine`,
        }),
        headers: combineHeaders(this.config.headers(), headers),
        body: {
          prompt,
          botType: this.getBotType(),
          ...(providerOptions.ai302 || {}),
        },
        failedResponseHandler: statusCodeErrorResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(),
        abortSignal,
        fetch: this.config.fetch,
      });

    const initialResult = await this.pollTask(
      submitResponse.result,
      abortSignal,
    );

    // Check if upscaleIndexes is provided in providerOptions
    const upscaleIndexes = providerOptions?.ai302?.upscaleIndexes as
      | number[]
      | undefined;

    if (!upscaleIndexes || upscaleIndexes.length === 0) {
      // If no upscale is requested, return the original image split into four parts
      if (!initialResult.imageUrl) {
        throw new Error('No image URL in the initial response');
      }
      return {
        images: await this.splitImageIntoFour(initialResult.imageUrl),
        warnings,
        response: {
          timestamp: new Date(),
          modelId: this.modelId,
          headers: responseHeaders,
        },
      };
    }

    // Validate and filter upscale indexes
    const validUpscaleIndexes = upscaleIndexes.filter(i => i >= 1 && i <= 4);
    if (validUpscaleIndexes.length !== upscaleIndexes.length) {
      warnings.push({
        type: 'other',
        message: 'Some upscale indexes were invalid. Valid indexes are 1-4.',
      });
    }

    // Perform upscale for selected images
    const upscalePromises = validUpscaleIndexes.map(index => {
      return this.upscaleImage(
        submitResponse.result,
        initialResult,
        abortSignal,
        index,
      );
    });

    const finalResults = await Promise.all(upscalePromises);
    const imageUrls = finalResults.map(result => {
      if (!result.imageUrl) {
        throw new Error('No image URL in the response');
      }
      return result.imageUrl;
    });

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
