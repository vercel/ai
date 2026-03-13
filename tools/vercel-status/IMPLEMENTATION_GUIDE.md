# Vercel Status Monitoring Integration - Implementation Guide

This guide describes the implementation of Vercel Status monitoring for the vercel/ai repository.

## Overview

The implementation provides agents and developers with tools to:

1. **Detect Infrastructure Issues**: Query the Vercel Status API to check if sudden errors are infrastructure-related
2. **Monitor Gateway Status**: Specifically track the AI Gateway component for outages
3. **Manage GitHub Issues**: Automatically create, update, pin, and close issues for major incidents
4. **Track Incident Lifecycle**: Monitor incidents from detection through resolution

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENTS.md Instructions                    │
│              (When to check status, why it matters)          │
└─────────────────────────────────────┬───────────────────────┘
                                      │
                    ┌─────────────────┼──────────────┐
                    ▼                 ▼              ▼
        ┌─────────────────┐  ┌─────────────┐  ┌─────────────┐
        │ Status Checker  │  │   GitHub    │  │  Example    │
        │   (API Layer)   │  │Integration  │  │   Usage     │
        │                 │  │  (Issue Mgmt)  │  │  Scripts   │
        └────────┬────────┘  └────────┬────┘  └─────────────┘
                 │                    │
        ┌────────▼────────────────────▼────────┐
        │    Vercel Status Page API            │
        │  https://vercel-status.com/api/v2/   │
        └──────────────────────────────────────┘
```

### API Endpoints Used

1. **Status Endpoint** - Get overall system status
   ```
   https://www.vercel-status.com/api/v2/status.json
   ```
   Returns: Overall indicator (none/minor/major/critical) and description

2. **Components Endpoint** - Get all component statuses
   ```
   https://www.vercel-status.com/api/v2/components.json
   ```
   Returns: List of all Vercel services with individual status

3. **Incidents Endpoint** - Get incident history and active incidents
   ```
   https://www.vercel-status.com/api/v2/incidents.json
   ```
   Returns: All incidents with updates and affected components

## Key Data Structures

### Finding the Gateway Component

The Gateway component can be identified by:
- `name` contains "Gateway" (e.g., "AI Gateway")
- ID: `rsp3h37vv009` (current value, subject to change)

Status values:
- `operational` - Working normally
- `degraded_performance` - Slower than normal
- `partial_outage` - Some requests failing
- `major_outage` - Service unavailable

### Incident Lifecycle

```
Investigating → Identified → Monitoring → Resolved
```

- **Investigating**: Problem detected, cause unknown
- **Identified**: Root cause found, mitigation in progress
- **Monitoring**: Fix applied, waiting for full recovery
- **Resolved**: Issue fully resolved, normal operations resumed

## Integration Points

### 1. Agent Instructions (AGENTS.md)

Added a new "Vercel Status Monitoring" section that:
- Explains when to check status (sudden errors without code changes)
- Shows how to use the API endpoints
- Provides code examples for checking Gateway status
- Details the process for handling Gateway outages

### 2. Status Checker Utility (status-checker.ts)

**Primary Functions:**

```typescript
// Get current status
const status = await getPageStatus();          // Overall page status
const components = await getComponents();       // All components
const incidents = await getIncidents();         // All incidents

// Gateway-specific
const gateway = await findGatewayComponent();   // Find Gateway component
const isOp = await isGatewayOperational();      // Is it working?
const activeIncidents = await getActiveGatewayIncidents(); // Any outages?

// Comprehensive check
const outageStatus = await checkGatewayOutageStatus();

// Real-time monitoring
const unsub = monitorGatewayStatus(
  (status) => { /* handle status changes */ },
  60000 // Check interval
);
```

### 3. GitHub Integration (github-integration.ts)

**Issue Management Functions:**

```typescript
// Create issue for new outage
const issue = await createOutageIssue(incident, options);

// Update with new information
await updateOutageIssue(issueNumber, incident, options);

// Pin/unpin to make visible
await pinIssue(issueNumber, options);
await unpinIssue(issueNumber, options);

// Close when resolved
await closeOutageIssue(issueNumber, options);

// Find existing issue
const existingIssue = await findExistingOutageIssue(options);
```

**OutageManager Class:**

High-level orchestrator that handles complete lifecycle:

```typescript
const manager = new OutageManager({
  owner: 'vercel',
  repo: 'ai',
  githubToken: process.env.GITHUB_TOKEN,
  onError: (error) => console.error(error),
});

