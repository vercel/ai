import { z } from 'zod';
import { computerActionSchema, computerSafetyCheckSchema } from './internal';

// Copied from ai package
type ExecuteFunction<PARAMETERS, RESULT> =
  | undefined
  | ((
      args: PARAMETERS,
      options: { abortSignal?: AbortSignal },
    ) => Promise<RESULT>);

// Copied from ai package
export type ToolResultContent = Array<
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image';
      data: string; // base64 encoded png image, e.g. screenshot
      mimeType?: string; // e.g. 'image/png';
    }
>;

const WebSearchPreviewParameters = z.object({});

function webSearchPreviewTool({
  searchContextSize,
  userLocation,
}: {
  searchContextSize?: 'low' | 'medium' | 'high';
  userLocation?: {
    type?: 'approximate';
    city?: string;
    region?: string;
    country?: string;
    timezone?: string;
  };
} = {}): {
  type: 'provider-defined';
  id: 'openai.web_search_preview';
  args: {};
  parameters: typeof WebSearchPreviewParameters;
} {
  return {
    type: 'provider-defined',
    id: 'openai.web_search_preview',
    args: {
      searchContextSize,
      userLocation,
    },
    parameters: WebSearchPreviewParameters,
  };
}

const ComputerUsePreviewParameters = z.object({
  action: computerActionSchema,
  pendingSafetyChecks: z.array(computerSafetyCheckSchema),
});

type ComputerUsePreviewResult = {
  screenshot: Uint8Array;
  acknowledgedSafetyChecks: Array<z.infer<typeof computerSafetyCheckSchema>>;
};

function computerUsePreviewTool(options: {
  displayWidth: number;
  displayHeight: number;
  environment: 'mac' | 'windows' | 'linux' | 'browser';
  execute?: ExecuteFunction<
    z.infer<typeof ComputerUsePreviewParameters>,
    ComputerUsePreviewResult
  >;
  experimental_toToolResultContent?: (
    result: ComputerUsePreviewResult,
  ) => ToolResultContent;
}): {
  type: 'provider-defined';
  id: 'openai.computer_use_preview';
  args: {};
  parameters: typeof ComputerUsePreviewParameters;
  execute: ExecuteFunction<
    z.infer<typeof ComputerUsePreviewParameters>,
    ComputerUsePreviewResult
  >;
  experimental_toToolResultContent?: (
    result: ComputerUsePreviewResult,
  ) => ToolResultContent;
} {
  return {
    type: 'provider-defined',
    id: 'openai.computer_use_preview',
    args: {
      displayWidth: options.displayWidth,
      displayHeight: options.displayHeight,
      environment: options.environment,
    },
    parameters: ComputerUsePreviewParameters,
    execute: options.execute,
    experimental_toToolResultContent: options.experimental_toToolResultContent,
  };
}

export const openaiTools = {
  webSearchPreview: webSearchPreviewTool,
  computerUsePreview: computerUsePreviewTool,
};
