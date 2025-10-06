# Audit Logging Guide

## Overview

The audit logging system provides comprehensive tracking of all activities in your MCP server, including API calls, authentication events, tool executions, workflow operations, and system events. This enables compliance monitoring, security auditing, debugging, and performance analysis.

### 🎯 **Key Features**

- **Granular Control**: Enable/disable logging for specific categories
- **Comprehensive Coverage**: Tracks all user actions and system events
- **Performance Monitoring**: Records execution times for all operations
- **Security Auditing**: Complete authentication and authorization event log
- **Automatic Cleanup**: Configurable retention policies
- **JSON Format**: Structured logs for easy parsing and analysis

## 🔧 **Configuration**

### Environment Variables

Configure audit logging through environment variables in your `.env` file:

```bash
# Enable or disable audit logging (default: true)
AUDIT_ENABLED=true

# Log file path (default: ./logs/audit.log)
AUDIT_LOG_FILE=./logs/audit.log

# Log retention in days (default: 90)
AUDIT_RETENTION_DAYS=90

# Category-specific logging controls
AUDIT_LOG_CALLS_API=true              # API calls to third-party services
AUDIT_LOG_CALLS_AUTH=true             # Authentication events (login, token refresh, etc.)
AUDIT_LOG_CALLS_WORKFLOW_EXECUTION=true   # Top-level workflow runs
AUDIT_LOG_CALLS_WORKFLOW_OPERATION=true   # Individual operations within workflows
AUDIT_LOG_CALLS_TOOLS=true            # Tool executions
AUDIT_LOG_CALLS_SYSTEM=true           # System events (startup, shutdown, etc.)
AUDIT_LOG_CALLS_CUSTOM=true           # Custom application events
```

### Configuration Examples

#### Minimal Logging (Performance Mode)
```bash
# Only log critical events
AUDIT_ENABLED=true
AUDIT_LOG_CALLS_API=false
AUDIT_LOG_CALLS_AUTH=true              # Keep security events
AUDIT_LOG_CALLS_WORKFLOW_EXECUTION=true
AUDIT_LOG_CALLS_WORKFLOW_OPERATION=false  # Skip detailed steps
AUDIT_LOG_CALLS_TOOLS=false
AUDIT_LOG_CALLS_SYSTEM=true
AUDIT_LOG_CALLS_CUSTOM=false
```

#### Compliance Mode (Maximum Logging)
```bash
# Log everything for compliance
AUDIT_ENABLED=true
AUDIT_RETENTION_DAYS=365               # 1 year retention
AUDIT_LOG_CALLS_API=true
AUDIT_LOG_CALLS_AUTH=true
AUDIT_LOG_CALLS_WORKFLOW_EXECUTION=true
AUDIT_LOG_CALLS_WORKFLOW_OPERATION=true
AUDIT_LOG_CALLS_TOOLS=true
AUDIT_LOG_CALLS_SYSTEM=true
AUDIT_LOG_CALLS_CUSTOM=true
```

#### Development Mode (Debugging)
```bash
# Focus on workflow and tool debugging
AUDIT_ENABLED=true
AUDIT_LOG_CALLS_API=true
AUDIT_LOG_CALLS_AUTH=false
AUDIT_LOG_CALLS_WORKFLOW_EXECUTION=true
AUDIT_LOG_CALLS_WORKFLOW_OPERATION=true  # Detailed operation tracking
AUDIT_LOG_CALLS_TOOLS=true
AUDIT_LOG_CALLS_SYSTEM=false
AUDIT_LOG_CALLS_CUSTOM=true
```

## 📊 **Logging Categories**

### 1. API Calls (`AUDIT_LOG_CALLS_API`)

Tracks all HTTP requests to third-party APIs:

**Logged Information:**
- HTTP method (GET, POST, PUT, DELETE, etc.)
- API endpoint
- HTTP status code
- Request duration (milliseconds)
- User ID
- Request ID (for tracing)
- Error details (if failed)

**Example Log Entry:**
```json
{
  "type": "api_call",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "method": "POST",
  "endpoint": "/customers",
  "statusCode": 201,
  "durationMs": 245,
  "userId": "user_123",
  "requestId": "req_abc789"
}
```

**Use Cases:**
- Monitor API response times
- Track API error rates
- Debug third-party integration issues
- Analyze API usage patterns

### 2. Authentication Events (`AUDIT_LOG_CALLS_AUTH`)

Tracks all authentication and authorization activities:

**Event Types:**
- `login` - Successful user authentication
- `logout` - User logout/session end
- `token_refresh` - Access token refreshed
- `token_revoke` - Token revoked
- `auth_failure` - Authentication failed