// For each incident found
for (const incident of activeIncidents) {
  await manager.handleIncident(incident);
  // Automatically creates → pins → updates → closes issues
}
```

## Workflow Example

### Scenario: Gateway Outage Detected

1. **Detection Phase**
   ```typescript
   const status = await checkGatewayOutageStatus();
   if (status.isOutage && status.activeIncidents.length > 0) {
     // Outage confirmed
   }
   ```

2. **Issue Creation Phase**
   ```typescript
   const incident = status.activeIncidents[0];
   const issue = await createOutageIssue(incident, {
     owner: 'vercel',
     repo: 'ai',
     githubToken: token,
   });
   ```

3. **Pinning Phase**
   ```typescript
   await pinIssue(issue.number, options);
   ```

4. **Update Phase** (periodic)
   ```typescript
   // Refresh incident data from API
   const updatedIncident = await getIncidents();
   // Update issue with new status
   await updateOutageIssue(issue.number, updatedIncident, options);
   ```

5. **Resolution Phase**
   ```typescript
   if (incident.status === 'resolved') {
     await updateOutageIssue(issue.number, incident, options);
     await unpinIssue(issue.number, options);
     await closeOutageIssue(issue.number, options);
   }
   ```

## Configuration

### Environment Variables

- `GITHUB_TOKEN` - GitHub API token with repo write access
  - Required for issue creation/management
  - Should have `repo` scope at minimum

### GitHub Repository Permissions

Ensure the token has write access to:
- Create issues
- Edit issue titles/bodies
- Pin/unpin issues
- Close issues

## Error Handling

### API Failures

```typescript
try {
  const status = await checkGatewayOutageStatus();
} catch (error) {
  // Network error, invalid API response, etc.
  console.error('Failed to check status:', error);
  // Fallback: Assume service is operational or log for manual review
}
```

### GitHub Integration Failures

```typescript
const manager = new OutageManager({
  // ... options
  onError: (error) => {
    // Handle error gracefully
    logger.error('Failed to manage incident:', error);
    // Could send alert, log to monitoring system, etc.
  },
});
```

## Monitoring Strategies

### Option 1: Polling (Continuous)

```typescript
// Check every minute for changes
const unsubscribe = monitorGatewayStatus(
  async (status) => {
    if (status.isOutage) {
      // Handle outage
    }
  },
  60000
);
```

### Option 2: Event-Driven (When Needed)

```typescript
// Check on-demand when errors are detected
if (detectUnexpectedErrors()) {
  const status = await checkGatewayOutageStatus();
  if (status.isOutage) {
    // Inform user that infrastructure is the issue
  }
}
```

### Option 3: Scheduled (Periodic)

```typescript
// Check every 5 minutes via cron or scheduler
schedule.scheduleJob('*/5 * * * *', async () => {
  const status = await checkGatewayOutageStatus();
  // Log metrics, create issues if needed
});
```

## Testing

### Manual Testing

```bash
# Check status
pnpm tsx tools/vercel-status/example-usage.ts 1

# Create test issue (requires GITHUB_TOKEN)
GITHUB_TOKEN=<token> pnpm tsx tools/vercel-status/example-usage.ts 2

# Monitor for 30 seconds
pnpm tsx tools/vercel-status/example-usage.ts 3

# Format incident
pnpm tsx tools/vercel-status/example-usage.ts 4
```

### Integration Points for Testing

1. **API Mocking**: Mock Vercel Status API responses for testing
2. **GitHub Sandbox**: Use a test repository for GitHub issue creation
3. **Dry Run Mode**: Add `--dry-run` flag to OutageManager for testing

## Security Considerations

1. **Token Safety**
   - Store GITHUB_TOKEN in environment variables only
   - Never commit tokens to repository
   - Use token with minimal required permissions

2. **API Rate Limiting**
   - Vercel Status API has no known rate limits (public)
   - GitHub API: 60 requests/hour (unauthenticated), 5000/hour (authenticated)
   - Implement backoff for failures

3. **Issue Spam Prevention**
   - Check for existing open issues before creating new ones
   - Use labels to filter related issues
   - Prevent duplicate issues for the same incident

## Future Enhancements

1. **Slack/Email Notifications**
   - Send alerts when outages are detected
   - Include incident updates in notifications

2. **Status Dashboard**
   - Display current status in repository README
   - Show historical incidents

3. **Analytics**
   - Track incident frequency and duration
   - Generate reports on service reliability

4. **Custom Rules**
   - Alert only for specific component types
   - Different handling for different severity levels

5. **Webhook Support**
   - Listen to Vercel Status webhook events
   - Real-time notifications instead of polling

## References

- [Vercel Status Page](https://www.vercel-status.com/)
- [Statuspage API (Incident.io)](https://developer.atlassian.com/cloud/statuspage/rest/api-group-incidents/)
- [GitHub REST API](https://docs.github.com/en/rest)
- [Repository Guidelines](../../AGENTS.md#vercel-status-monitoring)
