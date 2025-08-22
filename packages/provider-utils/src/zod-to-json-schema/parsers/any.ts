import { Refs } from "../Refs.js";
import { getRelativePath } from "../getRelativePath.js";

export type JsonSchema7AnyType = { $ref?: string };

export function parseAnyDef(refs: Refs): JsonSchema7AnyType {
  if (refs.target !== "openAi") {
    return {};
  }

  const anyDefinitionPath = [
    ...refs.basePath,
    refs.definitionPath,
    refs.openAiAnyTypeName,
  ];

  refs.flags.hasReferencedOpenAiAnyType = true;

  return {
    $ref:
      refs.$refStrategy === "relative"
        ? getRelativePath(anyDefinitionPath, refs.currentPath)
        : anyDefinitionPath.join("/"),
  };
}
