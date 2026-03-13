/**
 * Example: Monitoring Vercel Gateway Status and Managing GitHub Issues
 * 
 * This example demonstrates how to use the status monitoring and
 * GitHub integration tools together.
 * 
 * Run with: GITHUB_TOKEN=<token> pnpm tsx example-usage.ts
 */

import {
  checkGatewayOutageStatus,
  monitorGatewayStatus,
  getActiveGatewayIncidents,
  getLatestIncidentUpdate,
} from './status-checker';

import {
  OutageManager,
  createOutageIssue,
  closeOutageIssue,
} from './github-integration';

/**
 * Example 1: One-time status check
 */
async function example1_quickCheck() {
  console.log('='.repeat(60));
  console.log('Example 1: Quick Gateway Status Check');
  console.log('='.repeat(60));
  
  try {
    const status = await checkGatewayOutageStatus();
    
    console.log('Gateway Operational:', !status.isOutage);
    console.log('Overall Page Status:', status.overallPageStatus);
    console.log('Active Incidents:', status.activeIncidents.length);
    
    if (status.activeIncidents.length > 0) {
      status.activeIncidents.forEach((incident) => {
        const latest = getLatestIncidentUpdate(incident);
        console.log(`\n  Incident: ${incident.name}`);
        console.log(`  Status: ${incident.status}`);
        console.log(`  Impact: ${incident.impact}`);
        if (latest) {
          console.log(`  Latest: ${latest.body.substring(0, 100)}...`);
        }
      });
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

/**
 * Example 2: Creating and managing an issue
 */
async function example2_createAndManageIssue() {
  console.log('\n' + '='.repeat(60));
  console.log('Example 2: Create and Manage GitHub Issue');
  console.log('='.repeat(60));
  
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log('Skipping - GITHUB_TOKEN not set');
    return;
  }
  
  try {
    const incidents = await getActiveGatewayIncidents();
    
    if (incidents.length === 0) {
      console.log('No active Gateway incidents to report');
      return;
    }
    
    const incident = incidents[0];
    console.log(`Processing incident: ${incident.name}`);
    
    // Create an issue (commented out to prevent actual creation)
    // const issue = await createOutageIssue(incident, {
    //   owner: 'vercel',
    //   repo: 'ai',
    //   githubToken: token,
    // });
    
    // console.log(`Created issue #${issue.number}`);
    console.log('(Issue creation skipped in example)');
  } catch (error) {
    console.error('Error:', error);
  }
}

/**
 * Example 3: Continuous monitoring with OutageManager
 */
async function example3_continuousMonitoring() {
  console.log('\n' + '='.repeat(60));
  console.log('Example 3: Continuous Monitoring with OutageManager');
  console.log('='.repeat(60));
  
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log('Skipping - GITHUB_TOKEN not set');
    return;
  }
  
  const manager = new OutageManager({
    owner: 'vercel',
    repo: 'ai',
    githubToken: token,
    onError: (error) => console.error('Manager error:', error.message),
  });
  
  // Simulate monitoring for a short period
  console.log('Starting monitoring (30 seconds)...');
  
  let checkCount = 0;
  const unsubscribe = monitorGatewayStatus(
    async (status) => {
      checkCount++;
      console.log(`\nCheck #${checkCount}:`);
      console.log(`  Gateway Operational: ${!status.isOutage}`);
      console.log(`  Active Incidents: ${status.activeIncidents.length}`);
      
      // Process incidents with OutageManager
      for (const incident of status.activeIncidents) {
        console.log(`  - Managing: ${incident.name}`);
        try {
          // Commented out to prevent actual issue creation
          // await manager.handleIncident(incident);
          // const issueNum = manager.getCurrentIssueNumber();
          // console.log(`    Issue #${issueNum}`);
          console.log('    (Would create/update issue)');
        } catch (error) {
          console.error(`    Error: ${(error as Error).message}`);
        }
      }
    },
    5000 // Check every 5 seconds for demo
  );
  
  // Stop after 30 seconds
  setTimeout(() => {
    console.log('\nStopping monitoring...');
    unsubscribe();
  }, 30000);
}

/**
 * Example 4: Formatting incident for display
 */
async function example4_formatIncident() {
  console.log('\n' + '='.repeat(60));
  console.log('Example 4: Format Incident for Display');
  console.log('='.repeat(60));
  
  try {
    const incidents = await getActiveGatewayIncidents();
    
    if (incidents.length === 0) {
      console.log('No active incidents to display');
      return;
    }
    
    const incident = incidents[0];
    console.log('\nIncident Details:');
    console.log(`- Name: ${incident.name}`);
    console.log(`- Status: ${incident.status}`);
    console.log(`- Impact: ${incident.impact}`);
    console.log(`- Created: ${new Date(incident.created_at).toISOString()}`);
    console.log(`- Components: ${incident.components.map(c => c.name).join(', ')}`);
    
    const latest = getLatestIncidentUpdate(incident);
    if (latest) {
      console.log(`\nLatest Update (${latest.status}):`);
      console.log(latest.body.substring(0, 200) + '...');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

/**
 * Main: Run examples based on command line argument
 */
async function main() {
  const example = process.argv[2] || '1';
  
  switch (example) {
    case '1':
      await example1_quickCheck();
      break;
    case '2':
      await example2_createAndManageIssue();
      break;
    case '3':
      await example3_continuousMonitoring();
      break;
    case '4':
      await example4_formatIncident();
      break;
    default:
      console.log('Usage: pnpm tsx example-usage.ts [1|2|3|4]');
      console.log('');
      console.log('Examples:');
      console.log('  1 - Quick status check');
      console.log('  2 - Create and manage GitHub issue');
      console.log('  3 - Continuous monitoring (30 seconds)');
      console.log('  4 - Format incident for display');
      console.log('');
      console.log('Environment variables:');
      console.log('  GITHUB_TOKEN - GitHub API token (for examples 2-3)');
      break;
  }
}

main().catch(console.error);
