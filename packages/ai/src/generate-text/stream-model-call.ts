import { LanguageModelV4Prompt } from '@ai-sdk/provider';
import { ProviderOptions } from '@ai-sdk/provider-utils';
import { resolveLanguageModel } from '../model/resolve-model';
import { CallSettings, Prompt } from '../prompt';
import { convertToLanguageModelPrompt } from '../prompt/convert-to-language-model-prompt';
import { prepareToolsAndToolChoice } from '../prompt/prepare-tools-and-tool-choice';
import { standardizePrompt } from '../prompt/standardize-prompt';
import { LanguageModel, ToolChoice } from '../types/language-model';
import { createAsyncIterableStream } from '../util/async-iterable-stream';
import { DownloadFunction } from '../util/download/download-function';
import { notify } from '../util/notify';
import { prepareRetries } from '../util/prepare-retries';
import { createStreamTextPartTransform } from './create-stream-text-part-transform';
import { Output } from './output';
import { ToolCallRepairFunction } from './tool-call-repair-function';
import { ToolSet } from './tool-set';

export async function streamModelCall<
  TOOLS extends ToolSet,
  OUTPUT extends Output = Output,
>({
  model,
  tools,
  output,
  toolChoice,
  activeTools,
  prompt,
  system,
  messages,
  download,
  maxRetries,
  abortSignal,
  headers,
  includeRawChunks,
  providerOptions,
  repairToolCall,
  onStart,
  ...callSettings
}: {
  model: LanguageModel;
  tools?: TOOLS;
  output?: OUTPUT;
  toolChoice?: ToolChoice<TOOLS>;
  activeTools?: Array<keyof NoInfer<TOOLS>>;
  download?: DownloadFunction;
  headers?: Record<string, string | undefined>;
  includeRawChunks?: boolean;
  providerOptions?: ProviderOptions;
  repairToolCall?: ToolCallRepairFunction<TOOLS> | undefined;

  // onStart is currently required because the telemetry callbacks need
  // LanguageModelV4Prompt and we only want download URLs at most once.
  // Therefore convertToLanguageModelPrompt can only be called once
  // per step and the resulting LanguageModelV4Prompt needs to be
  // passed to the onStart callback.
  //
  // TODO explore decoupling by changing the telemetry callbacks to accept
  // a Prompt or a standardized Prompt.
  onStart?: (args: {
    promptMessages: LanguageModelV4Prompt;
  }) => Promise<void> | void;
} & Prompt &
  CallSettings) {
  const resolvedModel = resolveLanguageModel(model);

  const { retry } = prepareRetries({ maxRetries, abortSignal });

  const standardizedPrompt = await standardizePrompt({
    system,
    prompt,
    messages,
  } as Prompt);

  const promptMessages = await convertToLanguageModelPrompt({
    prompt: {
      system: standardizedPrompt.system,
      messages: standardizedPrompt.messages,
    },
    supportedUrls: await resolvedModel.supportedUrls,
    download,
  });

  const { toolChoice: stepToolChoice, tools: stepTools } =
    await prepareToolsAndToolChoice({
      tools,
      toolChoice,
      activeTools,
    });

  await notify({
    event: { promptMessages },
    callbacks: onStart,
  });

  const {
    stream: languageModelStream,
    response,
    request,
  } = await retry(async () =>
    resolvedModel.doStream({
      ...callSettings,
      tools: stepTools,
      toolChoice: stepToolChoice,
      responseFormat: await output?.responseFormat,
      prompt: promptMessages,
      providerOptions,
      abortSignal,
      headers,
      includeRawChunks,
    }),
  );

  return {
    stream: createAsyncIterableStream(
      languageModelStream.pipeThrough(
        createStreamTextPartTransform({
          tools,
          system: standardizedPrompt.system,
          messages: standardizedPrompt.messages,
          repairToolCall,
        }),
      ),
    ),
    response,
    request,
  };
}
