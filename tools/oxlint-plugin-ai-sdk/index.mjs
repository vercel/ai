/**
 * Repo-local oxlint plugin for AI SDK conventions.
 *
 * `ai-sdk/require-validate-url`: every `getFromApi` call must pass an inline
 * options object with an explicit `validateUrl` property. The option is
 * optional in the public type (a required property would break external
 * callers of `@ai-sdk/provider-utils`), so this rule restores the forcing
 * function for in-repo code: omitting the flag skips URL validation, and that
 * decision must be visible at the call site.
 * See contributing/secure-url-handling.md.
 */

const requireValidateUrl = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require an explicit `validateUrl` property on every `getFromApi` call.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          node.callee.name !== 'getFromApi'
        ) {
          return;
        }

        const [options] = node.arguments;

        // Fail closed: an options value built elsewhere cannot be verified
        // statically, so require an inline object literal.
        if (options === undefined || options.type !== 'ObjectExpression') {
          context.report({
            node,
            message:
              'Pass `getFromApi` an inline options object with an explicit `validateUrl` (see contributing/secure-url-handling.md).',
          });
          return;
        }

        const hasValidateUrl = options.properties.some(
          property =>
            property.type === 'Property' &&
            !property.computed &&
            ((property.key.type === 'Identifier' &&
              property.key.name === 'validateUrl') ||
              (property.key.type === 'Literal' &&
                property.key.value === 'validateUrl')),
        );

        if (!hasValidateUrl) {
          context.report({
            node,
            message:
              'Set `validateUrl` explicitly on this `getFromApi` call: `true` when the URL comes from a provider response body, `false` for config-derived URLs (see contributing/secure-url-handling.md).',
          });
        }
      },
    };
  },
};

const requireDocblock = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require docblocks on selected declarations.',
    },
  },
  create(context) {
    const functionLikeTypes = new Set([
      'FunctionDeclaration',
      'FunctionExpression',
      'ArrowFunctionExpression',
      'MethodDefinition',
      'TSDeclareMethod',
      'TSAbstractMethodDefinition',
      'TSFunctionType',
      'TSMethodSignature',
      'TSCallSignatureDeclaration',
      'TSConstructSignatureDeclaration',
    ]);

    const isInsideFunctionOrMethod = node => {
      let ancestor = node.parent;

      while (ancestor !== undefined && ancestor !== null) {
        if (functionLikeTypes.has(ancestor.type)) return true;
        ancestor = ancestor.parent;
      }

      return false;
    };

    const isDeclaredTypeProperty = node => {
      let ancestor = node.parent;

      while (ancestor !== undefined && ancestor !== null) {
        if (functionLikeTypes.has(ancestor.type)) return false;

        if (
          ancestor.type === 'TSTypeAliasDeclaration' ||
          ancestor.type === 'TSInterfaceDeclaration'
        ) {
          return true;
        }

        ancestor = ancestor.parent;
      }

      return false;
    };

    const reportIfMissingDocblock = node => {
      const hasDocblock = context.sourceCode
        .getCommentsBefore(node)
        .some(
          comment =>
            comment.type === 'Block' && comment.value.startsWith('*'),
        );

      if (!hasDocblock) {
        context.report({
          node,
          message: 'Add a JSDoc comment immediately before this declaration.',
        });
      }
    };

    return {
      FunctionDeclaration(node) {
        if (!isInsideFunctionOrMethod(node)) {
          reportIfMissingDocblock(node);
        }
      },
      ClassDeclaration: reportIfMissingDocblock,
      MethodDefinition: reportIfMissingDocblock,
      TSDeclareMethod: reportIfMissingDocblock,
      TSAbstractMethodDefinition: reportIfMissingDocblock,
      TSInterfaceDeclaration: reportIfMissingDocblock,
      TSTypeAliasDeclaration: reportIfMissingDocblock,
      TSPropertySignature(node) {
        if (isDeclaredTypeProperty(node)) {
          reportIfMissingDocblock(node);
        }
      },
    };
  },
};

export default {
  meta: {
    name: 'ai-sdk',
  },
  rules: {
    'require-validate-url': requireValidateUrl,
    'require-docblock': requireDocblock,
  },
};
