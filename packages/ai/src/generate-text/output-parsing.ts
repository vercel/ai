export type ParsePartialOutput<PARTIAL> = (options: {
  text: string;
}) => Promise<{ partial: PARTIAL } | undefined>;

const partialOutputParserFactories = new WeakMap<
  object,
  () => ParsePartialOutput<unknown>
>();

/**
 * Registers a stream-local partial output parser factory for a built-in output
 * specification without adding parser lifecycle methods to the public Output
 * interface.
 */
export function registerPartialOutputParserFactory<PARTIAL>({
  output,
  factory,
}: {
  output: object;
  factory: () => ParsePartialOutput<PARTIAL>;
}) {
  partialOutputParserFactories.set(output, factory);
}

export function createPartialOutputParser<PARTIAL>({
  output,
  fallback,
}: {
  output: object;
  fallback: ParsePartialOutput<PARTIAL>;
}): ParsePartialOutput<PARTIAL> {
  const factory = partialOutputParserFactories.get(output) as
    | (() => ParsePartialOutput<PARTIAL>)
    | undefined;

  return factory?.() ?? fallback;
}
