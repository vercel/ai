import {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2Middleware,
  TelemetrySettings,
} from '@ai-sdk/provider';
import { asArray } from '../util/as-array';
import { getTracer } from '../telemetry/get-tracer';
import { recordSpan } from '../telemetry/record-span';
import { selectTelemetryAttributes } from '../telemetry/select-telemetry-attributes';
import { assembleOperationName } from '../telemetry/assemble-operation-name';
import { getBaseTelemetryAttributes } from '../telemetry/get-base-telemetry-attributes';
import { stringifyForTelemetry } from '../telemetry/stringify-for-telemetry';

/**
 * Wraps a LanguageModelV2 instance with middleware functionality.
 * This function allows you to apply middleware to transform parameters,
 * wrap generate operations, and wrap stream operations of a language model.
 *
 * @param options - Configuration options for wrapping the language model.
 * @param options.model - The original LanguageModelV2 instance to be wrapped.
 * @param options.middleware - The middleware to be applied to the language model. When multiple middlewares are provided, the first middleware will transform the input first, and the last middleware will be wrapped directly around the model.
 * @param options.modelId - Optional custom model ID to override the original model's ID.
 * @param options.providerId - Optional custom provider ID to override the original model's provider ID.
 * @returns A new LanguageModelV2 instance with middleware applied.
 */
export const wrapLanguageModel = ({
  model,
  middleware: middlewareArg,
  modelId,
  providerId,
}: {
  model: LanguageModelV2;
  middleware: LanguageModelV2Middleware | LanguageModelV2Middleware[];
  modelId?: string;
  providerId?: string;
}): LanguageModelV2 => {
  return asArray(middlewareArg)
    .reverse()
    .reduce((wrappedModel, middleware) => {
      return doWrap({ model: wrappedModel, middleware, modelId, providerId });
    }, model);
};

const doWrap = ({
  model,
  middleware: {
    transformParams,
    wrapGenerate,
    wrapStream,
    overrideProvider,
    overrideModelId,
    overrideSupportedUrls,
  },
  modelId,
  providerId,
}: {
  model: LanguageModelV2;
  middleware: LanguageModelV2Middleware;
  modelId?: string;
  providerId?: string;
}): LanguageModelV2 => {
  async function doTransform({
    params,
    type,
  }: {
    params: LanguageModelV2CallOptions;
    type: 'generate' | 'stream';
  }) {
    // an 'as' cast is needed here because the telemetry property is optional
    const telemetry = params.telemetry as TelemetrySettings | undefined;
    if (params.telemetry) {
      delete params.telemetry;
    }

    if (transformParams == null) {
      return params;
    }

    if (telemetry?.isEnabled !== true) {
      return await transformParams({ params, type, model });
    }

    const tracer = getTracer(telemetry);

    return recordSpan({
      name: 'ai.languageModelMiddleware.transformParams',
      tracer,
      attributes: selectTelemetryAttributes({
        telemetry,
        attributes: {
          ...assembleOperationName({
            operationId: 'ai.languageModelMiddleware.transformParams',
            telemetry,
          }),
          ...getBaseTelemetryAttributes({
            model,
            telemetry,
            headers: params.headers,
            settings: params,
          }),
          'ai.prompt.messages': {
            input: () => stringifyForTelemetry(params.prompt),
          },
        },
      }),
      fn: async span => {
        const transformedParams = await transformParams({
          params,
          type,
          model,
        });

        span.setAttributes(
          selectTelemetryAttributes({
            telemetry,
            attributes: {
              'ai.prompt.messages.transformed': {
                output: () => stringifyForTelemetry(transformedParams.prompt),
              },
            },
          }),
        );

        return transformedParams;
      },
    });
  }

  return {
    specificationVersion: 'v2',

    provider: providerId ?? overrideProvider?.({ model }) ?? model.provider,
    modelId: modelId ?? overrideModelId?.({ model }) ?? model.modelId,
    supportedUrls: overrideSupportedUrls?.({ model }) ?? model.supportedUrls,

    async doGenerate(
      params: LanguageModelV2CallOptions,
    ): Promise<Awaited<ReturnType<LanguageModelV2['doGenerate']>>> {
      const transformedParams = await doTransform({ params, type: 'generate' });
      const doGenerate = async () => model.doGenerate(transformedParams);
      const doStream = async () => model.doStream(transformedParams);
      return wrapGenerate
        ? wrapGenerate({
            doGenerate,
            doStream,
            params: transformedParams,
            model,
          })
        : doGenerate();
    },

    async doStream(
      params: LanguageModelV2CallOptions,
    ): Promise<Awaited<ReturnType<LanguageModelV2['doStream']>>> {
      const transformedParams = await doTransform({ params, type: 'stream' });
      const doGenerate = async () => model.doGenerate(transformedParams);
      const doStream = async () => model.doStream(transformedParams);
      return wrapStream
        ? wrapStream({ doGenerate, doStream, params: transformedParams, model })
        : doStream();
    },
  };
};
