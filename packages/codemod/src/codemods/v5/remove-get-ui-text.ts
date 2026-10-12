import { createTransformer } from '../lib/create-transformer';

export default createTransformer((_fileInfo, _api, _options, context) => {
  const { j, root } = context;

  // Track aliases for getUIText
  const aliases = new Set<string>();
  aliases.add('getUIText'); // Include the original name

  // Remove getUIText from import statements and track aliases
  root
    .find(j.ImportDeclaration)
    .filter(path => {
      return (
        path.node.source.type === 'StringLiteral' &&
        path.node.source.value === 'ai'
      );
    })
    .forEach(path => {
      if (path.node.specifiers) {
        const filteredSpecifiers = path.node.specifiers.filter(specifier => {
          if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.type === 'Identifier' &&
            specifier.imported.name === 'getUIText'
          ) {
            // Track the local name (alias) if it exists
            const localName = specifier.local?.name || 'getUIText';
            aliases.add(localName);

            context.hasChanges = true;
            return false; // Remove this specifier
          }
          return true; // Keep other specifiers
        });

        if (filteredSpecifiers.length === 0) {
          const program = path.parent.node;
          const importIndex = program.body.indexOf(path.node);
          const commentTarget = program.body[importIndex + 1] ?? program;

          commentTarget.comments = [
            ...(path.node.comments ?? []),
            ...(commentTarget.comments ?? []),
          ];

          // Remove entire import if no specifiers left
          j(path).remove();
        } else {
          // Update with filtered specifiers
          path.node.specifiers = filteredSpecifiers;
        }
      }
    });

  // Replace function calls for getUIText and its aliases
  root
    .find(j.CallExpression)
    .filter(path => {
      return (
        path.node.callee.type === 'Identifier' &&
        aliases.has(path.node.callee.name) &&
        path.node.arguments.length === 1
      );
    })
    .forEach(path => {
      const argument = path.node.arguments[0];

      // Ensure argument is an expression (not a spread element)
      if (argument.type === 'SpreadElement') {
        return; // Skip spread elements
      }

      // Create the replacement: argument.map(part => (part.type === 'text' ? part.text : '')).join('')
      const replacement = j.callExpression(
        j.memberExpression(
          j.callExpression(j.memberExpression(argument, j.identifier('map')), [
            j.arrowFunctionExpression(
              [j.identifier('part')],
              j.conditionalExpression(
                j.binaryExpression(
                  '===',
                  j.memberExpression(
                    j.identifier('part'),
                    j.identifier('type'),
                  ),
                  j.stringLiteral('text'),
                ),
                j.memberExpression(j.identifier('part'), j.identifier('text')),
                j.stringLiteral(''),
              ),
            ),
          ]),
          j.identifier('join'),
        ),
        [j.stringLiteral('')],
      );

      j(path).replaceWith(replacement);
      context.hasChanges = true;
    });
});
