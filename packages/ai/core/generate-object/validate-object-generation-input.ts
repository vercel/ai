import { z } from 'zod';
import { InvalidArgumentError } from '../../errors/invalid-argument-error';
import { Schema } from '@ai-sdk/ui-utils';

export function validateObjectGenerationInput({
  output,
  mode,
  schema,
  schemaName,
  schemaDescription,
  enumValues,
}: {
  output?: 'object' | 'array' | 'enum' | 'no-schema';
  schema?: z.Schema<any, z.ZodTypeDef, any> | Schema<any>;
  schemaName?: string;
  schemaDescription?: string;
  enumValues?: Array<unknown>;
  mode?: 'auto' | 'json' | 'tool';
}) {
  if (
    output != null &&
    output !== 'object' &&
    output !== 'array' &&
    output !== 'enum' &&
    output !== 'no-schema'
  ) {
    throw new InvalidArgumentError({
      parameter: 'output',
      value: output,
      message: 'Invalid output type.',
    });
  }

  if (output === 'no-schema') {
    if (mode === 'auto' || mode === 'tool') {
      throw new InvalidArgumentError({
        parameter: 'mode',
        value: mode,
        message: 'Mode must be "json" for no-schema output.',
      });
    }

    if (schema != null) {
      throw new InvalidArgumentError({
        parameter: 'schema',
        value: schema,
        message: 'Schema is not supported for no-schema output.',
      });
    }

    if (schemaDescription != null) {
      throw new InvalidArgumentError({
        parameter: 'schemaDescription',
        value: schemaDescription,
        message: 'Schema description is not supported for no-schema output.',
      });
    }

    if (schemaName != null) {
      throw new InvalidArgumentError({
        parameter: 'schemaName',
        value: schemaName,
        message: 'Schema name is not supported for no-schema output.',
      });
    }

    if (enumValues != null) {
      throw new InvalidArgumentError({
        parameter: 'enumValues',
        value: enumValues,
        message: 'Enum values are not supported for no-schema output.',
      });
    }
  }

  if (output === 'object') {
    if (schema == null) {
      throw new InvalidArgumentError({
        parameter: 'schema',
        value: schema,
        message: 'Schema is required for object output.',
      });
    }

    if (enumValues != null) {
      throw new InvalidArgumentError({
        parameter: 'enumValues',
        value: enumValues,
        message: 'Enum values are not supported for object output.',
      });
    }
  }

  if (output === 'array') {
    if (schema == null) {
      throw new InvalidArgumentError({
        parameter: 'schema',
        value: schema,
        message: 'Element schema is required for array output.',
      });
    }

    if (enumValues != null) {
      throw new InvalidArgumentError({
        parameter: 'enumValues',
        value: enumValues,
        message: 'Enum values are not supported for array output.',
      });
    }
  }

  if (output === 'enum') {
    if (schema != null) {
      throw new InvalidArgumentError({
        parameter: 'schema',
        value: schema,
        message: 'Schema is not supported for enum output.',
      });
    }

    if (schemaDescription != null) {
      throw new InvalidArgumentError({
        parameter: 'schemaDescription',
        value: schemaDescription,
        message: 'Schema description is not supported for enum output.',
      });
    }

    if (schemaName != null) {
      throw new InvalidArgumentError({
        parameter: 'schemaName',
        value: schemaName,
        message: 'Schema name is not supported for enum output.',
      });
    }

    if (enumValues == null) {
      throw new InvalidArgumentError({
        parameter: 'enumValues',
        value: enumValues,
        message: 'Enum values are required for enum output.',
      });
    }

    for (const value of enumValues) {
      if (typeof value !== 'string') {
        throw new InvalidArgumentError({
          parameter: 'enumValues',
          value,
          message: 'Enum values must be strings.',
        });
      }
    }
  }
}
