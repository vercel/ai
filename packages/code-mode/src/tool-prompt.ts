import { asSchema } from 'ai';
import type { CodeModeToolSet } from './types.js';

type JsonSchema = Record<string, unknown>;

interface SchemaContext {
  root: JsonSchema;
  seenRefs: Set<string>;
  depth: number;
}

const MAX_SCHEMA_DEPTH = 8;
const MAX_COMPACT_OBJECT_TYPE_LENGTH = 120;

export function buildCodeModeToolDescription(tools: CodeModeToolSet): string {
  const toolEntries = Object.entries(tools);
  const typeBlock =
    toolEntries.length === 0
      ? 'No host tools. Do not call `tools.*`.'
      : [
          '```ts',
          'declare const tools: {',
          ...toolEntries.flatMap(renderToolType),
          '};',
          '```',
        ].join('\n');

  const exampleBlock =
    toolEntries.length === 0
      ? ''
      : [
          '',
          'Tool call examples:',
          '```ts',
          ...renderToolExamples(toolEntries),
          '```',
        ].join('\n');

  const sections = [
    'Execute code-mode TypeScript in an isolated sandbox.',
    '',
    'Put the full program in `js`; top-level `await`/`return` work. Return a JSON-serializable result.',
    'Call host tools only as async `tools.name(input)`; await each or use `Promise.all` for independent calls.',
    'Use exact names/types below. `JSON.parse`/`JSON.stringify` are available.',
    'Fetch: `fetch` is not available.',
  ];

  sections.push('', 'Tools:', typeBlock);

  if (exampleBlock.length > 0) {
    sections.push(exampleBlock);
  }

  return sections.join('\n');
}

function renderToolType([toolName, tool]: [
  string,
  CodeModeToolSet[string],
]): string[] {
  const schema = resolveInputSchema(tool);
  const inputType =
    schema === undefined ? 'unknown' : schemaToType(schema, schema);
  const outputSchema = resolveOutputSchema(tool);
  const outputType =
    outputSchema === undefined
      ? 'unknown'
      : schemaToType(outputSchema, outputSchema);
  const description = firstString(tool.description, tool.title);
  const lines: string[] = [];

  if (description !== undefined) {
    lines.push(`  /** ${toComment(description)} */`);
  }

  lines.push(
    `  ${formatObjectKey(toolName)}: (input: ${indentType(inputType, 2)}) => Promise<${indentType(outputType, 2)}>;`,
  );
  return lines;
}

function renderToolExamples(
  toolEntries: Array<[string, CodeModeToolSet[string]]>,
): string[] {
  if (toolEntries.length === 1) {
    const toolEntry = toolEntries[0]!;
    const projection = renderToolProjection('result', toolEntry[1]);
    return [
      `const result = await ${renderToolExampleCall(toolEntry)};`,
      `return ${projection};`,
    ];
  }

  const variableNames = uniqueToolVariableNames(
    toolEntries.map(([toolName]) => toolName),
  );
  const calls = toolEntries.map(
    toolEntry => `  ${renderToolExampleCall(toolEntry)},`,
  );
  return [
    `const [${variableNames.join(', ')}] = await Promise.all([`,
    ...calls,
    ']);',
    'return {',
    ...toolEntries.map(([toolName, tool], index) => {
      const projection = renderToolProjection(variableNames[index]!, tool);
      return `  ${formatObjectKey(toolName)}: ${projection},`;
    }),
    '};',
  ];
}

function renderToolExampleCall([toolName, tool]: [
  string,
  CodeModeToolSet[string],
]): string {
  const schema = resolveInputSchema(tool);
  const input =
    firstInputExample(tool) ??
    (schema === undefined ? {} : sampleFromSchema(schema, schema));
  return `tools${formatPropertyAccess(toolName)}(${JSON.stringify(input)})`;
}

function renderToolProjection(
  variableName: string,
  tool: CodeModeToolSet[string],
): string {
  const field = firstObjectProperty(resolveOutputSchema(tool));
  if (field === undefined) {
    return variableName;
  }
  return `{ ${formatObjectKey(field)}: ${variableName}${formatPropertyAccess(field)} }`;
}

function firstObjectProperty(
  schema: JsonSchema | undefined,
): string | undefined {
  if (schema === undefined || !isRecord(schema.properties)) {
    return undefined;
  }
  return Object.entries(schema.properties).find(entry =>
    isRecord(entry[1]),
  )?.[0];
}

function resolveInputSchema(
  tool: CodeModeToolSet[string],
): JsonSchema | undefined {
  try {
    const jsonSchema = asSchema(tool.inputSchema).jsonSchema;
    if (isPromiseLike(jsonSchema) || !isRecord(jsonSchema)) {
      return undefined;
    }
    return jsonSchema;
  } catch {
    return undefined;
  }
}

function resolveOutputSchema(
  tool: CodeModeToolSet[string],
): JsonSchema | undefined {
  try {
    const outputSchema = tool.outputSchema;
    if (outputSchema === undefined) {
      return undefined;
    }
    const jsonSchema = asSchema(outputSchema).jsonSchema;
    if (isPromiseLike(jsonSchema) || !isRecord(jsonSchema)) {
      return undefined;
    }
    return jsonSchema;
  } catch {
    return undefined;
  }
}

