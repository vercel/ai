import {
  getStaticPropertyName,
  isEmptyObjectExpression,
  isMemberAccess,
} from '../ast-utils.mjs';

/**
 * Disallows creating plain, `Object.prototype`-backed objects in places where
 * they typically collect dynamic keys. Such objects inherit from
 * `Object.prototype`, which exposes dynamic-key aggregation to
 * prototype-pollution behavior. Use `Object.create(null)` or a `Map` instead.
 *
 * Flagged forms:
 * - `{}` as the accumulator of `reduce()` / `reduceRight()`
 * - `{}` as the target of `Object.assign()`
 * - any `Object.fromEntries()` call
 * - an object literal initializing a variable typed `Record<string, ...>`
 */

const reduceMethodNames = new Set(['reduce', 'reduceRight']);

function isStringRecordType(typeAnnotation) {
  const type = typeAnnotation?.typeAnnotation;
  return (
    type?.type === 'TSTypeReference' &&
    type.typeName.type === 'Identifier' &&
    type.typeName.name === 'Record' &&
    type.typeArguments?.params[0]?.type === 'TSStringKeyword'
  );
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow plain objects that inherit from `Object.prototype` where null-prototype objects or maps belong.',
    },
    messages: {
      emptyObjectAccumulator:
        'Use `Object.create(null)` or `new Map()` instead of `{}` as a reducer accumulator. Plain object accumulators have a prototype chain that can leak into dynamic-key aggregation.',
      emptyObjectAssignTarget:
        'Use `Object.assign(Object.create(null), ...)` instead of `Object.assign({}, ...)`. A plain object merge target has a prototype chain that can preserve prototype-pollution risk.',
      objectFromEntries:
        'Avoid `Object.fromEntries()` for dynamic keys. It creates a plain object with `Object.prototype`; use `Map`, a null-prototype helper, or explicit assignment into `Object.create(null)` instead.',
      emptyRecordLiteral:
        'Use `Object.create(null)` instead of `{}` for an empty string-keyed `Record`. Plain object literals inherit from `Object.prototype`, exposing dynamic-key records to prototype-pollution behavior.',
      populatedRecordLiteral:
        'Use `Object.assign(Object.create(null), <objectWithDataToAssign>)` for a populated string-keyed `Record`. Plain object literals inherit from `Object.prototype`, exposing dynamic-key records to prototype-pollution behavior.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        if (callee.type !== 'MemberExpression') return;

        const methodName = getStaticPropertyName({
          key: callee.property,
          computed: callee.computed,
        });

        if (
          reduceMethodNames.has(methodName) &&
          node.arguments.length === 2 &&
          isEmptyObjectExpression(node.arguments[1])
        ) {
          context.report({ node, messageId: 'emptyObjectAccumulator' });
          return;
        }

        if (
          isMemberAccess({
            node: callee,
            objectName: 'Object',
            propertyName: 'assign',
          }) &&
          isEmptyObjectExpression(node.arguments[0])
        ) {
          context.report({ node, messageId: 'emptyObjectAssignTarget' });
          return;
        }

        if (
          isMemberAccess({
            node: callee,
            objectName: 'Object',
            propertyName: 'fromEntries',
          })
        ) {
          context.report({ node, messageId: 'objectFromEntries' });
        }
      },
      VariableDeclarator(node) {
        if (
          node.id.type !== 'Identifier' ||
          node.init?.type !== 'ObjectExpression' ||
          !isStringRecordType(node.id.typeAnnotation)
        ) {
          return;
        }

        context.report({
          node,
          messageId:
            node.init.properties.length === 0
              ? 'emptyRecordLiteral'
              : 'populatedRecordLiteral',
        });
      },
    };
  },
};
