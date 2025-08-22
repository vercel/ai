import { Refs } from "../Refs.js";
import { JsonSchema7AnyType, parseAnyDef } from "./any.js";

export type JsonSchema7NeverType = {
  not: JsonSchema7AnyType;
};

export function parseNeverDef(refs: Refs): JsonSchema7NeverType | undefined {
  return refs.target === "openAi"
    ? undefined
    : {
        not: parseAnyDef({
          ...refs,
          currentPath: [...refs.currentPath, "not"],
        }),
      };
}
