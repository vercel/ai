import {
  ZodFirstPartyTypeKind,
  ZodMapDef,
  ZodRecordDef,
  ZodTypeAny,
} from "zod";
import { parseDef } from "../parseDef.js";
import { JsonSchema7Type } from "../parseTypes.js";
import { Refs } from "../Refs.js";
import { JsonSchema7EnumType } from "./enum.js";
import { JsonSchema7ObjectType } from "./object.js";
import { JsonSchema7StringType, parseStringDef } from "./string.js";
import { parseBrandedDef } from "./branded.js";
import { parseAnyDef } from "./any.js";

type JsonSchema7RecordPropertyNamesType =
  | Omit<JsonSchema7StringType, "type">
  | Omit<JsonSchema7EnumType, "type">;

export type JsonSchema7RecordType = {
  type: "object";
  additionalProperties?: JsonSchema7Type | true;
  propertyNames?: JsonSchema7RecordPropertyNamesType;
};

export function parseRecordDef(
  def: ZodRecordDef<ZodTypeAny, ZodTypeAny> | ZodMapDef,
  refs: Refs,
): JsonSchema7RecordType {
  if (refs.target === "openAi") {
    console.warn(
      "Warning: OpenAI may not support records in schemas! Try an array of key-value pairs instead.",
    );
  }

  if (
    refs.target === "openApi3" &&
    def.keyType?._def.typeName === ZodFirstPartyTypeKind.ZodEnum
  ) {
    return {
      type: "object",
      required: def.keyType._def.values,
      properties: def.keyType._def.values.reduce(
        (acc: Record<string, JsonSchema7Type>, key: string) => ({
          ...acc,
          [key]:
            parseDef(def.valueType._def, {
              ...refs,
              currentPath: [...refs.currentPath, "properties", key],
            }) ?? parseAnyDef(refs),
        }),
        {},
      ),
      additionalProperties: refs.rejectedAdditionalProperties,
    } satisfies JsonSchema7ObjectType as any;
  }

  const schema: JsonSchema7RecordType = {
    type: "object",
    additionalProperties:
      parseDef(def.valueType._def, {
        ...refs,
        currentPath: [...refs.currentPath, "additionalProperties"],
      }) ?? refs.allowedAdditionalProperties,
  };

  if (refs.target === "openApi3") {
    return schema;
  }

  if (
    def.keyType?._def.typeName === ZodFirstPartyTypeKind.ZodString &&
    def.keyType._def.checks?.length
  ) {
    const { type, ...keyType } = parseStringDef(def.keyType._def, refs);

    return {
      ...schema,
      propertyNames: keyType,
    };
  } else if (def.keyType?._def.typeName === ZodFirstPartyTypeKind.ZodEnum) {
    return {
      ...schema,
      propertyNames: {
        enum: def.keyType._def.values,
      },
    };
  } else if (
    def.keyType?._def.typeName === ZodFirstPartyTypeKind.ZodBranded &&
    def.keyType._def.type._def.typeName === ZodFirstPartyTypeKind.ZodString &&
    def.keyType._def.type._def.checks?.length
  ) {
    const { type, ...keyType } = parseBrandedDef(
      def.keyType._def,
      refs,
    ) as JsonSchema7StringType;

    return {
      ...schema,
      propertyNames: keyType,
    };
  }

  return schema;
}
