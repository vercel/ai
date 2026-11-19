import { getAlibabaLanguageModelEntry } from './alibaba-model-catalog';
export function supportsJsonSchemaOutput(modelId: string): boolean {
  return getAlibabaLanguageModelEntry(modelId).capabilities.language
    .structuredOutput.jsonSchema;
}
