import { createTransformer } from '../lib/create-transformer';

/**
 * Renames the deprecated `experimental_throttle` option of `useChat` and
 * `useCompletion` to the stable `throttle` option.
 *
 * Objects that already set `throttle` are left untouched: the runtime prefers
 * `throttle` over `experimental_throttle`, so a rename would change behavior.
 */
export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  root.find(j.ObjectExpression).forEach(path => {
    const hasThrottleProperty = path.node.properties.some(
      property =>
        (property.type === 'Property' || property.type === 'ObjectProperty') &&
        property.key.type === 'Identifier' &&
        property.key.name === 'throttle',
    );

    if (hasThrottleProperty) {
      return;
    }

    path.node.properties.forEach(property => {
      if (
        (property.type === 'Property' || property.type === 'ObjectProperty') &&
        property.key.type === 'Identifier' &&
        property.key.name === 'experimental_throttle'
      ) {
        property.key.name = 'throttle';
        context.hasChanges = true;
      }
    });
  });
});