**Logged Information:**
- Event type
- Success/failure status
- User ID
- Client ID (OAuth client)
- IP address (if available)
- Error details (if failed)

**Example Log Entry:**
```json
{
  "type": "auth_event",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "event": "login",
  "success": true,
  "userId": "user_123",
  "details": {
    "clientId": "client_abc",
    "scope": "read write"
  }
}
```

**Use Cases:**
- Security monitoring
- Failed login attempt tracking
- Compliance audits
- User session analysis

### 3. Workflow Execution (`AUDIT_LOG_CALLS_WORKFLOW_EXECUTION`)

Tracks top-level workflow runs:

**Logged Information:**
- Workflow name
- Success/failure status
- Total execution time
- User ID
- Request ID
- Input parameters (optional)
- Output result (optional)
- Error details (if failed)

**Example Log Entry:**
```json
{
  "type": "workflow_execution",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "workflowName": "customer_onboarding",
  "operation": "workflow_execution",
  "success": true,
  "durationMs": 3450,
  "userId": "user_123",
  "requestId": "req_abc789"
}
```

**Use Cases:**
- Monitor workflow success rates
- Track workflow performance
- Identify slow workflows
- Debug workflow failures

### 4. Workflow Operations (`AUDIT_LOG_CALLS_WORKFLOW_OPERATION`)

Tracks individual operations within workflows:

**Logged Information:**
- Workflow name
- Operation name (specific step)
- Success/failure status
- Operation execution time
- User ID
- Request ID
- Operation-specific data
- Error details (if failed)

**Example Log Entry:**
```json
{
  "type": "workflow_operation",
  "timestamp": "2024-01-15T10:30:46.123Z",
  "workflowName": "customer_onboarding",
  "operation": "create_customer",
  "success": true,
  "durationMs": 245,
  "userId": "user_123",
  "requestId": "req_abc789",
  "outputResult": {
    "customerId": "cust_456"
  }
}
```

**Use Cases:**
- Pinpoint which operation failed in a workflow
- Analyze operation-level performance
- Debug complex multi-step workflows
- Track rollback operations

**💡 Tip:** Enable `WORKFLOW_OPERATION` logging during development for detailed debugging, then disable in production for performance.

### 5. Tool Calls (`AUDIT_LOG_CALLS_TOOLS`)

Tracks all MCP tool executions:

**Logged Information:**
- Tool name
- Tool class (group of related tools)
- Tool version
- Tool category
- Success/failure status
- Execution time
- User ID
- Request ID
- Input parameters (optional)
- Output result (optional)
- Error details (if failed)

**Example Log Entry:**
```json
{
  "type": "tool_call",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "toolName": "query_customers",
  "toolClass": "CustomerTools",
  "version": "1.0.0",
  "category": "business",
  "success": true,
  "durationMs": 180,
  "userId": "user_123",
  "requestId": "req_abc789"
}
```

**Use Cases:**
- Track which tools are most used
- Monitor tool execution times
- Identify failing tools
- Analyze user behavior patterns

### 6. System Events (`AUDIT_LOG_CALLS_SYSTEM`)

Tracks system-level events:

**Event Types:**
- Server startup/shutdown
- Configuration changes
- Error conditions
- Health check failures
- Resource warnings

**Logged Information:**
- Event name
- Severity level (debug, info, warn, error)
- Component name
- Event details

**Example Log Entry:**
```json
{
  "type": "system_event",
  "timestamp": "2024-01-15T10:00:00.123Z",
  "event": "server_startup",
  "severity": "info",
  "component": "BeyondMcpServer",
  "details": {
    "version": "1.0.0",
    "transport": "http",
    "port": 3000
  }
}
```

**Use Cases:**
- Monitor system health
- Track server restarts
- Debug configuration issues
- Analyze error patterns

### 7. Custom Events (`AUDIT_LOG_CALLS_CUSTOM`)

Tracks application-specific custom events:

**Use for:**
- Business-specific metrics
- Custom compliance requirements
- Application-specific auditing needs
- Special event tracking

**Example:**
```typescript
await auditLogger.logCustomEvent('payment_processed', {
  userId: 'user_123',
  orderId: 'order_456',
  amount: 99.99,
  currency: 'USD'
});
```

## 🔍 **Searching Audit Logs**

### Programmatic Search

