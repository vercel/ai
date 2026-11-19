import { isEmptyObjectExpression } from '../ast-utils.mjs';

/**
 * Disallows spreading a ternary that chooses between an empty object literal
 * and another object literal, such as `...(condition ? { name } : {})`.
 * Objects should be built explicitly, with optional properties assigned
 * conditionally.
 */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow conditional object spreads.',
    },
    messages: {
      conditionalSpread:
        'Avoid conditional object spreads. Build the object explicitly and assign optional properties conditionally.',
    },
  },
  create(context) {
    return {
      SpreadElement(node) {
        if (node.parent?.type !== 'ObjectExpression') return;

        const argument = node.argument;
        if (argument.type !== 'ConditionalExpression') return;

        const { consequent, alternate } = argument;
        if (
          consequent.type !== 'ObjectExpression' ||
          alternate.type !== 'ObjectExpression'
        ) {
          return;
        }

        if (
          isEmptyObjectExpression(consequent) ||
          isEmptyObjectExpression(alternate)
        ) {
          context.report({ node, messageId: 'conditionalSpread' });
        }
      },
    };
  },
};
