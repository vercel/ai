/**
 * Requires a single object parameter with named properties instead of
 * multiple positional parameters. Object parameters keep call sites
 * self-documenting and make argument order irrelevant.
 *
 * Only signatures whose author owns the parameter list are checked: function
 * declarations (including `declare` and overload signatures), every method
 * form (class, abstract, object, interface), constructors and construct
 * signatures, function values directly assigned to a variable, and type
 * aliases that are directly a function or constructor type.
 *
 * Callback-shaped signatures whose parameter list is dictated by the API that
 * calls them are intentionally not checked: functions passed inline as
 * arguments, object-property function values, class arrow-function fields,
 * call signatures, and inline function types. Their authors cannot switch them
 * to a single object parameter, so flagging them only produces unfixable
 * diagnostics.
 *
 * A leading TypeScript `this` parameter does not count as a positional
 * parameter.
 */

function isThisParameter(param) {
  return param.type === 'Identifier' && param.name === 'this';
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a single object parameter instead of multiple positional parameters.',
    },
    messages: {
      multiplePositionalParameters:
        'Use a single object argument with named parameters instead of multiple positional parameters. Object parameters keep call sites self-documenting and make argument order irrelevant.',
    },
  },
  create(context) {
    const check = params => {
      if (params == null || params.length === 0) return;

      const positionalCount = isThisParameter(params[0])
        ? params.length - 1
        : params.length;
      if (positionalCount < 2) return;

      context.report({
        loc: {
          start: params[0].loc.start,
          end: params[params.length - 1].loc.end,
        },
        messageId: 'multiplePositionalParameters',
      });
    };

    return {
      FunctionDeclaration(node) {
        check(node.params);
      },
      TSDeclareFunction(node) {
        check(node.params);
      },
      MethodDefinition(node) {
        check(node.value.params);
      },
      TSAbstractMethodDefinition(node) {
        check(node.value.params);
      },
      Property(node) {
        if (node.method) {
          check(node.value.params);
        }
      },
      TSMethodSignature(node) {
        check(node.params);
      },
      TSConstructSignatureDeclaration(node) {
        check(node.params);
      },
      VariableDeclarator(node) {
        if (
          node.init != null &&
          (node.init.type === 'ArrowFunctionExpression' ||
            node.init.type === 'FunctionExpression')
        ) {
          check(node.init.params);
        }
      },
      TSTypeAliasDeclaration(node) {
        const aliased = node.typeAnnotation;
        if (
          aliased.type === 'TSFunctionType' ||
          aliased.type === 'TSConstructorType'
        ) {
          check(aliased.params);
        }
      },
    };
  },
};
