import { createTransformer } from '../lib/create-transformer';
import {
  AI_SDK_CODEMOD_ERROR_PREFIX,
  insertCommentOnce,
} from '../lib/add-comment';
import type { ASTPath } from 'jscodeshift';

function isStatementOrVarDecl(node: { type: string }) {
  return (
    typeof node.type === 'string' &&
    (node.type.endsWith('Statement') || node.type === 'VariableDeclaration')
  );
}

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  function processMatch(path: ASTPath<any>, message: string) {
    // add message to context for logging
    context.messages.push(
      `Tool invocations migration needed in ${fileInfo.path}: ${message}`
    );

    // find the parent statement
    let statementPath = path;
    while (statementPath && statementPath.parent) {
      if (isStatementOrVarDecl(statementPath.parent.node)) {
        statementPath = statementPath.parent;
        break;
      }
      statementPath = statementPath.parent;
    }

    // determine the target node for the comment
    const targetNode =
      statementPath && isStatementOrVarDecl(statementPath.node)
        ? statementPath.node
        : path.node;

    // insert comment once to avoid duplicates
    const hasChanges = insertCommentOnce(
      targetNode,
      j,
      `${AI_SDK_CODEMOD_ERROR_PREFIX}${message}`
    );

    if (hasChanges) {
      context.hasChanges = true;
    }
  }

  // find all messages.push() calls that push tool invocations
  root
    .find(j.CallExpression, {
      callee: {
        type: 'MemberExpression',
        property: { name: 'push' },
      },
    })
    .forEach(path => {
      const callExp = path.node;

      // check if this is messages.push()
      if (
        callExp.callee.type === 'MemberExpression' &&
        callExp.callee.object.type === 'Identifier' &&
        callExp.callee.object.name === 'messages'
      ) {
        // check if pushing a tool message
        const arg = callExp.arguments[0];
        if (
          arg &&
          arg.type === 'ObjectExpression' &&
          arg.properties.some(
            prop =>
              prop.type === 'ObjectProperty' &&
              prop.key.type === 'Identifier' &&
              prop.key.name === 'role' &&
              prop.value.type === 'StringLiteral' &&
              prop.value.value === 'tool'
          )
        ) {
          processMatch(
            path,
            'Tool invocations should now be handled as parts in the message stream, not pushed as separate messages. Review the streaming documentation for the new pattern.'
          );
        }
      }
    });

  // find patterns where tool results are being logged or added to messages
  root
    .find(j.VariableDeclarator, {
      id: { type: 'Identifier' },
      init: {
        type: 'ObjectExpression',
      },
    })
    .forEach(path => {
      const init = path.node.init;
      if (init && init.type === 'ObjectExpression') {
        const hasRole = init.properties.some(
          prop =>
            prop.type === 'ObjectProperty' &&
            prop.key.type === 'Identifier' &&
            prop.key.name === 'role' &&
            prop.value.type === 'StringLiteral' &&
            prop.value.value === 'tool'
        );

        if (hasRole) {
          processMatch(
            path,
            'Tool role messages are now handled as parts. Update to use the new streaming pattern.'
          );
        }
      }
    });

  // look for assistant messages with toolInvocations
  root
    .find(j.ObjectExpression)
    .forEach(path => {
      const hasAssistantRole = path.node.properties.some(
        prop =>
          prop.type === 'ObjectProperty' &&
          prop.key.type === 'Identifier' &&
          prop.key.name === 'role' &&
          prop.value.type === 'StringLiteral' &&
          prop.value.value === 'assistant'
      );

      const hasToolInvocations = path.node.properties.some(
        prop =>
          prop.type === 'ObjectProperty' &&
          prop.key.type === 'Identifier' &&
          prop.key.name === 'toolInvocations'
      );

      if (hasAssistantRole && hasToolInvocations) {
        processMatch(
          path,
          'toolInvocations in assistant messages are now streamed as parts. Update to handle tool-call parts in the stream.'
        );
      }
    });
});