```typescript
import { AuditLogger } from '@beyondbetter/bb-mcp-server';

const auditLogger = new AuditLogger(config, logger);
await auditLogger.initialize();

// Search by user
const userLogs = await auditLogger.searchLogs({
  userId: 'user_123',
  limit: 100
});

// Search by time range
const recentLogs = await auditLogger.searchLogs({
  startTime: new Date('2024-01-01'),
  endTime: new Date('2024-01-31'),
  limit: 1000
});

// Search by type
const authEvents = await auditLogger.searchLogs({
  type: 'auth_event',
  limit: 50
});

// Search by specific event
const logins = await auditLogger.searchLogs({
  type: 'auth_event',
  event: 'login',
  limit: 100
});
```

### Command-Line Search

```bash
# Search for user activity
grep '"userId":"user_123"' logs/audit.log

# Search for failed operations
grep '"success":false' logs/audit.log

# Search for slow operations (> 1 second)
grep '"durationMs":[1-9][0-9][0-9][0-9]' logs/audit.log

# Search for authentication failures
grep '"event":"auth_failure"' logs/audit.log

# Count API calls by endpoint
grep '"type":"api_call"' logs/audit.log | jq -r '.endpoint' | sort | uniq -c
```

## 📈 **Audit Statistics**

### Get Audit Stats

```typescript
const stats = await auditLogger.getAuditStats();

console.log(stats);
// {
//   totalEntries: 15420,
//   entriesByType: {
//     api_call: 8450,
//     auth_event: 1200,
//     workflow_execution: 850,
//     workflow_operation: 3200,
//     tool_call: 1500,
//     system_event: 220
//   },
//   entriesByUser: {
//     user_123: 4500,
//     user_456: 3200
//   },
//   recentActivity: [
//     { timestamp: '2024-01-15T10:00:00Z', type: 'all', count: 245 },
//     { timestamp: '2024-01-15T11:00:00Z', type: 'all', count: 198 }
//   ]
// }
```

## 🧹 **Log Maintenance**

### Automatic Cleanup

The audit logger automatically removes old logs based on the retention policy:

```typescript
// Runs automatically based on retention settings
// Or trigger manually:
const removedCount = await auditLogger.cleanupOldLogs();
console.log(`Removed ${removedCount} expired audit entries`);
```

### Manual Log Rotation

```bash
# Rotate logs manually (example with logrotate)
# /etc/logrotate.d/mcp-server
/path/to/logs/audit.log {
    daily
    rotate 90
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
    postrotate
        # Notify application to reopen log file
        systemctl reload mcp-server
    endscript
}
```

## 💡 **Best Practices**

### 1. **Choose Appropriate Logging Levels**

✅ **Production:**
- Enable: API, Auth, Workflow Execution, System
- Consider disabling: Workflow Operations, Tools (unless needed for compliance)
- Rationale: Balance between visibility and performance

✅ **Development:**
- Enable: All categories
- Rationale: Maximum debugging information

✅ **Compliance/Security:**
- Enable: All categories
- Increase retention: 365+ days
- Rationale: Complete audit trail

### 2. **Monitor Log Size**

```bash
# Check log size
du -h logs/audit.log

# Monitor disk space
df -h /path/to/logs

# Estimate daily growth
find logs/ -name "audit.log*" -mtime -1 -exec du -ch {} + | tail -1
```

### 3. **Secure Audit Logs**

```bash
# Restrict file permissions
chmod 640 logs/audit.log
chown mcp-server:adm logs/audit.log

# Store logs on separate partition (recommended)
mkdir /var/log/mcp-server
ln -s /var/log/mcp-server logs/audit.log
```

### 4. **Export for Analysis**

Consider exporting to external systems:
- **ELK Stack** (Elasticsearch, Logstash, Kibana)
- **Splunk**
- **Datadog**
- **CloudWatch** (AWS)
- **Azure Monitor**

**Example Filebeat Configuration:**
```yaml
filebeat.inputs:
- type: log
  enabled: true
  paths:
    - /path/to/logs/audit.log
  json.keys_under_root: true
  json.add_error_key: true
  
output.elasticsearch:
  hosts: ["localhost:9200"]
  index: "mcp-audit-%{+yyyy.MM.dd}"
```

### 5. **Regular Reviews**

Schedule regular audit log reviews:
- **Daily**: Authentication failures, API errors
- **Weekly**: Performance trends, usage patterns
- **Monthly**: Compliance reports, capacity planning
- **Quarterly**: Retention policy review, storage analysis

## 🔒 **Security Considerations**

### Sensitive Data

The audit logger automatically sanitizes sensitive fields:
- Passwords
- API keys
- Tokens
- Secrets

