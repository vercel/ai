/**
 * The literal model IDs of a model ID type such as `'a' | 'b' | (string & {})`,
 * without the open-ended `string & {}` part.
 *
 * Tests use it to check that a list of model IDs matches the type exactly:
 *
 * ```ts
 * const modelIds = ['a', 'b'] as const satisfies readonly KnownModelId<ModelId>[];
 * expectTypeOf<Exclude<KnownModelId<ModelId>, (typeof modelIds)[number]>>().toBeNever();
 * ```
 */
export type KnownModelId<MODEL_ID> = MODEL_ID extends string
  ? string extends MODEL_ID
    ? never
    : MODEL_ID
  : never;
