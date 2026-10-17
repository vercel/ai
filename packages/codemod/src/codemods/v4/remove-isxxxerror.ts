import type { MemberExpression } from 'jscodeshift';
import { createTransformer } from '../lib/create-transformer';

const ERROR_METHODS = new Set<string>([
  'isAPICallError',
  'isEmptyResponseBodyError',
  'isInvalidArgumentError',
  'isInvalidPromptError',
  'isInvalidResponseDataError',
  'isJSONParseError',
  'isLoadAPIKeyError',
  'isLoadSettingError',
  'isNoContentGeneratedError',
  'isNoObjectGeneratedError',
  'isNoSuchModelError',
  'isNoSuchProviderError',
  'isNoSuchToolError',
  'isTooManyEmbeddingValuesForCallError',
  'isTypeValidationError',
  'isUnsupportedFunctionalityError',
  'isInvalidDataContentError',
  'isInvalidMessageRoleError',
  'isDownloadError',
  'isRetryError',
]);

function isSdkPackage(source: unknown): boolean {
  return (
    typeof source === 'string' &&
    (source === 'ai' || source.startsWith('@ai-sdk/'))
  );
}

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  // Local names that are bound by imports from packages other than the SDK.
  // A static `isXxxError` method on one of these is not an SDK error class,
  // so it must not be rewritten.
  const foreignImportNames = new Set<string>();

  root.find(j.ImportDeclaration).forEach(path => {
    if (isSdkPackage(path.node.source.value)) {
      return;
    }

    path.node.specifiers?.forEach(specifier => {
      if (specifier.local) {
        foreignImportNames.add(specifier.local.name);
      }
    });
  });

  // Classes declared in this file are not SDK error classes either.
  const localClassNames = new Set<string>();

  root.find(j.ClassDeclaration).forEach(path => {
    if (path.node.id?.type === 'Identifier') {
      localClassNames.add(path.node.id.name);
    }
  });

  // Rewrite `Receiver.isXxxError(value)` to `Receiver.isInstance(value)`.
  // The receiver is kept as written so that import aliases
  // (`import { APICallError as APIError }`) and namespace imports
  // (`ai.APICallError`) stay bound after the migration.
  root
    .find(j.CallExpression)
    .filter(path => {
      const callee = path.node.callee;

      if (
        callee.type !== 'MemberExpression' ||
        callee.computed ||
        callee.property.type !== 'Identifier' ||
        !ERROR_METHODS.has(callee.property.name)
      ) {
        return false;
      }

      const receiver = callee.object;

      if (receiver.type === 'Identifier') {
        return (
          !foreignImportNames.has(receiver.name) &&
          !localClassNames.has(receiver.name)
        );
      }

      return receiver.type === 'MemberExpression';
    })
    .forEach(path => {
      const callee = path.node.callee as MemberExpression;
      callee.property = j.identifier('isInstance');
      context.hasChanges = true;
    });
});
