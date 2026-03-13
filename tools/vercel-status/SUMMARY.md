# Vercel Status Monitoring Integration - Summary

## Objective

Integrate the Vercel Status Page API into the vercel/ai repository to enable automatic detection of infrastructure issues (particularly Gateway outages) and manage GitHub issues to keep the team and users informed.

## What Was Implemented

### 1. Agent Instructions (AGENTS.md)

**Location**: `AGENTS.md` - "Vercel Status Monitoring" section

**Content Added**:
- When to check the status page (sudden errors without code changes)
- How to retrieve status via the public Vercel Status API
- API endpoints and response structures
- Code examples for checking Gateway status
- Instructions for handling Gateway outages
- References to status page and documentation

**Key Insight**: Agents can now distinguish between code-related failures and infrastructure issues.

### 2. Status Checker Utility (status-checker.ts)

**Location**: `tools/vercel-status/status-checker.ts`

**Provides**:
- `getPageStatus()` - Check overall Vercel status
- `getComponents()` - List all service components
- `getIncidents()` - Get incident history and active incidents
- `findGatewayComponent()` - Locate the AI Gateway component
- `isGatewayOperational()` - Quick operational check
- `getActiveGatewayIncidents()` - Find incidents affecting Gateway
- `checkGatewayOutageStatus()` - Comprehensive status check
- `monitorGatewayStatus()` - Continuous polling with callbacks

**Type Definitions**:
- `PageStatus` - Overall system status
- `Component` - Individual service
- `Incident` - Infrastructure incident
- `IncidentUpdate` - Status update for incident
- `GatewayOutageStatus` - Complete outage analysis

### 3. GitHub Integration (github-integration.ts)

**Location**: `tools/vercel-status/github-integration.ts`

**Provides**:
- `createOutageIssue()` - Create a service alert issue
- `updateOutageIssue()` - Update issue with new information
- `closeOutageIssue()` - Close a resolved issue
- `pinIssue()` - Pin issue to repository
- `unpinIssue()` - Unpin issue from repository
- `findExistingOutageIssue()` - Search for open issues

**Main Class: OutageManager**
- High-level orchestrator for incident lifecycle
- Automatically handles: create → pin → update → close workflow
- Tracks incident state to prevent duplicate issues
- Error handling with optional callbacks

### 4. Documentation

#### README (tools/vercel-status/README.md)
- Features overview
- API reference
- Usage examples
- Complete API documentation
- Error handling patterns

#### Implementation Guide (tools/vercel-status/IMPLEMENTATION_GUIDE.md)
- Architecture and components
- Detailed workflow examples
- Integration points
- Configuration requirements
- Monitoring strategies
- Testing approaches
- Security considerations
- Future enhancement ideas

#### Example Usage (tools/vercel-status/example-usage.ts)
- 4 complete, runnable examples
- Quick status checks
- Issue creation and management
- Continuous monitoring
- Incident formatting
- Executable via command line

## API Information

### Vercel Status API Endpoints

Public JSON API (no authentication required):

```
Status:     https://www.vercel-status.com/api/v2/status.json
Components: https://www.vercel-status.com/api/v2/components.json
Incidents:  https://www.vercel-status.com/api/v2/incidents.json
```

### Gateway Component Identification

- **Name**: "AI Gateway"
- **Current ID**: `rsp3h37vv009` (check API for current value)
- **Statuses**: operational | degraded_performance | partial_outage | major_outage

### Incident Lifecycle

```
Investigating → Identified → Monitoring → Resolved
```

## How to Use

### For Agents Debugging

When encountering unexpected server errors:

1. Check if no code changes were made
2. Call the API to check Gateway status:
   ```typescript
   const status = await checkGatewayOutageStatus();
   if (status.isOutage) {
     // Inform user that infrastructure is the issue
   }
   ```
3. Reference the status page for more details

### For Repository Maintainers

To monitor Gateway outages and create issues:

```typescript
import { OutageManager } from './tools/vercel-status/github-integration';
import { getActiveGatewayIncidents } from './tools/vercel-status/status-checker';

const manager = new OutageManager({
  owner: 'vercel',
  repo: 'ai',
  githubToken: process.env.GITHUB_TOKEN,
});

const incidents = await getActiveGatewayIncidents();
for (const incident of incidents) {
  await manager.handleIncident(incident);
  // Automatically creates, pins, updates, and closes issues
}
```

### Running Examples

```bash
# Quick status check
pnpm tsx tools/vercel-status/example-usage.ts 1

# Create GitHub issue (requires GITHUB_TOKEN)
GITHUB_TOKEN=<token> pnpm tsx tools/vercel-status/example-usage.ts 2

# Continuous monitoring (30 seconds)
pnpm tsx tools/vercel-status/example-usage.ts 3

# Format incident
pnpm tsx tools/vercel-status/example-usage.ts 4
```

## Files Created

```
tools/vercel-status/
├── status-checker.ts          # Status API wrapper + utilities
├── github-integration.ts       # GitHub issue automation
├── example-usage.ts           # Runnable examples
├── README.md                  # User documentation
├── IMPLEMENTATION_GUIDE.md    # Technical implementation details
└── SUMMARY.md                 # This file
```

## Changes to Existing Files

### AGENTS.md

Added comprehensive section on "Vercel Status Monitoring":
- When and why to check status
- How to use the API
- Code examples
- Incident handling procedures
- References and links

Location: Added before "Do Not" section

## Key Features

✅ **Public API Integration** - No authentication required for status checks
✅ **Gateway Monitoring** - Specific tracking of AI Gateway component
✅ **GitHub Integration** - Automatic issue creation and management
✅ **Incident Tracking** - Monitor lifecycle from detection to resolution
✅ **Error Handling** - Graceful failures with optional callbacks
✅ **Real-time Monitoring** - Polling with configurable intervals
✅ **Complete Documentation** - API reference, examples, and guides
✅ **Type Safety** - Full TypeScript support with detailed types

## Security & Best Practices

- ✅ GitHub token only used for authenticated requests
- ✅ Token stored in environment variables only
- ✅ Minimal token permissions required
- ✅ No sensitive data logged
- ✅ Rate limiting aware
- ✅ Duplicate issue prevention
- ✅ Error handling with graceful degradation

## Testing & Validation

All code has been written to support:
- Unit testing with mock API responses
- Integration testing against real API
- Manual testing via example scripts
- Dry-run mode for GitHub operations

## Next Steps for Repository

1. **Set up CI/CD Integration** (Optional)
   - Add monitoring job to check status
   - Alert maintainers of major outages

2. **Add to Dependency** (Optional)
   - Install packages if needed (currently uses built-in fetch)
   - Run pnpm install if additional dependencies required

3. **Configure GitHub Token** (For Auto-Issue Creation)
   - Set GITHUB_TOKEN in CI/CD secrets
   - Ensure token has repo write access

4. **Monitor Active Incidents**
   - Check example status every time debugging infrastructure issues
   - Create issues manually for major outages if automation not set up

## References

- **Vercel Status Page**: https://www.vercel-status.com/
- **API Base**: https://www.vercel-status.com/api/v2/
- **GitHub API**: https://docs.github.com/en/rest
- **Status Page Platform**: Atlassian Statuspage (Incident.io)

---

**Implementation Date**: 2026-03-12
**Status**: Complete and ready for use
**Maintenance**: Check AGENTS.md for any updates needed as Vercel's infrastructure evolves
