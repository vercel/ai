/**
 * Disallows double type assertions through `unknown` (`value as unknown as T`,
 * or the angle-bracket equivalent `<T><unknown>value`). They bypass
 * TypeScript's type checking entirely; the underlying type mismatch should be
 * fixed instead.
 */

const assertionTypes = new Set(['TSAsExpression', 'TSTypeAssertion']);

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow double type assertions through `unknown`.',
    },
    messages: {
      asUnknownAs:
        "Avoid `as unknown as {{type}}`. Double assertions through `unknown` bypass TypeScript's type checking entirely. Fix the underlying type mismatch instead.",
    },
  },
  create(context) {
    const check = node => {
      const inner = node.expression;
      if (
        assertionTypes.has(inner.type) &&
        inner.typeAnnotation.type === 'TSUnknownKeyword'
      ) {
        context.report({
          node,
          messageId: 'asUnknownAs',
          data: { type: context.sourceCode.getText(node.typeAnnotation) },
        });
      }
    };

    return {
      TSAsExpression: check,
      TSTypeAssertion: check,
    };
  },
};
