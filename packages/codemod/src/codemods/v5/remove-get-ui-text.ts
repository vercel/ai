import type { JSCodeshift } from 'jscodeshift';
import { createTransformer } from '../lib/create-transformer';

type ExpressionKind = Parameters<JSCodeshift['awaitExpression']>[0];

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  // Track aliases for getUIText
  const aliases = new Set<string>();
  aliases.add('getUIText'); // Include the original name

  // Extract leading comments from the original source
  const originalLines = fileInfo.source.split('\n');
  const leadingComments: string[] = [];
  for (const line of originalLines) {
    const trimmedLine = line.trim();
    if (
      trimmedLine.startsWith('//') ||
      trimmedLine.startsWith('/*') ||
      trimmedLine === ''
    ) {
      leadingComments.push(line);
    } else {
      break; // Stop at the first non-comment, non-empty line
    }
  }

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
          // Remove entire import if no specifiers left
          j(path).remove();
        } else {
          // Update with filtered specifiers
          path.node.specifiers = filteredSpecifiers;
        }
      }
    });

  // Builds `parts.map(part => (part.type === 'text' ? part.text : '')).join('')`
  const createUITextExpression = (parts: ExpressionKind) =>
    j.callExpression(
      j.memberExpression(
        j.callExpression(j.memberExpression(parts, j.identifier('map')), [
          j.arrowFunctionExpression(
            [j.identifier('part')],
            j.conditionalExpression(
              j.binaryExpression(
                '===',
                j.memberExpression(j.identifier('part'), j.identifier('type')),
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

  // Replace direct calls: getUIText(parts) → parts.map(...).join('')
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

      j(path).replaceWith(createUITextExpression(argument));
      context.hasChanges = true;
    });

  // Replace the remaining references, e.g. `messages.map(getUIText)` or
  // `const toText = getUIText`, with an equivalent inline function so that no
  // identifier is left unbound once the import is gone.
  root
    .find(j.Identifier)
    .filter(path => {
      if (!aliases.has(path.node.name)) {
        return false;
      }

      const parent = path.parent?.node;
      if (!parent) {
        return false;
      }

      // Non-computed member property: `obj.getUIText`
      if (
        (parent.type === 'MemberExpression' ||
          parent.type === 'OptionalMemberExpression') &&
        parent.property === path.node &&
        !parent.computed
      ) {
        return false;
      }

      // Object property key: `{ getUIText: value }` (shorthand handled below)
      if (
        (parent.type === 'Property' || parent.type === 'ObjectProperty') &&
        parent.key === path.node &&
        !parent.computed &&
        !parent.shorthand
      ) {
        return false;
      }

      // Import / export specifiers and declarations are not references
      if (
        parent.type === 'ImportSpecifier' ||
        parent.type === 'ImportDefaultSpecifier' ||
        parent.type === 'ImportNamespaceSpecifier' ||
        parent.type === 'ExportSpecifier' ||
        parent.type === 'VariableDeclarator' ||
        parent.type === 'FunctionDeclaration' ||
        parent.type === 'ClassDeclaration'
      ) {
        return (
          parent.type === 'VariableDeclarator' && parent.init === path.node
        );
      }

      return true;
    })
    .forEach(path => {
      const parent = path.parent?.node;
      const replacement = j.arrowFunctionExpression(
        [j.identifier('parts')],
        createUITextExpression(j.identifier('parts')),
      );

      if (
        (parent.type === 'Property' || parent.type === 'ObjectProperty') &&
        parent.shorthand
      ) {
        // `{ getUIText }` → `{ getUIText: parts => ... }`
        parent.shorthand = false;
        parent.value = replacement;
      } else {
        j(path).replaceWith(replacement);
      }

      context.hasChanges = true;
    });

  // Handle comment preservation if changes were made
  if (context.hasChanges && leadingComments.length > 0) {
    // Get the transformed source
    const transformedSource = root.toSource({ quote: 'single' });
    const transformedLines = transformedSource.split('\n');

    // Check if the transformed source starts with the same comments
    let needsCommentRestoration = false;
    for (let i = 0; i < leadingComments.length; i++) {
      if (
        i >= transformedLines.length ||
        leadingComments[i] !== transformedLines[i]
      ) {
        needsCommentRestoration = true;
        break;
      }
    }

    if (needsCommentRestoration) {
      // Find the first non-comment line in the transformed source
      let firstCodeLineIndex = 0;
      for (let i = 0; i < transformedLines.length; i++) {
        const trimmedLine = transformedLines[i].trim();
        if (
          trimmedLine !== '' &&
          !trimmedLine.startsWith('//') &&
          !trimmedLine.startsWith('/*')
        ) {
          firstCodeLineIndex = i;
          break;
        }
      }

      // Rebuild the source with preserved comments
      const preservedComments = leadingComments.join('\n');
      const codeWithoutLeadingComments = transformedLines
        .slice(firstCodeLineIndex)
        .join('\n');

      // Determine spacing between comments and code
      let spacingAfterComments = '';
      const lastCommentIndex = leadingComments.length - 1;
      if (
        lastCommentIndex >= 0 &&
        leadingComments[lastCommentIndex].trim() === ''
      ) {
        // If the last leading comment line is empty, preserve that spacing
        spacingAfterComments = '\n';
      } else {
        // Otherwise add a single newline to separate comments from code
        spacingAfterComments = '\n';
      }

      // Override the default transformation result by directly returning the preserved version
      const preservedResult = `${preservedComments}${spacingAfterComments}${codeWithoutLeadingComments}`;

      // We need to manually handle the return since createTransformer expects us to modify context.hasChanges
      // but we want to return a custom result. We'll modify the root to contain our preserved content.
      const preservedAST = j(preservedResult);
      context.root
        .find(j.Program)
        .replaceWith(preservedAST.find(j.Program).get().node);
    }
  }
});
