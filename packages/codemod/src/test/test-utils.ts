import { API, FileInfo } from 'jscodeshift';
import jscodeshift from 'jscodeshift';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { parse, ParserPlugin } from '@babel/parser';

/**
 * Applies a codemod transform to the input code.
 *
 * @param transform - The codemod transform function.
 * @param input - The input source code.
 * @param options - Optional transform options.
 * @returns The transformed code or the original input if no changes were made.
 */
export function applyTransform(
  transform: (fileInfo: FileInfo, api: API, options: any) => string | null,
  input: string,
  options = {},
): string {
  const fileInfo = {
    path: 'test.tsx', // Use .tsx to support both .ts and .tsx
    source: input,
  };
  const j = jscodeshift.withParser('tsx');
  const api: API = {
    j,
    jscodeshift: j,
    stats: () => {},
    report: console.log,
  };
  // A null result indicates no changes were made.
  const result = transform(fileInfo, api, options);
  return result === null ? input : result;
}

/**
 * Reads a fixture file from the __testfixtures__ directory.
 *
 * @param name - The base name of the fixture.
 * @param type - The type of fixture ('input' or 'output').
 * @returns An object containing the fixture's content and its file extension.
 * @throws If the fixture file is not found.
 */
export function readFixture(
  name: string,
  type: 'input' | 'output',
): { content: string; extension: string } {
  const basePath = join(__dirname, '__testfixtures__', `${name}.${type}`);
  const extensions = ['.ts', '.tsx', '.js', '.jsx'];

  for (const ext of extensions) {
    const fullPath = `${basePath}${ext}`;
    if (existsSync(fullPath)) {
      return { content: readFileSync(fullPath, 'utf8'), extension: ext };
    }
  }
  throw new Error(
    `Fixture not found: ${name}.${type} with extensions ${extensions.join(
      ', ',
    )}`,
  );
}

/**
 * Determines the Babel parser plugins based on the file extension.
 *
 * @param extension - The file extension (e.g., '.ts', '.tsx', '.js', '.jsx').
 * @returns An array of Babel parser plugins.
 */
function getPluginsForExtension(extension: string): ParserPlugin[] {
  switch (extension) {
    case '.ts':
      return ['typescript'];
    case '.tsx':
      return ['typescript', 'jsx'];
    case '.jsx':
      return ['jsx'];
    case '.js':
      return []; // Add more plugins if needed
    default:
      return [];
  }
}

/**
 * Validates the syntax of the provided code using Babel's parser.
 *
 * @param code - The source code to validate.
 * @param extension - The file extension to determine parser plugins.
 * @throws If the code contains syntax errors.
 */
export function validateSyntax(code: string, extension: string): void {
  const plugins = getPluginsForExtension(extension);
  try {
    parse(code, {
      sourceType: 'module',
      plugins: plugins,
    });
  } catch (error: any) {
    throw new Error(
      `Syntax error in code with extension ${extension}: ${error.message}`,
    );
  }
}

/**
 * Tests a codemod transform by applying it to input fixtures and comparing the output to expected fixtures.
 * Additionally, validates that both input and output fixtures have valid syntax.
 *
 * @param transformer - The codemod transformer function.
 * @param fixtureName - The base name of the fixture to test.
 */
export function testTransform(
  transformer: (fileInfo: FileInfo, api: API, options: any) => string | null,
  fixtureName: string,
) {
  // Read input and output fixtures along with their extensions
  const { content: input, extension: inputExt } = readFixture(
    fixtureName,
    'input',
  );
  const { content: expectedOutput, extension: outputExt } = readFixture(
    fixtureName,
    'output',
  );

  // Validate that input code is syntactically correct
  validateSyntax(input, inputExt);

  // Apply the transformer to the input code
  const actualOutput = applyTransform(transformer, input);

  // Validate that output code is syntactically correct
  validateSyntax(actualOutput, outputExt);

  // Compare actual output to expected output
  expect(actualOutput).toBe(expectedOutput);
}
