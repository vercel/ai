import { createTransformer } from '../lib/create-transformer';

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  // Track all useChat import names (including aliases)
  const useChatNames = new Set<string>();
  let hasDefaultChatTransportValueImport = false;
  let defaultChatTransportExpression: any;

  root
    .find(j.ImportDeclaration, {
      source: { value: 'ai' },
    })
    .forEach(path => {
      if (
        hasDefaultChatTransportValueImport ||
        path.node.importKind === 'type'
      ) {
        return;
      }

      path.node.specifiers?.forEach(specifier => {
        if (
          specifier.type === 'ImportSpecifier' &&
          (specifier as any).importKind !== 'type' &&
          specifier.imported.type === 'Identifier' &&
          specifier.imported.name === 'DefaultChatTransport'
        ) {
          defaultChatTransportExpression = j.identifier(
            specifier.local?.name ?? 'DefaultChatTransport',
          );
          hasDefaultChatTransportValueImport = true;
        } else if (specifier.type === 'ImportNamespaceSpecifier') {
          defaultChatTransportExpression = j.memberExpression(
            j.identifier(specifier.local?.name ?? 'ai'),
            j.identifier('DefaultChatTransport'),
          );
          hasDefaultChatTransportValueImport = true;
        }
      });
    });

  let defaultChatTransportLocalName = 'DefaultChatTransport';

  if (!hasDefaultChatTransportValueImport) {
    const programScope = root.find(j.Program).paths()[0].scope;
    let suffix = 1;

    while (programScope.declares(defaultChatTransportLocalName)) {
      defaultChatTransportLocalName = `DefaultChatTransportValue${
        suffix === 1 ? '' : suffix
      }`;
      suffix++;
    }

    defaultChatTransportExpression = j.identifier(
      defaultChatTransportLocalName,
    );
  }

  // Replace old import path with new one and collect useChat import names
  root
    .find(j.ImportDeclaration, {
      source: { value: 'ai/react' },
    })
    .forEach(path => {
      const importDeclaration = path.node;
      importDeclaration.source.value = '@ai-sdk/react';

      // Collect useChat import names
      importDeclaration.specifiers?.forEach(spec => {
        if (
          spec.type === 'ImportSpecifier' &&
          spec.imported.type === 'Identifier' &&
          spec.imported.name === 'useChat'
        ) {
          useChatNames.add(spec.local?.name || 'useChat');
        }
      });

      context.hasChanges = true;
    });

  // Also collect useChat names from existing @ai-sdk/react imports
  root
    .find(j.ImportDeclaration, {
      source: { value: '@ai-sdk/react' },
    })
    .forEach(path => {
      const importDeclaration = path.node;

      // Collect useChat import names
      importDeclaration.specifiers?.forEach(spec => {
        if (
          spec.type === 'ImportSpecifier' &&
          spec.imported.type === 'Identifier' &&
          spec.imported.name === 'useChat'
        ) {
          useChatNames.add(spec.local?.name || 'useChat');
        }
      });
    });

  let needsDefaultChatTransportImport = false;

  root
    .find(j.CallExpression)
    .filter(path => {
      return (
        path.node.callee.type === 'Identifier' &&
        useChatNames.has(path.node.callee.name)
      );
    })
    .forEach(path => {
      const args = path.node.arguments;
      if (args.length === 0) return;

      const firstArg = args[0];
      if (firstArg.type !== 'ObjectExpression') return;

      const apiProperty = firstArg.properties.find(
        (prop: any) =>
          (prop.type === 'Property' || prop.type === 'ObjectProperty') &&
          prop.key.type === 'Identifier' &&
          prop.key.name === 'api',
      );

      if (!apiProperty) return;

      needsDefaultChatTransportImport = true;
      context.hasChanges = true;

      const newProperties = firstArg.properties.filter(
        (prop: any) => prop !== apiProperty,
      );

      const transportProperty = j.property(
        'init',
        j.identifier('transport'),
        j.newExpression(defaultChatTransportExpression, [
          j.objectExpression([
            j.property('init', j.identifier('api'), (apiProperty as any).value),
          ]),
        ]),
      );

      newProperties.push(transportProperty);
      firstArg.properties = newProperties;
    });

  if (needsDefaultChatTransportImport && !hasDefaultChatTransportValueImport) {
    const defaultChatTransportImport = j.importSpecifier(
      j.identifier('DefaultChatTransport'),
      defaultChatTransportLocalName === 'DefaultChatTransport'
        ? null
        : j.identifier(defaultChatTransportLocalName),
    );
    const aiImports = root.find(j.ImportDeclaration, {
      source: { value: 'ai' },
    });
    const compatibleAiImports = aiImports.filter(
      path =>
        path.node.importKind !== 'type' &&
        !path.node.specifiers?.some(
          specifier => specifier.type === 'ImportNamespaceSpecifier',
        ),
    );

    if (compatibleAiImports.length > 0) {
      const firstAiImport = compatibleAiImports.at(0);
      const specifiers = firstAiImport.get().node.specifiers || [];
      specifiers.push(defaultChatTransportImport);
      firstAiImport.get().node.specifiers = specifiers;
    } else {
      const imports = root.find(j.ImportDeclaration);
      const importDeclaration = j.importDeclaration(
        [defaultChatTransportImport],
        j.literal('ai'),
      );

      if (imports.length > 0) {
        imports.at(0).insertAfter(importDeclaration);
      } else {
        root.get().node.program.body.unshift(importDeclaration);
      }
    }
  }
});
