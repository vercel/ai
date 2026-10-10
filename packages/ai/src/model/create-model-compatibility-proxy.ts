type ModelMethod = (...args: never[]) => unknown;

export function createModelCompatibilityProxy<T extends object>(
  model: T,
  specificationVersion: string,
  methodNames: readonly (keyof T)[],
): T {
  const boundMethods = new WeakMap<ModelMethod, ModelMethod>();
  const methodNameSet = new Set<PropertyKey>(methodNames);

  return new Proxy(model, {
    get(target, prop) {
      if (prop === 'specificationVersion') {
        return specificationVersion;
      }

      const value = Reflect.get(target, prop, target);

      if (!methodNameSet.has(prop) || typeof value !== 'function') {
        return value;
      }

      const method = value as ModelMethod;
      let boundMethod = boundMethods.get(method);

      if (boundMethod == null) {
        boundMethod = method.bind(target);
        boundMethods.set(method, boundMethod);
      }

      return boundMethod;
    },
  });
}
