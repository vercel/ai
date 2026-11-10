import { getStaticPropertyName } from '../ast-utils.mjs';

/**
 * Disallows direct prototype access through `__proto__` or
 * `constructor.prototype`, for both reads and writes. These property paths are
 * common prototype-pollution primitives. Accessing `prototype` on a named class
 * or function (such as `Widget.prototype.render`) remains allowed.
 */

function getMemberName(node) {
  return node.type === 'MemberExpression'
    ? getStaticPropertyName({ key: node.property, computed: node.computed })
    : undefined;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow direct prototype access through `__proto__` or `constructor.prototype`.',
    },
    messages: {
      prototypeAccess:
        'Avoid direct prototype access through `__proto__` or `constructor.prototype`. These property paths are common prototype-pollution primitives; use explicit prototype APIs only in audited code.',
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        const name = getMemberName(node);

        if (
          name === '__proto__' ||
          (name === 'prototype' && getMemberName(node.object) === 'constructor')
        ) {
          context.report({ node, messageId: 'prototypeAccess' });
        }
      },
    };
  },
};
