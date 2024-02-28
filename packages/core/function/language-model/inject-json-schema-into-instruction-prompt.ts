import { InstructionPrompt } from '.';

const DEFAULT_SCHEMA_PREFIX = 'JSON schema:';
const DEFAULT_SCHEMA_SUFFIX =
  'You MUST answer with a JSON object that matches the JSON schema above.';

export function injectJsonSchemaIntoInstructionPrompt({
  prompt,
  schema,
  schemaPrefix = DEFAULT_SCHEMA_PREFIX,
  schemaSuffix = DEFAULT_SCHEMA_SUFFIX,
}: {
  prompt: InstructionPrompt;
  schema: Record<string, unknown>;
  schemaPrefix?: string;
  schemaSuffix?: string;
}): InstructionPrompt {
  const originalSystemPrompt =
    typeof prompt === 'string' ? undefined : prompt.system;
  const originalInstruction =
    typeof prompt === 'string' ? prompt : prompt.instruction;

  return {
    system: [
      originalSystemPrompt,
      originalSystemPrompt != null ? '' : null,
      schemaPrefix,
      JSON.stringify(schema),
      schemaSuffix,
    ]
      .filter(line => line != null)
      .join('\n'),

    instruction: originalInstruction,
  };
}
