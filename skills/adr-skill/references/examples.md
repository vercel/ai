# ADR Example

This filled-out example follows the Simple template. For a more complex decision, use option headings within Alternatives Considered and give each tradeoff enough room.

```markdown
# Use SQLite for local development database

- Status: accepted

## Context and Problem Statement

Our integration tests hit a shared PostgreSQL instance, causing flaky tests from concurrent writes and slow CI (3+ minute setup per run). We need an isolated database for local development and CI that does not require infrastructure provisioning.

## Decision

Use SQLite via better-sqlite3 for local development and CI test runs. Production remains on PostgreSQL. A thin data-access layer will abstract the database engine, with compatibility testing against both engines.

SQLite reduces database setup to about two seconds, isolates tests, and allows offline development. We accept the cost of maintaining compatibility between SQLite and PostgreSQL SQL dialects. PostgreSQL-specific features such as JSONB operators and array columns still need testing against PostgreSQL.

Migrating production to SQLite and building a full ORM abstraction are out of scope.

## Alternatives Considered

- Docker PostgreSQL per CI run: Provides production parity without a database abstraction, but adds 90+ seconds of startup and requires Docker in CI and on developer machines.
- In-memory PostgreSQL (pg-mem): Needs no infrastructure and offers better PostgreSQL SQL compatibility than SQLite, but lacks schema features we use, including triggers and CTEs.

## More Information

- Related: [Use PostgreSQL for production](2025-05-01-use-postgresql-for-production.md)
- Implementation and verification: #347
- PostgreSQL compatibility CI: #348
- Revisit if dialect-drift bugs exceed two per quarter.
```
