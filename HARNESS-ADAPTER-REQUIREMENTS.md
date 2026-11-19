# Critical harness adapter requirements

This documents CRITICAL configuration requirements every harness adapter MUST follow for using its underlying harness's SDK or CLI.

The underlying harness's SDK or CLI in almost every case is a third-party product. Therefore, the below requirements also state alternatives for when the actual requirement cannot be met.

If a harness's SDK or CLI can meet neither a requirement nor its alternative, or if it cannot meet a requirement that does not provide an alternative, supporting this harness in our repository is infeasible due to upstream limitations.

1. **R1:** Every harness must store its sessions and other internal artifacts exclusively in its given `HarnessV2Log`.
   - **Alternative:** If a harness is not configurable that way, it must be an in-sandbox-only harness.
2. **R2:** Every harness must ignore configuration files (e.g. JSON, YAML) present in the agent's `workDir` that would affect its behavior. Markdown files that are purely instructions (e.g. `AGENTS.md`, skills) are acceptable and encouraged to be processed.
3. **R3:** Every harness must require user approval for its builtin bash tool when used with `permissionMode: 'allow-reads' | 'allow-edits'`.
   - **Alternative:** If a harness is not configurable that way, it must immediately throw when invoked with permission mode `allow-reads` or `allow-edits`.
4. **R4:** Every harness must require user approval for any file writes when used with `permissionMode: 'allow-reads'`.
   - **Alternative:** If a harness is not configurable that way, it must immediately throw when invoked with this permission mode.
5. **R5:** Every harness must still require user approval for reading or writing files outside of the agent's `workDir` when used with `permissionMode: 'allow-reads' | 'allow-edits'`. `permissionMode: 'allow-all'` is the only mode that completely bypasses the `workDir` constraint.
   - **Alternative:** If a harness is not configurable that way, it must immediately throw when invoked with permission mode `allow-reads` or `allow-edits`.
