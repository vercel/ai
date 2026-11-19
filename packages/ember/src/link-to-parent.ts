import {
  associateDestroyableChild,
  registerDestructor,
} from '@ember/destroyable';

/**
 * Runs `cleanup` when `instance` is destroyed.
 *
 * With a `parent` (for example a component),
 * the instance is destroyed together with the parent,
 * so an unmounted component stops its requests.
 *
 * Without a `parent`,
 * `destroy()` from `@ember/destroyable` ends the instance.
 */
export function linkToParent(
  instance: object,
  parent: object | undefined,
  cleanup: () => void,
): void {
  registerDestructor(instance, cleanup);

  if (parent !== undefined) {
    associateDestroyableChild(parent, instance);
  }
}

/**
 * Splits the `(options)` and `(parent, options)` constructor forms.
 *
 * The two-argument form is the only one with a parent,
 * so the argument count decides, not the shape of the first argument.
 */
export function splitArguments<OPTIONS>(
  argumentCount: number,
  first: object | OPTIONS | undefined,
  second: OPTIONS | undefined,
): { parent: object | undefined; options: OPTIONS | undefined } {
  if (argumentCount >= 2) {
    return { parent: first as object, options: second };
  }

  return { parent: undefined, options: first as OPTIONS | undefined };
}
