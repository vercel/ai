export function supportsStrictTools(modelId: string): boolean {
  return !matchesModel(modelId, MODELS_WITHOUT_STRICT_TOOL_SUPPORT);
}

export function supportsNativeStructuredOutput(modelId: string): boolean {
  return !matchesModel(
    modelId,
    MODELS_WITHOUT_RELIABLE_NATIVE_STRUCTURED_OUTPUT,
  );
}

// Bedrock validates against its own copy of the Messages schema, which rejects
// `output_config.format` and tool `strict` for the newest Claude models
const MODELS_WITHOUT_STRICT_TOOL_SUPPORT = [
  'claude-opus-4-7',
  'claude-opus-4-8',
  'claude-opus-5',
  'claude-fable-5',
  'claude-sonnet-5',
];

// Native structured output is unreliable for additional models even though
// their strict tool support remains available. Sonnet 4.6 can fail to adhere
// to complex schemas, while Haiku 4.5 support varies between Bedrock accounts.
const MODELS_WITHOUT_RELIABLE_NATIVE_STRUCTURED_OUTPUT = [
  ...MODELS_WITHOUT_STRICT_TOOL_SUPPORT,
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
];

function matchesModel(modelId: string, models: string[]): boolean {
  return models.some(model => modelId.includes(model));
}
