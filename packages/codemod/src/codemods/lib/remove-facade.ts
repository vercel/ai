import { createTransformer } from './create-transformer';

interface FacadeConfig {
  packageName: string; // e.g. 'openai'
  className: string; // e.g. 'OpenAI'
  createFnName: string; // e.g. 'createOpenAI'
}

export function removeFacade(config: FacadeConfig) {
  return createTransformer((fileInfo, api, options, context) => {
    const { j, root } = context;
    const importPath = `@ai-sdk/${config.packageName}`;

    // Track facade imports and the factory binding that replaces them.
    const targetImports = new Map<string, string>();
    let factoryLocalName: string | undefined;

    // First pass - reuse an existing factory import when possible.
    root
      .find(j.ImportDeclaration)
      .filter(path => path.node.source.value === importPath)
      .forEach(path => {
        path.node.specifiers?.forEach(spec => {
          if (
            spec.type === 'ImportSpecifier' &&
            spec.imported.name === config.createFnName
          ) {
            factoryLocalName ??= spec.local?.name ?? config.createFnName;
          }
        });
      });

    // Second pass - collect facade bindings and replace only their specifiers.
    let hasFactoryImport = factoryLocalName != null;
    root
      .find(j.ImportDeclaration)
      .filter(path => path.node.source.value === importPath)
      .forEach(path => {
        const specifiers = path.node.specifiers ?? [];
        const facadeSpecifiers = specifiers.filter(
          spec =>
            spec.type === 'ImportSpecifier' &&
            spec.imported.name === config.className,
        );

        if (facadeSpecifiers.length > 0) {
          context.hasChanges = true;

          for (const specifier of facadeSpecifiers) {
            targetImports.set(
              specifier.local?.name ?? config.className,
              factoryLocalName ?? config.createFnName,
            );
          }

          path.node.specifiers = specifiers.flatMap(specifier => {
            if (
              specifier.type !== 'ImportSpecifier' ||
              specifier.imported.name !== config.className
            ) {
              return [specifier];
            }

            if (hasFactoryImport) {
              return [];
            }

            hasFactoryImport = true;
            factoryLocalName = config.createFnName;
            return [j.importSpecifier(j.identifier(config.createFnName))];
          });
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
        const callee = path.node.callee;
        if (callee.type !== 'Identifier') {
          return;
        }

        context.hasChanges = true;
        j(path).replaceWith(
          j.callExpression(
            j.identifier(targetImports.get(callee.name)!),
            path.node.arguments,
          ),
        );
      });
  });
}
