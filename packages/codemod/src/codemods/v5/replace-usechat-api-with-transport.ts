import { createTransformer } from '../lib/create-transformer';

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  let needsDefaultChatTransportImport = false;

  root
    .find(j.CallExpression, { callee: { name: 'useChat' } })
    .forEach(path => {
      const args = path.node.arguments;
      if (args.length === 0) return;

      const firstArg = args[0];
      if (firstArg.type !== 'ObjectExpression') return;

      const apiProperty = firstArg.properties.find(
        (prop: any) =>
          (prop.type === 'Property' || prop.type === 'ObjectProperty') &&
          prop.key.type === 'Identifier' &&
          prop.key.name === 'api'
      );

      if (!apiProperty) return;

      needsDefaultChatTransportImport = true;
      context.hasChanges = true;

      const newProperties = firstArg.properties.filter(
        (prop: any) => prop !== apiProperty
      );

      const transportProperty = j.property(
        'init',
        j.identifier('transport'),
        j.newExpression(
          j.identifier('DefaultChatTransport'),
          [j.objectExpression([
            j.property(
              'init',
              j.identifier('api'),
              (apiProperty as any).value
            )
          ])]
        )
      );

      newProperties.push(transportProperty);
      firstArg.properties = newProperties;
    });

  if (needsDefaultChatTransportImport) {
    const reactImports = root.find(j.ImportDeclaration, {
      source: { value: '@ai-sdk/react' }
    });

    const aiImports = root.find(j.ImportDeclaration, {
      source: { value: 'ai' }
    });

    if (reactImports.length > 0) {
      const firstReactImport = reactImports.at(0);
      const specifiers = firstReactImport.get().node.specifiers || [];

      const hasDefaultChatTransport = specifiers.some(
        (spec: any) =>
          spec.type === 'ImportSpecifier' &&
          spec.imported.type === 'Identifier' &&
          spec.imported.name === 'DefaultChatTransport'
      );

      if (!hasDefaultChatTransport) {
        specifiers.push(
          j.importSpecifier(j.identifier('DefaultChatTransport'))
        );
      }
    } else if (aiImports.length > 0) {
      const firstAiImport = aiImports.at(0);
      const specifiers = firstAiImport.get().node.specifiers || [];

      const hasDefaultChatTransport = specifiers.some(
        (spec: any) =>
          spec.type === 'ImportSpecifier' &&
          spec.imported.type === 'Identifier' &&
          spec.imported.name === 'DefaultChatTransport'
      );

      if (!hasDefaultChatTransport) {
        specifiers.push(
          j.importSpecifier(j.identifier('DefaultChatTransport'))
        );
      }
    } else {
      const imports = root.find(j.ImportDeclaration);
      if (imports.length > 0) {
        imports.at(0).insertAfter(
          j.importDeclaration(
            [j.importSpecifier(j.identifier('DefaultChatTransport'))],
            j.literal('@ai-sdk/react')
          )
        );
      } else {
        root
          .find(j.Program)
          .at(0)
          .get('body', 0)
          .insertBefore(
            j.importDeclaration(
              [j.importSpecifier(j.identifier('DefaultChatTransport'))],
              j.literal('@ai-sdk/react')
            )
          );
      }
    }
  }
});