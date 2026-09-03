// The tools registry is unversioned: production always serves the current
// working-tree data, so it is imported directly rather than synced and
// pinned like the MDX content families.
export { type Tool, tools } from '../../../content/tools-registry/registry';
