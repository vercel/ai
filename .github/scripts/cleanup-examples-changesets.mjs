/**
 * `changeset version` updates the version and adds a changelog file in
 * the example apps, but we don't want to do that. So this script reverts
 * any "version" field changes and deletes the `CHANGELOG.md` file.
 *
 * Source: https://github.com/TooTallNate/nx.js/blob/main/.github/scripts/cleanup-examples.mjs
 */

import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
  statSync
} from 'node:fs'
import { fileURLToPath } from 'url'
import { join } from 'path'

const examplesUrl = new URL('../../examples', import.meta.url)
const examplesDir = fileURLToPath(examplesUrl)

console.log('Cleaning up examples...', examplesDir)

for (const app of readdirSync(examplesDir)) {
  const appPath = join(examplesDir, app)
  if (statSync(appPath).isDirectory()) {
    const packageJsonPath = join(appPath, 'package.json')
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    packageJson.version = '0.0.0'
    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n')

    try {
      const changelogUrl = new URL(`examples/${app}/CHANGELOG.md`, examplesUrl)
      console.log('Deleting', changelogUrl)
      unlinkSync(changelogUrl)
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
  }
}