function schemaToType(schema: JsonSchema, root: JsonSchema): string {
  return schemaToTypeInner(schema, {
    root,
    seenRefs: new Set(),
    depth: 0,
  });
}

function schemaToTypeInner(schema: JsonSchema, context: SchemaContext): string {
  if (context.depth > MAX_SCHEMA_DEPTH) {
    return 'unknown';
  }

  const ref = firstString(schema.$ref);
  if (ref !== undefined) {
    const resolved = resolveRef(ref, context.root, context.seenRefs);
    return resolved === undefined
      ? 'unknown'
      : schemaToTypeInner(resolved, nextContext(context));
  }

  const constValue = schema.const;
  if (constValue !== undefined) {
    return literalType(constValue);
  }

  const enumValues = asArray(schema.enum);
  if (enumValues !== undefined) {
    return union(enumValues.map(literalType));
  }

  const oneOf = schemaArray(schema.oneOf);
  if (oneOf !== undefined) {
    return union(
      oneOf.map(part => schemaToTypeInner(part, nextContext(context))),
    );
  }

  const anyOf = schemaArray(schema.anyOf);
  if (anyOf !== undefined) {
    return union(
      anyOf.map(part => schemaToTypeInner(part, nextContext(context))),
    );
  }

  const allOf = schemaArray(schema.allOf);
  if (allOf !== undefined) {
    return allOf
      .map(part => schemaToTypeInner(part, nextContext(context)))
      .join(' & ');
  }

  const type = schema.type;
  if (Array.isArray(type)) {
    return union(
      type.map(part => schemaToTypeInner({ ...schema, type: part }, context)),
    );
  }

  if (type === 'object' || isRecord(schema.properties)) {
    return objectType(schema, context);
  }

  if (type === 'array' || schema.items !== undefined) {
    return arrayType(schema, context);
  }

  if (type === 'string') {
    return 'string';
  }

  if (type === 'number' || type === 'integer') {
    return 'number';
  }

  if (type === 'boolean') {
    return 'boolean';
  }

  if (type === 'null') {
    return 'null';
  }

  return 'unknown';
}

function objectType(schema: JsonSchema, context: SchemaContext): string {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = new Set(asArray(schema.required)?.filter(isString) ?? []);
  const entries = Object.entries(properties).filter(
    (entry): entry is [string, JsonSchema] => isRecord(entry[1]),
  );

  if (entries.length === 0) {
    const additionalProperties = schema.additionalProperties;
    if (isRecord(additionalProperties)) {
      return `Record<string, ${schemaToTypeInner(additionalProperties, nextContext(context))}>`;
    }
    if (additionalProperties === true) {
      return 'Record<string, unknown>';
    }
    return '{}';
  }

  const lines = entries.flatMap(([name, value]) => {
    const propertyLines: string[] = [];
    const description = firstString(value.description);
    if (description !== undefined) {
      propertyLines.push(`  /** ${toComment(description)} */`);
    }
    propertyLines.push(
      `  ${formatObjectKey(name)}${required.has(name) ? '' : '?'}: ${indentType(
        schemaToTypeInner(value, nextContext(context)),
        2,
      )};`,
    );
    return propertyLines;
  });

  const additionalProperties = schema.additionalProperties;
  if (isRecord(additionalProperties)) {
    lines.push(
      `  [key: string]: ${schemaToTypeInner(additionalProperties, nextContext(context))};`,
    );
  } else if (additionalProperties === true) {
    lines.push('  [key: string]: unknown;');
  }

  const compact = compactObjectType(lines);
  if (compact !== undefined) {
    return compact;
  }

  return `{\n${lines.join('\n')}\n}`;
}

function arrayType(schema: JsonSchema, context: SchemaContext): string {
  const items = schema.items;
  if (Array.isArray(items)) {
    return `[${items
      .map(item =>
        isRecord(item)
          ? schemaToTypeInner(item, nextContext(context))
          : 'unknown',
      )
      .join(', ')}]`;
  }
  if (isRecord(items)) {
    const itemType = schemaToTypeInner(items, nextContext(context));
    return needsParentheses(itemType) || itemType.includes('\n')
      ? `Array<${itemType}>`
      : `${itemType}[]`;
  }
  return 'unknown[]';
}

function sampleFromSchema(schema: JsonSchema, root: JsonSchema): unknown {
  return sampleFromSchemaInner(schema, {
    root,
    seenRefs: new Set(),
    depth: 0,
  });
}

