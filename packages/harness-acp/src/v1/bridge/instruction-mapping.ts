import { z } from 'zod/v4';
import type {
  ACPInstructionMapping,
  ACPSerializableValue,
} from '../acp-v1-settings';

const UNSAFE_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

const serializableRecordSchema: z.ZodType<
  Readonly<Record<string, ACPSerializableValue>>
> = z.record(z.string(), z.json());

export async function resolveACPInstructionConfiguration({
  instructions,
  instructionMapping,
  sessionMeta,
  environment,
}: {
  instructions: string | undefined;
  instructionMapping: ACPInstructionMapping | undefined;
  sessionMeta: Readonly<Record<string, ACPSerializableValue>> | undefined;
  environment: Readonly<Record<string, string | undefined>>;
}): Promise<{
  sessionMeta: Readonly<Record<string, ACPSerializableValue>> | undefined;
  environment: Record<string, string | undefined>;
}> {
  const resolvedEnvironment = { ...environment };
  if (
    instructionMapping == null ||
    instructions == null ||
    instructions.length === 0
  ) {
    return { sessionMeta, environment: resolvedEnvironment };
  }

  assertSafePath({ path: instructionMapping.path });

  if (instructionMapping.type === 'session-meta') {
    return {
      sessionMeta: setStringAtPath({
        record: sessionMeta ?? {},
        path: instructionMapping.path,
        value: instructions,
      }),
      environment: resolvedEnvironment,
    };
  }

  const serialized = resolvedEnvironment[instructionMapping.variable];
  let configuration: Readonly<Record<string, ACPSerializableValue>> = {};
  if (serialized != null && serialized.length > 0) {
    configuration = parseSerializableRecord({
      serialized,
      variable: instructionMapping.variable,
    });
  }

  resolvedEnvironment[instructionMapping.variable] = JSON.stringify(
    setStringAtPath({
      record: configuration,
      path: instructionMapping.path,
      value: instructions,
    }),
  );

  return { sessionMeta, environment: resolvedEnvironment };
}

/*
 * The bridge runs in an isolated runtime whose dependencies are limited to the
 * ones declared in this directory's package.json, so AI SDK JSON helpers are
 * unavailable here. Schema validation plus a guarded `JSON.parse` provides the
 * same guarantee: nothing but a validated serializable record escapes.
 */
function parseSerializableRecord({
  serialized,
  variable,
}: {
  serialized: string;
  variable: string;
}): Readonly<Record<string, ACPSerializableValue>> {
  try {
    const result = serializableRecordSchema.safeParse(JSON.parse(serialized));
    if (result.success) return result.data;
  } catch {}
  throw new Error(
    `ACP instruction mapping environment variable ${JSON.stringify(variable)} must contain a JSON object.`,
  );
}

function setStringAtPath({
  record,
  path,
  value,
}: {
  record: Readonly<Record<string, ACPSerializableValue>>;
  path: ReadonlyArray<string>;
  value: string;
}): Record<string, ACPSerializableValue> {
  const [key, ...remainingPath] = path;
  if (key == null) return { ...record };
  return {
    ...record,
    [key]:
      remainingPath.length === 0
        ? value
        : setStringAtPath({
            record: isRecord(record[key]) ? record[key] : {},
            path: remainingPath,
            value,
          }),
  };
}

function assertSafePath({ path }: { path: ReadonlyArray<string> }): void {
  if (
    path.length === 0 ||
    path.some(
      segment => segment.length === 0 || UNSAFE_PATH_SEGMENTS.has(segment),
    )
  ) {
    throw new Error(
      'ACP instruction mapping path must contain only safe, non-empty property names.',
    );
  }
}

function isRecord(
  value: ACPSerializableValue | undefined,
): value is Readonly<Record<string, ACPSerializableValue>> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
