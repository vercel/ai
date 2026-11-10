import { isMemberAccess } from '../ast-utils.mjs';

/**
 * Disallows mutating `process.env` directly: assigning to it or to one of its
 * keys, deleting keys, or merging into it with `Object.assign()`. Process-global
 * writes can leak across tests and concurrent code. Environment values should
 * be read into configuration, and child processes should receive an explicit
 * `env` object.
 *
 * Files ending in `.test.ts` are exempt, since tests commonly stub environment
 * variables.
 */

const testFilePattern = /\.test\.ts$/;

function isProcessEnv(node) {
  return isMemberAccess({ node, objectName: 'process', propertyName: 'env' });
}

function isProcessEnvOrKey(node) {
  return (
    isProcessEnv(node) ||
    (node.type === 'MemberExpression' && isProcessEnv(node.object))
  );
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow mutating `process.env` directly.',
    },
    messages: {
      processEnvMutation:
        'Avoid mutating `process.env` directly. Read environment values into configuration and pass an explicit `env` object to child processes; process-global writes can leak across tests and concurrent code.',
    },
  },
  create(context) {
    if (testFilePattern.test(context.filename)) {
      return {};
    }

    return {
      AssignmentExpression(node) {
        if (isProcessEnvOrKey(node.left)) {
          context.report({ node, messageId: 'processEnvMutation' });
        }
      },
      UnaryExpression(node) {
        if (
          node.operator === 'delete' &&
          node.argument.type === 'MemberExpression' &&
          isProcessEnv(node.argument.object)
        ) {
          context.report({ node, messageId: 'processEnvMutation' });
        }
      },
      CallExpression(node) {
        if (
          isMemberAccess({
            node: node.callee,
            objectName: 'Object',
            propertyName: 'assign',
          }) &&
          node.arguments[0] != null &&
          isProcessEnv(node.arguments[0])
        ) {
          context.report({ node, messageId: 'processEnvMutation' });
        }
      },
    };
  },
};
