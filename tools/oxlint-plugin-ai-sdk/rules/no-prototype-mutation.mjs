import { isMemberAccess } from '../ast-utils.mjs';

/**
 * Disallows mutating prototype chains with `Object.setPrototypeOf()` or
 * `Reflect.setPrototypeOf()`. The intended shape should be created up front
 * with `Object.create(null)` or an explicit class/object model.
 */

const prototypeApiOwners = ['Object', 'Reflect'];

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow mutating prototype chains with `setPrototypeOf()`.',
    },
    messages: {
      setPrototypeOf:
        'Avoid mutating prototype chains with `setPrototypeOf()`. Prefer creating the intended shape up front with `Object.create(null)` or an explicit class/object model.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (
          prototypeApiOwners.some(objectName =>
            isMemberAccess({
              node: node.callee,
              objectName,
              propertyName: 'setPrototypeOf',
            }),
          )
        ) {
          context.report({ node, messageId: 'setPrototypeOf' });
        }
      },
    };
  },
};
