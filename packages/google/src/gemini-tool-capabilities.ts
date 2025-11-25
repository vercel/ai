import { GoogleGenerativeAIModelId } from './google-generative-ai-options';

// Tool branding symbols used to tag model lists at the type level
const FILE_SEARCH: unique symbol = Symbol('FILE_SEARCH');
const URL_CONTEXT: unique symbol = Symbol('URL_CONTEXT');
const GOOGLE_SEARCH: unique symbol = Symbol('GOOGLE_SEARCH');
const CODE_EXECUTION: unique symbol = Symbol('CODE_EXECUTION');

/**
 * Attaches branding tags to readonly model lists.
 *
 * Ensures that only the predefined unsupported model groups can be passed to
 * utility functions such as `IsToolSupported`. This prevents from accidentally
 * supplying arbitrary arrays or incorrectly structured values.
 */
function defineUnSupportedModels<
  T extends readonly GoogleGenerativeAIModelId[],
  U,
>(models: T, tag: U): T & U {
  return Object.assign(models, tag);
}

// Lists of models that do NOT support specific tools.

export const GOOGLE_SEARCH_UNSUPPORTED_MODELS = defineUnSupportedModels(
  ['gemini-2.5-flash-image-preview', 'gemini-2.0-flash-lite'] as const,
  { [GOOGLE_SEARCH]: true },
);

export const URL_CONTEXT_UNSUPPORTED_MODELS = defineUnSupportedModels(
  [
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.0-flash-001',
    'gemini-2.0-flash-exp',
    'gemini-2.5-flash-image-preview',
  ] as const,
  {
    [URL_CONTEXT]: true,
  },
);

export const FILE_SEARCH_UNSUPPORTED_MODELS = defineUnSupportedModels(
  [
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.0-flash-001',
    'gemini-2.0-flash-exp',
    'gemini-2.0-flash-live-001',
    'gemini-2.5-flash-image-preview',
  ] as const,
  {
    [FILE_SEARCH]: true,
  },
);

export const CODE_EXECUTION_UNSUPPORTED_MODELS = defineUnSupportedModels(
  ['gemini-2.0-flash-lite'] as const,
  { [CODE_EXECUTION]: true },
);

type ToolUnsupportedModelGroup =
  | typeof URL_CONTEXT_UNSUPPORTED_MODELS
  | typeof GOOGLE_SEARCH_UNSUPPORTED_MODELS
  | typeof FILE_SEARCH_UNSUPPORTED_MODELS
  | typeof CODE_EXECUTION_UNSUPPORTED_MODELS;

/**
 * Returns `true` if the tool is supported, `false` if it is unsupported.
 */
export function IsToolSupported(
  tool: ToolUnsupportedModelGroup,
  toolName: GoogleGenerativeAIModelId,
): boolean {
  return !(tool as readonly string[]).includes(toolName);
}

/**
 * Produces a comma separated string of unsupported models
 */
export function getUnsupportedModelsString(
  tool: ToolUnsupportedModelGroup,
): string {
  return tool.join(', ');
}
