import { API, FileInfo, JSCodeshift } from 'jscodeshift';

interface FacadeConfig {
  packageName: string; // e.g. 'openai'
  className: string; // e.g. 'OpenAI'
  createFnName: string; // e.g. 'createOpenAI'
}

export function removeFacade(
  fileInfo: FileInfo,
  api: API,
  config: FacadeConfig,
) {
  const j: JSCodeshift = api.jscodeshift;
  const root = j(fileInfo.source);
  const importPath = `@ai-sdk/${config.packageName}`;

  // Track which imports came from our target package
  const targetImports = new Set<string>();

  // First pass - collect imports from our target package
  root
    .find(j.ImportDeclaration)
    .filter(path => path.node.source.value === importPath)
    .forEach(path => {
      path.node.specifiers?.forEach(spec => {
        if (
          spec.type === 'ImportSpecifier' &&
          spec.imported.name === config.className &&
          spec.local
        ) {
          targetImports.add(spec.local.name);
        }
      });
    });

  // Second pass - replace imports we found
  root
    .find(j.ImportDeclaration)
    .filter(path => path.node.source.value === importPath)
    .forEach(path => {
      const hasClassSpecifier = path.node.specifiers?.some(
        spec =>
          spec.type === 'ImportSpecifier' &&
          spec.imported.name === config.className,
      );

      if (hasClassSpecifier) {
        path.node.specifiers = [
          j.importSpecifier(j.identifier(config.createFnName)),
        ];
      }
    });

  // Only replace new expressions for classes from our package
  root
    .find(j.NewExpression)
    .filter(
      path =>
        path.node.callee.type === 'Identifier' &&
        targetImports.has(path.node.callee.name),
    )
    .forEach(path => {
      j(path).replaceWith(
        j.callExpression(
          j.identifier(config.createFnName),
          path.node.arguments,
        ),
      );
    });

  return root.toSource();
}
