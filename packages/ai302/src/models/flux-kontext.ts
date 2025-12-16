import type {
  ImageModelV2CallOptions,
  ImageModelV2CallWarning,
} from '@ai-sdk/provider';
import { combineHeaders, postJsonToApi } from '@ai-sdk/provider-utils';
import {
  type FluxKontextSubmitResponse,
  type FluxKontextResultResponse,
} from '../ai302-types';
import {
  createJsonResponseHandler,
  statusCodeErrorResponseHandler,
} from '../utils/api-handlers';
import { BaseModelHandler } from './base-model';

const POLL_INTERVAL = 2000; // 2 seconds
const MAX_POLL_TIME = 300000; // 5 minutes

export class FluxKontextHandler extends BaseModelHandler {
  private getModelName(): string {
    switch (this.modelId) {
      case 'flux-kontext-max':
        return 'flux-kontext-max';
      case 'flux-kontext-pro':
        return 'flux-kontext-pro';
      default:
        return 'flux-kontext-pro';
    }
  }

  private async pollTask(
    taskId: string,
    abortSignal?: AbortSignal,
  ): Promise<FluxKontextResultResponse> {
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
        `${this.config.url({ modelId: this.modelId, path: `/flux/v1/get_result?id=${taskId}` })}`,
        {
          method: 'GET',
          headers: this.config.headers() as HeadersInit,
          signal: abortSignal,
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as FluxKontextResultResponse;

      if (data.status === 'Ready' && data.result) {
        return data;
      }

      if (data.status === 'Failed' || data.status === 'Error') {
        throw new Error(`Task failed with status: ${data.status}`);
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

    if (n != null && n > 1) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'n',
        details: 'Flux Kontext generates one image per request',
      });
    }

    // Handle size to aspect ratio conversion
    let finalAspectRatio: string | undefined;

    if (size) {
      // Convert size to aspect ratio
      const supportedRatios = [
        '21:9',
        '16:9',
        '3:2',
        '4:3',
        '1:1',
        '3:4',
        '2:3',
        '9:16',
        '9:21',
      ];
      const sizeToAspectRatio = this.sizeToAspectRatio(
        size,
        supportedRatios,
        warnings,
      );
      if (sizeToAspectRatio) {
        finalAspectRatio = sizeToAspectRatio;
      }
    } else if (aspectRatio) {
      // Validate aspect ratio is within supported range
      const supportedRatios = [
        '21:9',
        '16:9',
        '3:2',
        '4:3',
        '1:1',
        '3:4',
        '2:3',
        '9:16',
        '9:21',
      ];
      if (supportedRatios.includes(aspectRatio)) {
        finalAspectRatio = aspectRatio;
      } else {
        warnings.push({
          type: 'unsupported-setting',
          setting: 'aspectRatio',
          details: `Aspect ratio ${aspectRatio} not supported. Supported ratios: ${supportedRatios.join(', ')}`,
        });
      }
    }

    if (size != null && aspectRatio != null) {
      warnings.push({
        type: 'other',
        message:
          'Both size and aspectRatio provided. Size will be converted to aspect ratio and aspectRatio parameter will be ignored.',
      });
    }

    // Get additional parameters from providerOptions
    const ai302Options = providerOptions?.ai302 || {};
    const inputImage = ai302Options.input_image as string | undefined;
    const promptUpsampling = ai302Options.prompt_upsampling as
      | boolean
      | undefined;
    const safetyTolerance = ai302Options.safety_tolerance as number | undefined;
    const outputFormat = ai302Options.output_format as
      | 'jpeg'
      | 'png'
      | undefined;
    const webhookUrl = ai302Options.webhook_url as string | undefined;
    const webhookSecret = ai302Options.webhook_secret as string | undefined;

    const { value: submitResponse, responseHeaders } =
      await postJsonToApi<FluxKontextSubmitResponse>({
        url: this.config.url({
          modelId: this.modelId,
          path: `/flux/v1/${this.getModelName()}`,
        }),
        headers: combineHeaders(this.config.headers(), headers),
        body: {
          prompt,
          ...(inputImage !== undefined && { input_image: inputImage }),
          ...(seed !== undefined && { seed }),
          ...(finalAspectRatio !== undefined && {
            aspect_ratio: finalAspectRatio,
          }),
          ...(outputFormat !== undefined && { output_format: outputFormat }),
          ...(webhookUrl !== undefined && { webhook_url: webhookUrl }),
          ...(webhookSecret !== undefined && { webhook_secret: webhookSecret }),
          ...(promptUpsampling !== undefined && {
            prompt_upsampling: promptUpsampling,
          }),
          ...(safetyTolerance !== undefined && {
            safety_tolerance: safetyTolerance,
          }),
          ...ai302Options,
        },
        failedResponseHandler: statusCodeErrorResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(),
        abortSignal,
        fetch: this.config.fetch,
      });

    const taskResult = await this.pollTask(submitResponse.id, abortSignal);

    if (!taskResult.result?.sample) {
      throw new Error('No image generated');
    }

    const images = await this.downloadImages([taskResult.result.sample]);

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
