import { API, FileInfo, JSCodeshift } from 'jscodeshift';

interface FacadeConfig {
  packageName: string; // e.g. 'openai'
  className: string; // e.g. 'OpenAI'
  createFnName: string; // e.g. 'createOpenAI'
  methodNames: string[]; // e.g. ['chat', 'completion']
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

  // Replace method calls
  root.find(j.CallExpression).forEach(path => {
    if (
      path.node.callee.type === 'MemberExpression' &&
      path.node.callee.object.type === 'Identifier' &&
      path.node.callee.property.type === 'Identifier' &&
      config.methodNames.includes(path.node.callee.property.name)
    ) {
      const providerVar = path.node.callee.object.name;
      j(path).replaceWith(
        j.callExpression(j.identifier(providerVar), path.node.arguments),
      );
    }
  });

  return root.toSource({ quote: 'single' });
}
