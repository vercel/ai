// https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output#supported-models
const JSON_SCHEMA_MODEL_PREFIXES = [
  'qwen3.7-plus',
  'qwen3.7-flash',
  'qwen3.7-max',
  'qwen3.8-max',
  'qwen3.8-flash',
];

export function supportsJsonSchemaOutput(modelId: string): boolean {
  return JSON_SCHEMA_MODEL_PREFIXES.some(
    prefix => modelId === prefix || modelId.startsWith(`${prefix}-`),
  );
}
