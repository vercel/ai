export function supportsStrictTools(modelId: string): boolean {
  return !rejectsNewerSchemaFields(modelId);
}

export function supportsNativeStructuredOutput(modelId: string): boolean {
  return !rejectsNewerSchemaFields(modelId);
}

// Bedrock validates against its own copy of the Messages schema, which rejects
// `output_config.format` and tool `strict` for the newest Claude models
const MODELS_REJECTING_NEWER_SCHEMA_FIELDS = [
  'claude-opus-4-7',
  'claude-opus-4-8',
  'claude-opus-5',
  'claude-fable-5',
  'claude-sonnet-5',
];

function rejectsNewerSchemaFields(modelId: string): boolean {
  return MODELS_REJECTING_NEWER_SCHEMA_FIELDS.some(model =>
    modelId.includes(model),
  );
}

export function supportsRequiredToolChoice(modelId: string): boolean {
  return MODELS_REJECTING_REQUIRED_TOOL_CHOICE.every(
    model => !model.test(modelId),
  );
}

// Meta models support tool calling but reject Bedrock's `toolChoice.any`, so
// the synthetic JSON response tool cannot be forced.
const MODELS_REJECTING_REQUIRED_TOOL_CHOICE = [/meta\./];
