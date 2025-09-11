import { createTransformer } from '../lib/create-transformer';
import {
  AI_SDK_CODEMOD_ERROR_PREFIX,
  insertCommentOnce,
} from '../lib/add-comment';
import type { ASTPath } from 'jscodeshift';

function isStatementOrVarDecl(node: any): boolean {
  return (
    node.type === 'ExpressionStatement' ||
    node.type === 'VariableDeclaration' ||
    node.type === 'ReturnStatement' ||
    node.type === 'IfStatement' ||
    node.type === 'BlockStatement' ||
    node.type === 'TryStatement' ||
    node.type === 'ForStatement' ||
    node.type === 'WhileStatement' ||
    node.type === 'DoWhileStatement' ||
    node.type === 'SwitchStatement' ||
    node.type === 'WithStatement' ||
    node.type === 'ThrowStatement'
  );
}

export default createTransformer((fileInfo, api, options, context) => {
  const { j, root } = context;

  function processMatch(path: ASTPath<any>, message: string) {
    context.messages.push(
      `toDataStreamResponse/toUIMessageStreamResponse removal needed in ${fileInfo.path}: ${message}`
    );
    let statementPath = path;
    while (statementPath && statementPath.parent) {
      if (isStatementOrVarDecl(statementPath.parent.node)) {
        statementPath = statementPath.parent;
        break;
      }
      statementPath = statementPath.parent;
    }
    const targetNode =
      statementPath && isStatementOrVarDecl(statementPath.node)
        ? statementPath.node
        : path.node;
    const hasChanges = insertCommentOnce(
      targetNode,
      j,
      `${AI_SDK_CODEMOD_ERROR_PREFIX}${message}`
    );
    if (hasChanges) {
      context.hasChanges = true;
    }
  }

  // find toDataStreamResponse() method calls
  root
    .find(j.CallExpression)
    .filter(path => {
      return (
        path.node.callee.type === 'MemberExpression' &&
        path.node.callee.property.type === 'Identifier' &&
        path.node.callee.property.name === 'toDataStreamResponse'
      );
    })
    .forEach(path => {
      processMatch(
        path,
        `toDataStreamResponse has been removed. Use a two-step process instead:
Step 1: const stream = result.toUIMessageStream()
Step 2: return createUIMessageStreamResponse({ stream, ...options })
You'll need to import createUIMessageStreamResponse from 'ai'.`
      );
    });

  // find toUIMessageStreamResponse() method calls
  root
    .find(j.CallExpression)
    .filter(path => {
      return (
        path.node.callee.type === 'MemberExpression' &&
        path.node.callee.property.type === 'Identifier' &&
        path.node.callee.property.name === 'toUIMessageStreamResponse'
      );
    })
    .forEach(path => {
      processMatch(
        path,
        `toUIMessageStreamResponse has been removed. Use a two-step process instead:
Step 1: const stream = result.toUIMessageStream()
Step 2: return createUIMessageStreamResponse({ stream, ...options })
You'll need to import createUIMessageStreamResponse from 'ai'.`
      );
    });
});