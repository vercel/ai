import { ZodCatchDef } from "zod";
import { parseDef } from "../parseDef.js";
import { Refs } from "../Refs.js";

export const parseCatchDef = (def: ZodCatchDef<any>, refs: Refs) => {
  return parseDef(def.innerType._def, refs);
};
