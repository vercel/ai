import { readFileSync } from 'node:fs';

export type HostToolSchema = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

export function readHostToolSchemasFromEnvironment(
  environment: NodeJS.ProcessEnv,
): HostToolSchema[] {
  const serializedSchemas = environment.TOOL_SCHEMAS_PATH
    ? readFileSync(environment.TOOL_SCHEMAS_PATH, 'utf8')
    : (environment.TOOL_SCHEMAS ?? '[]');

  return JSON.parse(serializedSchemas) as HostToolSchema[];
}
