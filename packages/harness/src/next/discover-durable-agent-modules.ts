import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { parse } from '@babel/parser';

/**
 * Modules a `HarnessAgent` can be imported from.
 */
const HARNESS_AGENT_MODULES = new Set([
  '@ai-sdk/harness',
  '@ai-sdk/harness/agent',
]);

/**
 * Extensions of the source files that are searched.
 */
const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]);

/**
 * Directories that are not searched, in addition to every directory whose
 * name starts with `.` (such as `.next` and `.git`).
 */
const IGNORED_DIRECTORIES = new Set(['node_modules', 'dist', 'out', 'build']);

/**
 * Node types whose bodies run later than the module, so a `HarnessAgent`
 * created in them is not created at module scope.
 */
const DEFERRED_NODE_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'ObjectMethod',
  'ClassMethod',
  'ClassPrivateMethod',
]);

type AstNode = { type: string; [key: string]: unknown };

function isAstNode(value: unknown): value is AstNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  );
}

/**
 * Finds the modules of a project that create a `HarnessAgent` at module
 * scope and export it: an exported, module-scope `new HarnessAgent(...)`
 * call, with `HarnessAgent` imported from `@ai-sdk/harness` or
 * `@ai-sdk/harness/agent`. Source files are parsed with Babel, never run.
 *
 * A module is matched without knowing whether its agent is given a `world`,
 * so modules of agents that are not durable are matched too. That is
 * harmless: only durable agents register in the durable agent registry.
 *
 * Returns absolute file paths, sorted.
 */
export function discoverDurableHarnessAgentModules(options: {
  projectDir: string;
}): string[] {
  const modules: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (
          !entry.name.startsWith('.') &&
          !IGNORED_DIRECTORIES.has(entry.name)
        ) {
          visit(path);
        }
        continue;
      }
      if (
        !entry.isFile() ||
        !SOURCE_EXTENSIONS.has(extname(entry.name)) ||
        entry.name.endsWith('.d.ts')
      ) {
        continue;
      }
      const code = readFileSync(path, 'utf8');
      if (!code.includes('HarnessAgent') || !code.includes('@ai-sdk/harness')) {
        continue;
      }
      if (exportsHarnessAgent({ code, file: path })) modules.push(path);
    }
  };
  visit(options.projectDir);
  return modules.sort();
}

/**
 * Returns whether the module's code exports a `HarnessAgent` created at
 * module scope. Returns `false` for code that does not parse.
 */
export function exportsHarnessAgent(options: {
  code: string;
  file: string;
}): boolean {
  const extension = extname(options.file);
  let program: { body: AstNode[] };
  try {
    program = parse(options.code, {
      sourceType: 'module',
      plugins:
        extension === '.ts' || extension === '.mts' || extension === '.cts'
          ? ['typescript']
          : ['typescript', 'jsx'],
    }).program as unknown as { body: AstNode[] };
  } catch {
    return false;
  }

  const classNames = new Set<string>();
  const namespaceNames = new Set<string>();
  for (const statement of program.body) {
    if (
      statement.type !== 'ImportDeclaration' ||
      statement.importKind === 'type' ||
      !HARNESS_AGENT_MODULES.has((statement.source as { value: string }).value)
    ) {
      continue;
    }
    for (const specifier of statement.specifiers as AstNode[]) {
      const local = (specifier.local as { name: string }).name;
      if (specifier.type === 'ImportNamespaceSpecifier') {
        namespaceNames.add(local);
      } else if (
        specifier.type === 'ImportSpecifier' &&
        specifier.importKind !== 'type' &&
        getName(specifier.imported) === 'HarnessAgent'
      ) {
        classNames.add(local);
      }
    }
  }
  if (classNames.size === 0 && namespaceNames.size === 0) return false;

  const createsAgent = (node: unknown): boolean => {
    if (Array.isArray(node)) return node.some(createsAgent);
    if (!isAstNode(node) || DEFERRED_NODE_TYPES.has(node.type)) return false;
    if (node.type === 'NewExpression' && isHarnessAgentCallee(node.callee)) {
      return true;
    }
    return Object.entries(node).some(
      ([key, value]) =>
        key !== 'loc' &&
        key !== 'leadingComments' &&
        key !== 'trailingComments' &&
        key !== 'innerComments' &&
        typeof value === 'object' &&
        value !== null &&
        createsAgent(value),
    );
  };
  const isHarnessAgentCallee = (callee: unknown): boolean => {
    if (!isAstNode(callee)) return false;
    if (callee.type === 'Identifier') {
      return classNames.has(callee.name as string);
    }
    return (
      callee.type === 'MemberExpression' &&
      isAstNode(callee.object) &&
      callee.object.type === 'Identifier' &&
      namespaceNames.has(callee.object.name as string) &&
      getName(callee.property) === 'HarnessAgent'
    );
  };

  const agentBindings = new Set<string>();
  for (const statement of program.body) {
    if (statement.type === 'ExportDefaultDeclaration') {
      if (createsAgent(statement.declaration)) return true;
      continue;
    }
    if (statement.type === 'ExportNamedDeclaration') {
      if (createsAgent(statement.declaration)) return true;
      continue;
    }
    if (statement.type === 'VariableDeclaration') {
      for (const declarator of statement.declarations as AstNode[]) {
        const name = getName(declarator.id);
        if (name != null && createsAgent(declarator.init)) {
          agentBindings.add(name);
        }
      }
    }
  }
  if (agentBindings.size === 0) return false;

  return program.body.some(statement => {
    if (statement.type === 'ExportDefaultDeclaration') {
      return agentBindings.has(getName(statement.declaration) ?? '');
    }
    return (
      statement.type === 'ExportNamedDeclaration' &&
      statement.source == null &&
      (statement.specifiers as AstNode[]).some(specifier =>
        agentBindings.has(getName(specifier.local) ?? ''),
      )
    );
  });
}

/**
 * Name of an identifier or string literal node.
 */
function getName(node: unknown): string | undefined {
  if (!isAstNode(node)) return undefined;
  if (node.type === 'Identifier') return node.name as string;
  if (node.type === 'StringLiteral') return node.value as string;
  return undefined;
}
