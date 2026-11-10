import { getStaticPropertyName } from '../ast-utils.mjs';

/**
 * Disallows property checks and iteration that consult the prototype chain,
 * or that rely on a method inherited through it:
 * - the `in` operator with a dynamic key, or with a static key naming an
 *   `Object.prototype` member, since both also match inherited properties
 * - `for...in`, which also iterates inherited enumerable properties
 * - `obj.hasOwnProperty(key)`, which is missing on null-prototype objects and
 *   can be shadowed by user-controlled properties
 *
 * All three are replaced by `Object.hasOwn()`, or by `Object.keys()` /
 * `Object.entries()` with `for...of` for iteration.
 *
 * The `in` operator with any other static key (a string or number literal, a
 * template literal without expressions, or a well-known symbol such as
 * `Symbol.asyncIterator`) is allowed. Such checks typically detect a
 * capability of an object implementing a known interface, where members
 * defined on a class prototype must count. Without type information, a data
 * record cannot be told apart from such an object syntactically, and a static
 * key that is not an `Object.prototype` member only matches an inherited
 * property once the prototype has already been polluted.
 *
 * Private brand checks (`#field in obj`) are not flagged, since they never
 * consult the prototype chain.
 */

const objectPrototypeMemberNames = new Set(
  Object.getOwnPropertyNames(Object.prototype),
);

/**
 * Returns the key of an `in` check when it is static: a string, number,
 * template literal without expressions, or well-known symbol. Returns
 * `undefined` for dynamic keys.
 */
function getStaticInKey(key) {
  if (key.type === 'Literal') {
    return typeof key.value === 'string' || typeof key.value === 'number'
      ? { name: String(key.value) }
      : undefined;
  }

  if (key.type === 'TemplateLiteral' && key.expressions.length === 0) {
    return { name: key.quasis[0]?.value.cooked ?? '' };
  }

  if (
    key.type === 'MemberExpression' &&
    !key.computed &&
    key.object.type === 'Identifier' &&
    key.object.name === 'Symbol'
  ) {
    return { symbol: true };
  }

  return undefined;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow property checks and iteration that consult the prototype chain.',
    },
    messages: {
      inOperator:
        'Avoid prototype-chain property checks with dynamic keys. Use `Object.hasOwn({{object}}, {{property}})` instead of the `in` operator.',
      inOperatorPrototypeMember:
        '{{property}} is an `Object.prototype` member, so the `in` operator matches it on every plain object. Use `Object.hasOwn({{object}}, {{property}})` instead.',
      forIn:
        'Avoid prototype-chain property iteration. Use `Object.keys()` or `Object.entries()` with `for...of` instead of `for...in`.',
      hasOwnPropertyCall:
        'Use `Object.hasOwn({{object}}, key)` instead of calling `hasOwnProperty()` on the object. The method can be missing on null-prototype objects or shadowed by user-controlled properties.',
    },
  },
  create(context) {
    const { sourceCode } = context;

    return {
      BinaryExpression(node) {
        if (node.operator !== 'in' || node.left.type === 'PrivateIdentifier') {
          return;
        }

        const staticKey = getStaticInKey(node.left);
        if (
          staticKey !== undefined &&
          (staticKey.symbol || !objectPrototypeMemberNames.has(staticKey.name))
        ) {
          return;
        }

        context.report({
          node,
          messageId:
            staticKey === undefined ? 'inOperator' : 'inOperatorPrototypeMember',
          data: {
            object: sourceCode.getText(node.right),
            property: sourceCode.getText(node.left),
          },
        });
      },
      ForInStatement(node) {
        context.report({ node, messageId: 'forIn' });
      },
      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type === 'MemberExpression' &&
          getStaticPropertyName({
            key: callee.property,
            computed: callee.computed,
          }) === 'hasOwnProperty'
        ) {
          context.report({
            node,
            messageId: 'hasOwnPropertyCall',
            data: { object: sourceCode.getText(callee.object) },
          });
        }
      },
    };
  },
};
