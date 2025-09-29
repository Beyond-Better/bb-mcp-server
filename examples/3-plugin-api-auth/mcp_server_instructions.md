MCP Server with OAuth 2.0 authentication and external API integration. Provides authenticated workflows for secure third-party service integration.

## Authentication Requirements

**CRITICAL**: All workflows require proper OAuth authentication:
- Users must complete OAuth flow before workflow execution
- Tokens are automatically refreshed during operations
- Use `oauth_status` to check authentication state
- Use `initiate_oauth_flow` to start authentication

## Available Workflows

### `example_query`
**Category**: Query | **Duration**: 30s | **Auth**: Required
Query ExampleCorp data with advanced filtering and pagination.

Key parameters:
- `queryType`: Type of data (customers, orders, products, analytics)
- `searchTerm`: Search term for filtering (optional)
- `filters`: Advanced filtering options (dateRange, status, category, region)
- `pagination`: Page, limit, sortBy, sortOrder options
- `outputFormat`: summary, detailed, or raw output

### `example_operation`
**Category**: Operation | **Duration**: 60-180s | **Auth**: Required
Execute complex business operations with multi-step processing and rollback.

Key parameters:
- `operationType`: Type of operation (create_customer_with_order, bulk_update_inventory, process_refund, migrate_data)
- `operationData`: Operation-specific data (discriminated union based on operationType)
- `executionOptions`: Timeout, retry attempts, rollback settings (optional)
- `notifications`: Notification configuration (optional)

## Core Tools

### `execute_workflow`
🎯 **PRIMARY TOOL** - Execute authenticated workflows with external API integration.
- All workflows require `userId` for authentication context
- OAuth tokens handled automatically
- API rate limits respected with automatic backoff

### `get_schema_for_workflow`
📋 **ESSENTIAL** - Get schema including OAuth requirements and API dependencies.

### `oauth_status`
Check OAuth authentication status for a user.

Parameters:
- `userId`: User ID to check (required)

Returns authentication status, token expiration, and available scopes.

### `initiate_oauth_flow`
Start OAuth authentication flow for external API access.

Parameters:
- `userId`: User ID for authentication (required)
- `scopes`: Required OAuth scopes (optional)

Returns OAuth authorization URL and state parameter.

### `get_server_status`
Server health including OAuth provider status, API connectivity, and available workflow names.

## Authentication Flow

1. Check authentication: `oauth_status`
2. If not authenticated: `initiate_oauth_flow`
3. Complete OAuth flow through returned URL
4. Execute workflows with authenticated context
5. Tokens refresh automatically during operations

## Usage Guidelines

**Before workflow execution**:
- Always verify authentication status first
- Complete OAuth flow if tokens are missing or expired
- Include proper `userId` in all workflow parameters

**Error handling**:
- Authentication failures trigger automatic token refresh
- API rate limits cause automatic backoff and retry
- Network errors use exponential backoff strategy
- Check authentication context in error responses

**Security considerations**:
- OAuth tokens stored encrypted and auto-expire
- API requests use minimum required scopes
- All external API calls are logged for audit
- Authentication state persists across server restarts