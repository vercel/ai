import { API, FileInfo } from 'jscodeshift';

export function removeAwaitFn(file: FileInfo, api: API, functionName: string) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let hasChanges = false;

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
          return functionImportNames.has(argument.callee.name);
        }
        return false;
      })
      .forEach(path => {
        hasChanges = true;
        j(path).replaceWith(path.node.argument);
      });
  }

  return hasChanges ? root.toSource() : null;
}
