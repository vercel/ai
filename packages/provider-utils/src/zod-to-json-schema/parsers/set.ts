import { ZodSetDef } from "zod";
import { ErrorMessages, setResponseValueAndErrors } from "../errorMessages.js";
import { parseDef } from "../parseDef.js";
import { JsonSchema7Type } from "../parseTypes.js";
import { Refs } from "../Refs.js";

export type JsonSchema7SetType = {
  type: "array";
  uniqueItems: true;
  items?: JsonSchema7Type;
  minItems?: number;
  maxItems?: number;
  errorMessage?: ErrorMessages<JsonSchema7SetType>;
};

export function parseSetDef(def: ZodSetDef, refs: Refs): JsonSchema7SetType {
  const items = parseDef(def.valueType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "items"],
  });

  const schema: JsonSchema7SetType = {
    type: "array",
    uniqueItems: true,
    items,
  };

  if (def.minSize) {
    setResponseValueAndErrors(
      schema,
      "minItems",
      def.minSize.value,
      def.minSize.message,
      refs,
    );
  }

  if (def.maxSize) {
    setResponseValueAndErrors(
      schema,
      "maxItems",
      def.maxSize.value,
      def.maxSize.message,
      refs,
    );
  }

  return schema;
}
