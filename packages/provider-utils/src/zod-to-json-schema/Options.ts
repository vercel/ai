import { ZodSchema, ZodTypeDef } from "zod";
import { Refs, Seen } from "./Refs";
import { JsonSchema7Type } from "./parseTypes";

export type Targets =
  | "jsonSchema7"
  | "jsonSchema2019-09"
  | "openApi3"
  | "openAi";

export type DateStrategy =
  | "format:date-time"
  | "format:date"
  | "string"
  | "integer";

export const ignoreOverride = Symbol(
  "Let zodToJsonSchema decide on which parser to use",
);

export type OverrideCallback = (
  def: ZodTypeDef,
  refs: Refs,
  seen: Seen | undefined,
  forceResolution?: boolean,
) => JsonSchema7Type | undefined | typeof ignoreOverride;

export type PostProcessCallback = (
  jsonSchema: JsonSchema7Type | undefined,
  def: ZodTypeDef,
  refs: Refs,
) => JsonSchema7Type | undefined;

export const jsonDescription: PostProcessCallback = (jsonSchema, def) => {
  if (def.description) {
    try {
      return {
        ...jsonSchema,
        ...JSON.parse(def.description),
      };
    } catch {}
  }

  return jsonSchema;
};

export type Options<Target extends Targets = "jsonSchema7"> = {
  name: string | undefined;
  $refStrategy: "root" | "relative" | "none" | "seen";
  basePath: string[];
  effectStrategy: "input" | "any";
  pipeStrategy: "input" | "output" | "all";
  dateStrategy: DateStrategy | DateStrategy[];
  mapStrategy: "entries" | "record";
  removeAdditionalStrategy: "passthrough" | "strict";
  allowedAdditionalProperties: true | undefined;
  rejectedAdditionalProperties: false | undefined;
  target: Target;
  strictUnions: boolean;
  definitionPath: string;
  definitions: Record<string, ZodSchema>;
  errorMessages: boolean;
  markdownDescription: boolean;
  patternStrategy: "escape" | "preserve";
  applyRegexFlags: boolean;
  emailStrategy: "format:email" | "format:idn-email" | "pattern:zod";
  base64Strategy: "format:binary" | "contentEncoding:base64" | "pattern:zod";
  nameStrategy: "ref" | "title";
  override?: OverrideCallback;
  postProcess?: PostProcessCallback;
  openAiAnyTypeName: string
};

export const defaultOptions: Options = {
  name: undefined,
  $refStrategy: "root",
  basePath: ["#"],
  effectStrategy: "input",
  pipeStrategy: "all",
  dateStrategy: "format:date-time",
  mapStrategy: "entries",
  removeAdditionalStrategy: "passthrough",
  allowedAdditionalProperties: true,
  rejectedAdditionalProperties: false,
  definitionPath: "definitions",
  target: "jsonSchema7",
  strictUnions: false,
  definitions: {},
  errorMessages: false,
  markdownDescription: false,
  patternStrategy: "escape",
  applyRegexFlags: false,
  emailStrategy: "format:email",
  base64Strategy: "contentEncoding:base64",
  nameStrategy: "ref",
  openAiAnyTypeName: "OpenAiAnyType"
};

export const getDefaultOptions = <Target extends Targets>(
  options: Partial<Options<Target>> | string | undefined,
) =>
  (typeof options === "string"
    ? {
        ...defaultOptions,
        name: options,
      }
    : {
        ...defaultOptions,
        ...options,
      }) as Options<Target>;
