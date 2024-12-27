import type { ZodSchema } from 'zod';
import { printNode, zodToTs } from 'zod-to-ts';

// This function is used to convert zod schema to type definition string
export const generateZodTypeString = (zod: ZodSchema, K: string) => {
  const { node: type } = zodToTs(zod, K as string);
  const typeString = printNode(type);
  return typeString;
};
