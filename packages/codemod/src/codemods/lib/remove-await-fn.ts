import type { ASTPath } from 'jscodeshift';
import { createTransformer } from './create-transformer';

/**
 * Returns true when `name` is re-declared by a binding between `path` and the
 * module scope (a parameter, variable, function or class), i.e. when a call to
 * `name` at `path` would not resolve to the top-level import.
 */
function isShadowed(path: ASTPath<any>, name: string): boolean {
  let scope = path.scope;

  while (scope && !scope.isGlobal) {
    if (scope.declares(name)) {
      return true;
    }
    scope = scope.parent;
  }

  return false;
}

export function removeAwaitFn(functionName: string) {
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
      // Remove 'await' before calls to the specified function
      root
        .find(j.AwaitExpression)
        .filter(path => {
          const argument = path.node.argument;
          if (
            argument &&
            argument.type === 'CallExpression' &&
            argument.callee.type === 'Identifier'
          ) {
            const name = argument.callee.name;
            // Only touch calls that resolve to the SDK import. A parameter or
            // local declaration with the same name is an unrelated function.
            return functionImportNames.has(name) && !isShadowed(path, name);
          }
          return false;
        })
        .forEach(path => {
          context.hasChanges = true;
          j(path).replaceWith(path.node.argument);
        });
    }
  });
}
