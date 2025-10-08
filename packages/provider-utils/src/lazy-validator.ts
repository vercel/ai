import { Validator } from './validator';

/**
 * Creates a validator with deferred creation.
 * This is important to reduce the startup time of the library
 * and to avoid initializing unused validators.
 *
 * @param createValidator A function that creates a validator.
 * @returns A function that returns a validator.
 */
export function lazyValidator<OBJECT>(
  createValidator: () => Validator<OBJECT>,
): LazyValidator<OBJECT> {
  // cache the validator to avoid initializing it multiple times
  let validator: Validator<OBJECT> | undefined;
  return () => {
    if (validator == null) {
      validator = createValidator();
    }
    return validator;
  };
}

export type LazyValidator<OBJECT> = () => Validator<OBJECT>;

export type InferFromLazyValidator<LAZY_VALIDATOR> =
  LAZY_VALIDATOR extends LazyValidator<infer OBJECT> ? OBJECT : never;
