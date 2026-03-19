import {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4FunctionTool,
  LanguageModelV4ProviderTool,
  LanguageModelV4ToolChoice,
  SharedV4Headers,
  SharedV4ProviderOptions,
} from '@ai-sdk/provider';
import {
  DelayedPromise,
  ModelMessage,
  SystemModelMessage,
} from '@ai-sdk/provider-utils';
import { LanguageModelRequestMetadata } from '../types';
import { createStitchableStream } from '../util/create-stitchable-stream';
import { prepareRetries } from '../util/prepare-retries';
import {
  createStreamTextPartTransform,
  UglyTransformedStreamTextPart,
} from './create-stream-text-part-transform';
import { ToolCallRepairFunction } from './tool-call-repair-function';
import { ToolSet } from './tool-set';

export type ModelCallOptions<TOOLS extends ToolSet> = {
  model: LanguageModelV4;
  callSettings: Omit<
    LanguageModelV4CallOptions,
    | 'prompt'
    | 'tools'
    | 'toolChoice'
    | 'responseFormat'
    | 'providerOptions'
    | 'abortSignal'
    | 'headers'
    | 'includeRawChunks'
  >;
  maxRetries?: number;

  // doStream options
  tools?: Array<LanguageModelV4FunctionTool | LanguageModelV4ProviderTool>;
  toolChoice?: LanguageModelV4ToolChoice;
  responseFormat?: LanguageModelV4CallOptions['responseFormat'];
  prompt: LanguageModelV4CallOptions['prompt'];
  providerOptions?: SharedV4ProviderOptions;
  abortSignal?: AbortSignal;
  headers?: Record<string, string | undefined>;
  includeRawChunks?: boolean;

  // For createStreamTextPartTransform
  userTools?: TOOLS;
  system?: string | SystemModelMessage | Array<SystemModelMessage>;
  messages: ModelMessage[];
  repairToolCall?: ToolCallRepairFunction<TOOLS>;
};

export type ModelCallResult<TOOLS extends ToolSet> = {
  stream: ReadableStream<UglyTransformedStreamTextPart<TOOLS>>;
  request: Promise<LanguageModelRequestMetadata>;
  response: Promise<{ headers?: SharedV4Headers } | undefined>;
};

export function modelCall<TOOLS extends ToolSet>(
  options: ModelCallOptions<TOOLS>,
): ModelCallResult<TOOLS> {
  const requestPromise = new DelayedPromise<LanguageModelRequestMetadata>();
  const responsePromise = new DelayedPromise<
    { headers?: SharedV4Headers } | undefined
  >();

  const { retry } = prepareRetries({
    maxRetries: options.maxRetries,
    abortSignal: options.abortSignal,
  });

  const { stream, addStream, close } =
    createStitchableStream<UglyTransformedStreamTextPart<TOOLS>>();

  (async () => {
    try {
      const {
        stream: rawStream,
        response,
        request,
      } = await retry(() =>
        options.model.doStream({
          ...options.callSettings,
          tools: options.tools,
          toolChoice: options.toolChoice,
          responseFormat: options.responseFormat,
          prompt: options.prompt,
          providerOptions: options.providerOptions,
          abortSignal: options.abortSignal,
          headers: options.headers,
          includeRawChunks: options.includeRawChunks,
        }),
      );

      requestPromise.resolve(request ?? {});
      responsePromise.resolve(response);

      const transformedStream = rawStream.pipeThrough(
        createStreamTextPartTransform({
          tools: options.userTools,
          system: options.system,
          messages: options.messages,
          repairToolCall: options.repairToolCall,
        }),
      );

      addStream(transformedStream);
      close();
    } catch (error) {
      requestPromise.reject(error);
      responsePromise.reject(error);
      addStream(
        new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'error', error });
            controller.close();
          },
        }),
      );
      close();
    }
  })();

  return {
    stream,
    request: requestPromise.promise,
    response: responsePromise.promise,
  };
}