**Custom Sanitization:**
```typescript
// The audit logger does NOT automatically log input params
// You control what gets logged:

await auditLogger.logToolCall({
  toolName: 'create_user',
  // ... other fields
  inputParams: {
    username: params.username,
    email: params.email,
    // DON'T include: password: params.password
  }
});
```

### Compliance

Audit logging supports common compliance requirements:
- **GDPR**: User activity tracking, data access logs
- **HIPAA**: PHI access auditing
- **SOX**: Financial transaction logging
- **PCI-DSS**: Access control monitoring

**User Data Deletion (GDPR):**
```typescript
// When user requests data deletion, remove their audit logs:
const userLogs = await auditLogger.searchLogs({ userId: 'user_123' });
// Archive to separate storage before deletion
await archiveLogsToCompliantStorage(userLogs);
// Then remove from active logs
```

## 🐛 **Troubleshooting**

### Logs Not Being Written

**Check:**
1. `AUDIT_ENABLED=true` is set
2. Log directory exists and is writable
3. Disk space is available
4. Audit logger is initialized: `await auditLogger.initialize()`

```bash
# Check permissions
ls -la logs/

# Check disk space
df -h /path/to/logs

# Test write access
touch logs/test-write && rm logs/test-write
```

### Missing Log Entries

**Check category settings:**
```bash
# Verify all relevant categories are enabled
grep "AUDIT_LOG_CALLS" .env
```

**Check buffer flush:**
```typescript
// Ensure proper shutdown to flush buffered logs
await auditLogger.close();
```

### High Disk Usage

**Solutions:**
1. Reduce retention period: `AUDIT_RETENTION_DAYS=30`
2. Disable verbose categories: `AUDIT_LOG_CALLS_WORKFLOW_OPERATION=false`
3. Enable log rotation
4. Export to external storage
5. Compress old logs: `gzip logs/audit.log.old`

### Performance Impact

**If experiencing performance issues:**
1. Increase buffer size (default: 100 entries)
2. Increase flush interval (default: 5 seconds)
3. Disable non-critical categories
4. Use faster storage (SSD)

```typescript
const auditConfig = {
  enabled: true,
  bufferSize: 500,        // Increased from 100
  flushInterval: 10000,   // 10 seconds (from 5)
  // ...
};
```

## 📚 **Examples**

### Example 1: Track User Activity

```typescript
// Get all activity for a specific user
const userActivity = await auditLogger.searchLogs({
  userId: 'user_123',
  startTime: new Date('2024-01-01'),
  endTime: new Date('2024-01-31'),
  limit: 1000
});

// Analyze patterns
const toolUsage = userActivity
  .filter(log => log.type === 'tool_call')
  .reduce((acc, log) => {
    acc[log.toolName] = (acc[log.toolName] || 0) + 1;
    return acc;
  }, {});

console.log('User tool usage:', toolUsage);
```

### Example 2: Monitor API Performance

```typescript
// Get slow API calls (> 1 second)
const slowCalls = (await auditLogger.searchLogs({
  type: 'api_call',
  limit: 1000
}))
  .filter(log => log.durationMs > 1000)
  .sort((a, b) => b.durationMs - a.durationMs);

console.log('Slowest API calls:');
slowCalls.slice(0, 10).forEach(log => {
  console.log(`${log.endpoint}: ${log.durationMs}ms`);
});
```

### Example 3: Security Monitoring

```typescript
// Monitor failed authentication attempts
const failedLogins = await auditLogger.searchLogs({
  type: 'auth_event',
  event: 'auth_failure',
  limit: 100
});

// Alert on suspicious patterns
const userAttempts = failedLogins.reduce((acc, log) => {
  acc[log.userId] = (acc[log.userId] || 0) + 1;
  return acc;
}, {});

Object.entries(userAttempts).forEach(([userId, count]) => {
  if (count > 5) {
    console.warn(`Security Alert: User ${userId} has ${count} failed login attempts`);
  }
});
```

## ✨ **Summary**

The audit logging system provides:

✅ **Comprehensive Tracking**: All user actions and system events
✅ **Granular Control**: Enable/disable specific categories
✅ **Performance Monitoring**: Execution time tracking
✅ **Security Auditing**: Complete authentication log
✅ **Easy Analysis**: Structured JSON format
✅ **Automatic Maintenance**: Built-in log rotation and cleanup

**Quick Start:**
1. Set environment variables in `.env`
2. Enable desired logging categories
3. Configure retention policy
4. Start your MCP server
5. Audit logs automatically written to configured file

For detailed implementation examples and advanced usage, see the [Developer Reference](../AUDIT_LOGGER_ENHANCEMENTS.md).