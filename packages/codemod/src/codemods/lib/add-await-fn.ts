import type { ASTPath, Function as FunctionNode } from 'jscodeshift';
import { createTransformer, type TransformContext } from './create-transformer';

const awaitRestrictedNodeTypes = new Set([
  'ClassPrivateProperty',
  'ClassProperty',
  'Decorator',
  'PropertyDefinition',
  'StaticBlock',
  'TSModuleBlock',
]);

function findEnclosingFunction(
  path: ASTPath,
  context: TransformContext,
): ASTPath<FunctionNode> | undefined {
  let currentPath = path.parent;

  while (currentPath != null) {
    if (context.j.Function.check(currentPath.node)) {
      return currentPath as ASTPath<FunctionNode>;
    }

    currentPath = currentPath.parent;
  }

  return undefined;
}

function isWithinFunctionBody(
  path: ASTPath,
  functionPath: ASTPath<FunctionNode>,
) {
  let currentPath = path;

  while (
    currentPath.parent != null &&
    currentPath.parent.node !== functionPath.node
  ) {
    currentPath = currentPath.parent;
  }

  return (
    currentPath.parent?.node === functionPath.node &&
    currentPath.name === 'body'
  );
}

function findAwaitRestrictedAncestor(
  path: ASTPath,
  functionPath: ASTPath<FunctionNode> | undefined,
) {
  let currentPath = path.parent;

  while (
    currentPath != null &&
    currentPath.node !== functionPath?.node &&
    currentPath.node.type !== 'Program'
  ) {
    if (awaitRestrictedNodeTypes.has(currentPath.node.type)) {
      return currentPath.node.type;
    }

    currentPath = currentPath.parent;
  }

  return undefined;
}

function getUnsupportedFunctionKind(functionPath: ASTPath<FunctionNode>) {
  const kind = 'kind' in functionPath.node ? functionPath.node.kind : undefined;

  return kind === 'constructor' || kind === 'get' || kind === 'set'
    ? kind
    : undefined;
}

export function addAwaitFn(functionName: string) {
  return createTransformer((fileInfo, api, options, context) => {
    const { j, root } = context;

    // Find import of the specified function from 'ai'
    const functionImportNames = new Set<string>();

    root
      .find(j.ImportDeclaration)
      .filter(path => path.node.source.value === 'ai')
      .forEach(path => {
        path.node.specifiers?.forEach(specifier => {
          if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.name === functionName
          ) {
            // Add local name to the set (handle aliasing)
            const localName = specifier.local?.name || specifier.imported.name;
            functionImportNames.add(localName);
          }
        });
      });

    if (functionImportNames.size > 0) {
      // Add 'await' before calls to the specified function (if not already awaited)
      root
        .find(j.CallExpression)
        .filter(path => {
          const callee = path.node.callee;
          if (callee.type === 'Identifier') {
            return functionImportNames.has(callee.name);
          }
          return false;
        })
        .filter(path => {
          // Check if already wrapped in AwaitExpression
          const parent = path.parent;
          return parent.node.type !== 'AwaitExpression';
        })
        .forEach(path => {
          const functionPath = findEnclosingFunction(path, context);
          const restrictedAncestor = findAwaitRestrictedAncestor(
            path,
            functionPath,
          );
          const unsupportedFunctionKind =
            functionPath == null
              ? undefined
              : getUnsupportedFunctionKind(functionPath);

          let unsupportedContext: string | undefined;

          if (restrictedAncestor != null) {
            unsupportedContext = restrictedAncestor;
          } else if (
            functionPath != null &&
            !isWithinFunctionBody(path, functionPath)
          ) {
            unsupportedContext = 'function parameter';
          } else if (unsupportedFunctionKind != null) {
            unsupportedContext = `${unsupportedFunctionKind} method`;
          }

          if (unsupportedContext != null) {
            const line = path.node.loc?.start.line;
            context.messages.push(
              `Could not add await to ${functionName} in ${fileInfo.path}${
                line == null ? '' : `:${line}`
              } because it is used in a ${unsupportedContext}. Migrate this call manually.`,
            );
            return;
          }

          if (functionPath != null) {
            functionPath.node.async = true;
          }

          context.hasChanges = true;
          j(path).replaceWith(j.awaitExpression(path.node));
        });
    }
  });
}
