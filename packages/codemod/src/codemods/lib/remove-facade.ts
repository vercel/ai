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

  // Replace imports
  root.find(j.ImportDeclaration).forEach(path => {
    const sourceValue = path.node.source.value;
    if (sourceValue === importPath) {
      const hasClassSpecifier = path.node.specifiers?.some(
        spec =>
          spec.type === 'ImportSpecifier' &&
          spec.imported.name === config.className,
      );

      if (hasClassSpecifier) {
        path.node.source.value = importPath;
        path.node.specifiers = [
          j.importSpecifier(j.identifier(config.createFnName)),
        ];
      }
    }
  });

  // Replace new Class() with createFn()
  root.find(j.NewExpression).forEach(path => {
    if (
      path.node.callee.type === 'Identifier' &&
      path.node.callee.name === config.className
    ) {
      j(path).replaceWith(
        j.callExpression(
          j.identifier(config.createFnName),
          path.node.arguments,
        ),
      );
    }
  });

  return root.toSource();
}
