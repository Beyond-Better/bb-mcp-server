# ExampleCorp MCP Server Instructions

This MCP server provides comprehensive integration with ExampleCorp's business systems, enabling AI assistants to query data, execute workflows, and perform business operations through authenticated API access.

## Overview

The ExampleCorp MCP Server demonstrates the power of the bb-mcp-server library architecture:

- **Simplified Implementation**: Built using bb-mcp-server library infrastructure
- **OAuth Integration**: Secure authentication with ExampleCorp APIs
- **Workflow-Driven**: Structured business operations with validation and rollback
- **Type-Safe Operations**: Full TypeScript validation for all operations
- **Error Recovery**: Comprehensive error handling and retry logic

## Available Tools

### 🎯 Workflow Execution

#### `execute_workflow_example`
Execute specialized ExampleCorp business workflows with comprehensive parameter validation and structured results.

**Parameters:**
- `workflow_name` (enum): Workflow to execute
  - `example_query`: Query ExampleCorp data with advanced filtering
  - `example_operation`: Execute complex business operations with rollback
- `parameters` (object): Workflow-specific parameters
  - `userId` (string, required): User ID for authentication and audit logging
  - `requestId` (string, optional): Optional request ID for tracking
  - `dryRun` (boolean, optional): Dry run mode - validate but do not execute

**Example:**
```json
{
  "workflow_name": "example_query",
  "parameters": {
    "userId": "user-123",
    "queryType": "customers",
    "filters": {
      "status": "active",
      "region": "North America"
    },
    "pagination": {
      "page": 1,
      "limit": 20
    }
  }
}
```

### 🔍 Data Query Operations

#### `query_customers_example`
Search and retrieve customer data from ExampleCorp API with OAuth authentication.

**Parameters:**
- `search` (string, optional): Search term for customer names or IDs
- `limit` (number, optional): Maximum number of results (1-100, default: 10)
- `filters` (object, optional): Additional filtering options
  - `status` (enum): active, inactive, suspended
  - `region` (string): Geographic region filter
  - `customerType` (enum): individual, business
- `userId` (string, required): User ID for authentication

**Example:**
```json
{
  "search": "Acme Corp",
  "limit": 25,
  "filters": {
    "status": "active",
    "customerType": "business",
    "region": "US-West"
  },
  "userId": "user-123"
}
```

### 📦 Order Operations

#### `create_order_example`
Create new orders in ExampleCorp system with comprehensive validation.

**Parameters:**
- `customerId` (string, required): Customer ID for the order
- `items` (array, required): Order items
  - `productId` (string): Product identifier
  - `quantity` (number): Quantity (minimum 1)
  - `unitPrice` (number): Unit price (minimum 0)
  - `notes` (string, optional): Item notes
- `shippingAddress` (object, required): Shipping address details
- `priority` (enum, optional): standard, expedited, urgent (default: standard)
- `notes` (string, optional): Order notes
- `userId` (string, required): User ID for authentication

#### `get_order_status_example`
Retrieve current status and tracking information for ExampleCorp orders.

**Parameters:**
- `orderId` (string, required): Order ID to query
- `includeHistory` (boolean, optional): Include order status history (default: false)
- `userId` (string, required): User ID for authentication

### ℹ️ System Information

#### `get_api_info_example`
Get information about ExampleCorp API connectivity and available operations.

**Parameters:** None

## Available Workflows

### 🔍 Query Workflow (`example_query`)

Query ExampleCorp data with advanced filtering and pagination capabilities.

**Supported Query Types:**
- `customers`: Customer database with filtering by status, region, type
- `orders`: Order history with date range and status filtering
- `products`: Product catalog with category and availability filtering
- `analytics`: Business analytics with date range analysis

**Key Features:**
- Advanced filtering options for all data types
- Pagination with configurable page size and sorting
- Multiple output formats (summary, detailed, raw)
- Dry run mode for query validation and planning
- Comprehensive error handling and validation

**Example Usage:**
```json
{
  "workflow_name": "example_query",
  "parameters": {
    "userId": "user-123",
    "queryType": "orders",
    "searchTerm": "urgent",
    "filters": {
      "dateRange": {
        "startDate": "2024-01-01T00:00:00Z",
        "endDate": "2024-12-31T23:59:59Z"
      },
      "status": "processing"
    },
    "pagination": {
      "page": 1,
      "limit": 50,
      "sortBy": "createdDate",
      "sortOrder": "desc"
    },
    "outputFormat": "detailed",
    "includeMetadata": true
  }
}
```

### 🛠️ Operation Workflow (`example_operation`)

Execute complex ExampleCorp business operations with multi-step processing and rollback capabilities.

**Supported Operations:**
- `create_customer_with_order`: Create customer and associated order in single transaction
- `bulk_update_inventory`: Update inventory levels for multiple products
- `process_refund`: Process customer refunds with proper validation
- `migrate_data`: Data migration operations with validation and rollback

**Key Features:**
- Multi-step operations with atomic rollback on failure
- Comprehensive parameter validation using discriminated unions
- Dry run mode with execution planning and resource estimation
- Notification system for operation completion/failure
- Detailed step tracking and audit logging
- Configurable retry logic and timeout handling

