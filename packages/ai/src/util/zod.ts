// A namespace import lets bundlers see each call as a call to the pure Zod factory,
// so a consumer keeps only the schemas it uses.
export * as z from './zod-mini-factories';

export type { ZodMiniType as ZodType, output as ZodOutput } from 'zod/v4/mini';
