import { ZodSchema } from 'zod/v3';
import { Options } from './options';
import { parseDef } from './parse-def';
import { JsonSchema7Type } from './parse-types';
import { getRefs } from './refs';
import { parseAnyDef } from './parsers/any';

const zodToJsonSchema = (
  schema: ZodSchema<any>,
  options?: Partial<Options> | string,
): JsonSchema7Type & {
  $schema?: string;
  definitions?: {
    [key: string]: JsonSchema7Type;
  };
} => {
  const refs = getRefs(options);

  let definitions =
    typeof options === 'object' && options.definitions
      ? Object.entries(options.definitions).reduce(
          (acc: { [key: string]: JsonSchema7Type }, [name, schema]) => ({
            ...acc,
            [name]:
              parseDef(
                schema._def,
                {
                  ...refs,
                  currentPath: [...refs.basePath, refs.definitionPath, name],
                },
                true,
              ) ?? parseAnyDef(),
          }),
          {},
        )
      : undefined;

  const name =
    typeof options === 'string'
      ? options
      : options?.nameStrategy === 'title'
        ? undefined
        : options?.name;

  const main =
    parseDef(
      schema._def,
      name === undefined
        ? refs
        : {
            ...refs,
            currentPath: [...refs.basePath, refs.definitionPath, name],
          },
      false,
    ) ?? (parseAnyDef() as JsonSchema7Type);

  const title =
    typeof options === 'object' &&
    options.name !== undefined &&
    options.nameStrategy === 'title'
      ? options.name
      : undefined;

  if (title !== undefined) {
    main.title = title;
  }

  if (refs.flags.hasReferencedOpenAiAnyType) {
    if (!definitions) {
      definitions = {};
    }

    if (!definitions[refs.openAiAnyTypeName]) {
      definitions[refs.openAiAnyTypeName] = {
        // Skipping "object" as no properties can be defined and additionalProperties must be "false"
        type: ['string', 'number', 'integer', 'boolean', 'array', 'null'],
        items: {
          $ref:
            refs.$refStrategy === 'relative'
              ? '1'
              : [
                  ...refs.basePath,
                  refs.definitionPath,
                  refs.openAiAnyTypeName,
                ].join('/'),
        },
      } as JsonSchema7Type;
    }
  }

  const combined: ReturnType<typeof zodToJsonSchema> =
    name === undefined
      ? definitions
        ? {
            ...main,
            [refs.definitionPath]: definitions,
          }
        : main
      : {
          $ref: [
            ...(refs.$refStrategy === 'relative' ? [] : refs.basePath),
            refs.definitionPath,
            name,
          ].join('/'),
          [refs.definitionPath]: {
            ...definitions,
            [name]: main,
          },
        };

  combined.$schema = 'http://json-schema.org/draft-07/schema#';

  return combined;
};

export { zodToJsonSchema };
