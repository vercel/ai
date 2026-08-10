import { safeParseJSON } from '@ai-sdk/provider-utils';
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
    const parsed = await safeParseJSON({
      text: serialized,
      schema: serializableRecordSchema,
    });
    if (!parsed.success) {
      throw new Error(
        `ACP instruction mapping environment variable ${JSON.stringify(instructionMapping.variable)} must contain a JSON object.`,
      );
    }
    configuration = parsed.value;
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