**Example Usage:**
```json
{
  "workflow_name": "example_operation",
  "parameters": {
    "userId": "user-123",
    "operationType": "create_customer_with_order",
    "operationData": {
      "type": "create_customer_with_order",
      "customer": {
        "name": "Jane Smith",
        "email": "jane.smith@example.com",
        "address": {
          "street": "123 Business Ave",
          "city": "Commerce City",
          "state": "CA",
          "zipCode": "90210",
          "country": "US"
        },
        "customerType": "business"
      },
      "order": {
        "items": [
          {
            "productId": "prod-001",
            "quantity": 5,
            "unitPrice": 29.99
          }
        ],
        "shippingMethod": "expedited",
        "notes": "Rush order for new customer"
      }
    },
    "executionOptions": {
      "timeout": 300,
      "retryAttempts": 2,
      "rollbackOnFailure": true
    },
    "notifications": {
      "notifyOnCompletion": true,
      "notifyOnFailure": true,
      "notificationChannels": ["email"]
    }
  }
}
```

## Authentication & Authorization

### OAuth Integration

The ExampleCorp MCP Server uses OAuth 2.0 for secure API access:

1. **User Authentication**: Each operation requires a `userId` parameter
2. **Token Management**: Automatic token refresh and credential storage
3. **Scope Validation**: Operations are validated against user permissions
4. **Audit Logging**: All operations are logged for security and compliance

### Required Scopes

- `read`: Query operations (customers, orders, products, analytics)
- `write`: Create/update operations (orders, customers, inventory)
- `admin`: Administrative operations (bulk updates, data migration, refunds)

## Error Handling

### Structured Error Responses

All tools and workflows return structured error information:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Detailed error message with context"
    }
  ],
  "isError": true,
  "_meta": {
    "errorCode": "VALIDATION_FAILED",
    "errorCategory": "client_error",
    "retryable": false,
    "timestamp": "2024-01-01T12:00:00Z"
  }
}
```

### Common Error Scenarios

1. **Authentication Errors**: Invalid or expired OAuth tokens
2. **Validation Errors**: Invalid parameters or missing required fields
3. **Permission Errors**: Insufficient scopes for requested operations
4. **Rate Limiting**: API rate limits exceeded
5. **External API Errors**: ExampleCorp API unavailable or returning errors
6. **Workflow Errors**: Business logic validation failures

### Error Recovery

- **Automatic Retry**: Network and temporary errors are automatically retried
- **Token Refresh**: Expired OAuth tokens are automatically refreshed
- **Rollback Operations**: Failed multi-step operations can be automatically rolled back
- **Graceful Degradation**: Partial failures in bulk operations are handled gracefully

## Performance Considerations

### Rate Limiting

The server implements intelligent rate limiting:
- **API Rate Limits**: Respects ExampleCorp API rate limits
- **Batch Operations**: Large operations are automatically batched
- **Exponential Backoff**: Failed requests use exponential backoff retry logic

### Caching

Selective caching improves performance:
- **OAuth Tokens**: Cached until expiration
- **API Metadata**: Cached for performance
- **User Permissions**: Cached with TTL for security

## Development and Testing

### Dry Run Mode

All workflows support dry run mode for testing:
- **Validation Only**: Validates parameters without execution
- **Execution Planning**: Shows planned steps and resource requirements
- **Permission Checking**: Validates user permissions for operations
- **API Connectivity**: Tests external API connections

### Mock Data

For development and testing, the server can use mock data:
- Set `EXAMPLECORP_API_BASE_URL=http://localhost:3001/api` in development
- Mock server provides realistic test data for all operations
- Full workflow testing without external dependencies

## Library Architecture Demonstration

This MCP server showcases the bb-mcp-server library benefits:

### 🎯 Code Reduction
- **Main Entry Point**: 50 lines (vs 200+ typical implementations)
- **Server Implementation**: 150 lines (vs 2000+ typical implementations)
- **Infrastructure Code**: 0 lines (provided by library)
- **Business Logic Focus**: 90% of code is ExampleCorp-specific business logic

### 🏗️ Architecture Benefits
- **Library Integration**: Seamless integration with bb-mcp-server infrastructure
- **OAuth Abstraction**: Complete OAuth 2.0 implementation via library
- **Transport Abstraction**: STDIO and HTTP transport via simple configuration
- **Workflow Framework**: Sophisticated workflow system with minimal setup
- **Type Safety**: Full TypeScript support with Zod validation
- **Error Handling**: Comprehensive error recovery and rollback capabilities

### 🚀 Developer Experience
- **Single Configuration File**: All settings in one `.env` file
- **Clear Separation**: Library handles infrastructure, consumer handles business logic
- **Easy Testing**: Mock dependencies and dry run capabilities
- **Comprehensive Documentation**: Built-in API documentation and examples
- **Production Ready**: OAuth, audit logging, and security built-in

This demonstrates the successful extraction of sophisticated MCP server infrastructure into a reusable library, enabling dramatic simplification of consumer implementations while maintaining full functionality and extensibility.