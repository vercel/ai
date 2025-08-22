import { ZodTypeDef } from "zod";
import { Refs, Seen } from "./Refs.js";
import { ignoreOverride } from "./Options.js";
import { JsonSchema7Type } from "./parseTypes.js";
import { selectParser } from "./selectParser.js";
import { getRelativePath } from "./getRelativePath.js";
import { parseAnyDef } from "./parsers/any.js";

export function parseDef(
  def: ZodTypeDef,
  refs: Refs,
  forceResolution = false, // Forces a new schema to be instantiated even though its def has been seen. Used for improving refs in definitions. See https://github.com/StefanTerdell/zod-to-json-schema/pull/61.
): JsonSchema7Type | undefined {
  const seenItem = refs.seen.get(def);

  if (refs.override) {
    const overrideResult = refs.override?.(
      def,
      refs,
      seenItem,
      forceResolution,
    );

    if (overrideResult !== ignoreOverride) {
      return overrideResult;
    }
  }

  if (seenItem && !forceResolution) {
    const seenSchema = get$ref(seenItem, refs);

    if (seenSchema !== undefined) {
      return seenSchema;
    }
  }

  const newItem: Seen = { def, path: refs.currentPath, jsonSchema: undefined };

  refs.seen.set(def, newItem);

  const jsonSchemaOrGetter = selectParser(def, (def as any).typeName, refs);

  // If the return was a function, then the inner definition needs to be extracted before a call to parseDef (recursive)
  const jsonSchema =
    typeof jsonSchemaOrGetter === "function"
      ? parseDef(jsonSchemaOrGetter(), refs)
      : jsonSchemaOrGetter;

  if (jsonSchema) {
    addMeta(def, refs, jsonSchema);
  }

  if (refs.postProcess) {
    const postProcessResult = refs.postProcess(jsonSchema, def, refs);

    newItem.jsonSchema = jsonSchema;

    return postProcessResult;
  }

  newItem.jsonSchema = jsonSchema;

  return jsonSchema;
}

const get$ref = (
  item: Seen,
  refs: Refs,
):
  | {
      $ref: string;
    }
  | {}
  | undefined => {
  switch (refs.$refStrategy) {
    case "root":
      return { $ref: item.path.join("/") };
    case "relative":
      return { $ref: getRelativePath(refs.currentPath, item.path) };
    case "none":
    case "seen": {
      if (
        item.path.length < refs.currentPath.length &&
        item.path.every((value, index) => refs.currentPath[index] === value)
      ) {
        console.warn(
          `Recursive reference detected at ${refs.currentPath.join(
            "/",
          )}! Defaulting to any`,
        );

        return parseAnyDef(refs);
      }

      return refs.$refStrategy === "seen" ? parseAnyDef(refs) : undefined;
    }
  }
};

const addMeta = (
  def: ZodTypeDef,
  refs: Refs,
  jsonSchema: JsonSchema7Type,
): JsonSchema7Type => {
  if (def.description) {
    jsonSchema.description = def.description;

    if (refs.markdownDescription) {
      jsonSchema.markdownDescription = def.description;
    }
  }
  return jsonSchema;
};
