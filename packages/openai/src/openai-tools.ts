import { z } from 'zod';

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

const ComputerUsePreviewParameters = z.discriminatedUnion('type', [
  // Model wants to click at coordinates
  z.object({
    type: z.literal('click'),
    button: z.enum(['left', 'right', 'wheel', 'back', 'forward']),
    x: z.number(),
    y: z.number(),
  }),
  // Model wants to double click at coordinates
  z.object({
    type: z.literal('double_click'),
    x: z.number(),
    y: z.number(),
  }),
  // Model wants to scroll (scroll_x, scroll_y) with mouse at x, y
  z.object({
    type: z.literal('scroll'),
    x: z.number(),
    y: z.number(),
    scroll_x: z.number(),
    scroll_y: z.number(),
  }),
  // Model wants to type in the currently focused input
  z.object({
    type: z.literal('type'),
    text: z.string(),
  }),
  // Model wants to wait 3s before continuing
  z.object({
    type: z.literal('wait'),
  }),
  // Model wants to press a key
  z.object({
    type: z.literal('keypress'),
    keys: z.array(z.string()),
  }),
  // model wants to drag along a defined path
  z.object({
    type: z.literal('drag'),
    path: z.array(
      z.object({
        x: z.number(),
        y: z.number(),
      }),
    ),
  }),
  // model wants a screenshot
  z.object({
    type: z.literal('screenshot'),
  }),
  // model wants to move the mouse to x, y
  z.object({
    type: z.literal('move'),
    x: z.number(),
    y: z.number(),
  }),
]);

function computerUsePreviewTool<RESULT>(options: {
  displayWidth: number;
  displayHeight: number;
  environment: 'mac' | 'windows' | 'linux' | 'browser';
  execute?: ExecuteFunction<{}, RESULT>;
  experimental_toToolResultContent?: (result: RESULT) => ToolResultContent;
}): {
  type: 'provider-defined';
  id: 'openai.computer_use_preview';
  args: {};
  parameters: typeof ComputerUsePreviewParameters;
  execute: ExecuteFunction<
    z.infer<typeof ComputerUsePreviewParameters>,
    RESULT
  >;
  experimental_toToolResultContent?: (result: RESULT) => ToolResultContent;
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