function sampleFromSchemaInner(
  schema: JsonSchema,
  context: SchemaContext,
): unknown {
  if (context.depth > MAX_SCHEMA_DEPTH) {
    return null;
  }

  if (schema.default !== undefined) {
    return schema.default;
  }

  const ref = firstString(schema.$ref);
  if (ref !== undefined) {
    const resolved = resolveRef(ref, context.root, context.seenRefs);
    return resolved === undefined
      ? null
      : sampleFromSchemaInner(resolved, nextContext(context));
  }

  if (schema.const !== undefined) {
    return schema.const;
  }

  const enumValues = asArray(schema.enum);
  if (enumValues !== undefined) {
    return enumValues[0] ?? null;
  }

  const oneOf = schemaArray(schema.oneOf);
  if (oneOf !== undefined) {
    return sampleFromSchemaInner(oneOf[0] ?? {}, nextContext(context));
  }

  const anyOf = schemaArray(schema.anyOf);
  if (anyOf !== undefined) {
    return sampleFromSchemaInner(anyOf[0] ?? {}, nextContext(context));
  }

  const type = schema.type;
  if (Array.isArray(type)) {
    return sampleFromSchemaInner(
      { ...schema, type: type.find(part => part !== 'null') ?? type[0] },
      context,
    );
  }

  if (type === 'object' || isRecord(schema.properties)) {
    const properties = isRecord(schema.properties) ? schema.properties : {};
    return Object.fromEntries(
      Object.entries(properties)
        .filter((entry): entry is [string, JsonSchema] => isRecord(entry[1]))
        .map(([name, value]) => [
          name,
          sampleFromSchemaInner(value, nextContext(context)),
        ]),
    );
  }

  if (type === 'array' || schema.items !== undefined) {
    const items = Array.isArray(schema.items) ? schema.items[0] : schema.items;
    return [
      isRecord(items)
        ? sampleFromSchemaInner(items, nextContext(context))
        : null,
    ];
  }

  if (type === 'number' || type === 'integer') {
    return 1;
  }

  if (type === 'boolean') {
    return true;
  }

  if (type === 'null') {
    return null;
  }

  if (type === 'string' || type === undefined) {
    const examples = asArray(schema.examples);
    if (examples?.[0] !== undefined) {
      return examples[0];
    }
    const format = firstString(schema.format);
    if (format === 'uri' || format === 'url') {
      return 'https://example.com';
    }
    if (format === 'date-time') {
      return '2026-01-01T00:00:00.000Z';
    }
    if (format === 'date') {
      return '2026-01-01';
    }
    return 'string';
  }

  return null;
}

function firstInputExample(tool: CodeModeToolSet[string]): unknown {
  const examples = asArray(tool.inputExamples);
  const first = examples?.[0];
  return isRecord(first) && 'input' in first ? first.input : undefined;
}

function resolveRef(
  ref: string,
  root: JsonSchema,
  seenRefs: Set<string>,
): JsonSchema | undefined {
  if (!ref.startsWith('#/') || seenRefs.has(ref)) {
    return undefined;
  }

  seenRefs.add(ref);
  const value = ref
    .slice(2)
    .split('/')
    .map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce<unknown>((current, part) => {
      if (!isRecord(current)) {
        return undefined;
      }
      return current[part];
    }, root);

  return isRecord(value) ? value : undefined;
}

function nextContext(context: SchemaContext): SchemaContext {
  return {
    ...context,
    depth: context.depth + 1,
  };
}

function union(types: string[]): string {
  const unique = [...new Set(types)];
  return unique.length === 0 ? 'unknown' : unique.join(' | ');
}

function literalType(value: unknown): string {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return String(value);
  }
  return 'unknown';
}

function indentType(type: string, spaces: number): string {
  if (!type.includes('\n')) {
    return type;
  }

  const padding = ' '.repeat(spaces);
  return type.replaceAll('\n', `\n${padding}`);
}

function needsParentheses(type: string): boolean {
  return type.includes(' | ') || type.includes(' & ');
}

function formatObjectKey(key: string): string {
  return isIdentifier(key) ? key : JSON.stringify(key);
}

function formatPropertyAccess(key: string): string {
  return isIdentifier(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
}

function uniqueToolVariableNames(toolNames: string[]): string[] {
  const seen = new Map<string, number>();
  return toolNames.map(toolName => {
    const base = toIdentifier(toolName);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}${count + 1}`;
  });
}

function toIdentifier(value: string): string {
  const identifier = value
    .replace(/[^A-Za-z0-9_$]/g, '_')
    .replace(/^[^A-Za-z_$]+/, '');
  return identifier.length === 0 ? 'tool' : identifier;
}

function isIdentifier(value: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);
}

function compactObjectType(lines: string[]): string | undefined {
  if (lines.length === 0 || lines.some(line => line.includes('/**'))) {
    return undefined;
  }

  const fields = lines.map(line => line.trim());
  if (fields.some(field => field.includes('\n'))) {
    return undefined;
  }

  const compact = `{ ${fields.join(' ')} }`;
  return compact.length <= MAX_COMPACT_OBJECT_TYPE_LENGTH ? compact : undefined;
}

function toComment(value: string): string {
  return value.replaceAll('*/', '* /').replace(/\s+/g, ' ').trim();
}

function firstString(...values: unknown[]): string | undefined {
  return values.find(isString);
}

function schemaArray(value: unknown): JsonSchema[] | undefined {
  const values = asArray(value);
  if (values === undefined || !values.every(isRecord)) {
    return undefined;
  }
  return values;
}

function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function isRecord(value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return isRecord(value) && typeof value.then === 'function';
}
