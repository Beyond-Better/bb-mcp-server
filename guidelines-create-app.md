---
title: LLM Guidelines for Building MCP Server Applications with bb-mcp-server
audience: Large Language Models (AI Assistants)
purpose: Instructions for LLMs helping developers create custom MCP servers
version: 1.0.0
created: 2025-10-06
---

# LLM Guidelines: Building MCP Server Applications with bb-mcp-server

## Your Role

You are assisting a developer in building a custom MCP (Model Context Protocol) server using the `@beyondbetter/bb-mcp-server` library. This library handles all infrastructure concerns (transport, OAuth, storage, plugins), allowing the developer to focus on their business logic.

**Your responsibilities**:
1. **Discover Requirements**: Interview the developer to understand their objectives
2. **Recommend Patterns**: Suggest appropriate implementation patterns based on complexity
3. **Generate Code**: Create complete, working implementations
4. **Configure Environment**: Help set up required environment variables
5. **Test & Validate**: Ensure implementations follow best practices
6. **Document**: Create MCP server instructions for LLM clients

---

## Phase 1: Discovery & Requirements Gathering

### Initial Interview Process

Before writing any code, conduct a thorough requirements interview:

#### 1. **Project Overview Questions**

```
ASK THE USER:
- What is the purpose of your MCP server? (e.g., integrate with X API, process Y data, automate Z workflow)
- Who will use this server? (LLM clients like Claude, other AI tools)
- What is your experience level? (beginner, intermediate, advanced)
```

**Record answers to determine appropriate complexity level.**

#### 2. **Functionality Requirements**

```
ASK THE USER:
- What tools do you need? (simple operations like "get data", "validate input")
  * List each tool with its purpose
  * Note required parameters for each
  
- What workflows do you need? (multi-step processes like "sync data", "process order")
  * List each workflow with its steps
  * Note state management requirements
  * Identify error recovery needs

- Do you need both tools and workflows, or just one type?
```

**Use answers to determine Pattern 1 (tools only) vs Pattern 2 (workflows) vs both.**

#### 3. **External Integration Requirements**

```
ASK THE USER:
- Do you need to integrate with external APIs? (yes/no)
  * If YES: Which service(s)?
  * Does the API require OAuth authentication? (yes/no)
  * Do you have API credentials? (client ID, secret, etc.)
  
- If OAuth is required:
  * What OAuth flow does the API use? (Authorization Code, Client Credentials)
  * What are the OAuth endpoints? (authorization URL, token URL)
  * What scopes are needed?
  * What is the redirect URI?
```

**Use answers to determine if Pattern 3 (OAuth-enabled) is needed.**

#### 4. **Infrastructure Preferences**

```
ASK THE USER:
- How will the server be accessed?
  * STDIO (for Claude Desktop, direct MCP clients) - DEFAULT
  * HTTP (for web applications, multiple clients)
  
- Do you need custom infrastructure control? (advanced users only)
  * Custom storage configuration?
  * Custom error handling?
  * Manual tool/workflow registration?
```

**Use answers to determine if Pattern 4 (advanced) is needed or stick with Patterns 1-3.**

#### 5. **Development Environment**

```
ASK THE USER:
- Is Deno installed? (version 2.5.0 or later required)
- Do you have a project directory set up?
- Do you have experience with TypeScript? (affects code explanation level)
```

**Use answers to determine setup guidance needed.**

---

## Phase 2: Pattern Selection & Architecture Design

Based on requirements gathered, recommend ONE of these patterns:

### Pattern Decision Matrix

| Requirements | Recommended Pattern | Complexity |
|--------------|-------------------|------------|
| Simple tools only, no external APIs | **Pattern 1: Simple Server** | ⭐ Beginner |
| Multi-step workflows, state management | **Pattern 2: Workflow Server** | ⭐⭐ Intermediate |
| OAuth + external API integration | **Pattern 3: OAuth-Enabled Server** | ⭐⭐⭐ Advanced |
| Full infrastructure control needed | **Pattern 4: Advanced Server** | ⭐⭐⭐⭐ Expert |

### Present Architecture to User

```
TELL THE USER:
"Based on your requirements, I recommend Pattern [N]: [Name].

Your server will have:
- [List of plugins/workflows/tools to be created]
- [Transport type: STDIO or HTTP]
- [OAuth integration: yes/no]
- [External API: name(s)]

I'll create the following files:
- main.ts (entry point)
- src/plugins/[PluginName].ts
- [other files based on pattern]
- .env.example (environment template)
- mcp_server_instructions.md (LLM context)

Does this architecture meet your needs?"
```

**Wait for user confirmation before proceeding.**

---

## Phase 3: Environment Configuration Setup

### Environment Variables Checklist

Based on selected pattern, create `.env.example` with required variables:

#### ✅ Pattern 1: Simple Server (Minimal)

**Required**:
- [ ] `MCP_TRANSPORT` - Transport type (stdio or http)
- [ ] `PLUGINS_DISCOVERY_PATHS` - Plugin discovery paths
- [ ] `PLUGINS_AUTOLOAD` - Auto-load plugins (true/false)
- [ ] `LOG_LEVEL` - Logging level (info, debug, warn, error)

**Optional**:
- [ ] `STORAGE_DENO_KV_PATH` - KV database path (default: ./data/app.db)
- [ ] `HTTP_PORT` - HTTP port if using HTTP transport (default: 3001)
- [ ] `HTTP_HOST` - HTTP host if using HTTP transport (default: localhost)

```bash
# .env.example for Pattern 1
MCP_TRANSPORT=stdio
PLUGINS_DISCOVERY_PATHS=./src/plugins
PLUGINS_AUTOLOAD=true
LOG_LEVEL=info
STORAGE_DENO_KV_PATH=./data/app.db
```

#### ✅ Pattern 2: Workflow Server (Same as Pattern 1)

Workflows don't require additional environment variables beyond Pattern 1.

#### ✅ Pattern 3: OAuth-Enabled Server (Extended)

**Required (all from Pattern 1, plus)**:
- [ ] `OAUTH_CONSUMER_PROVIDER` - OAuth provider name (e.g., 'github', 'google', 'myservice')
- [ ] `OAUTH_CONSUMER_CLIENT_ID` - Third-party API client ID
- [ ] `OAUTH_CONSUMER_CLIENT_SECRET` - Third-party API client secret
- [ ] `OAUTH_CONSUMER_REDIRECT_URI` - OAuth callback URL
- [ ] `OAUTH_CONSUMER_AUTH_URL` - Authorization endpoint URL
- [ ] `OAUTH_CONSUMER_TOKEN_URL` - Token endpoint URL

**Optional**:
- [ ] `OAUTH_CONSUMER_SCOPES` - OAuth scopes (comma-separated)
- [ ] `[SERVICE]_API_VERSION` - API version for the service
- [ ] `[SERVICE]_API_TIMEOUT` - API request timeout in milliseconds
- [ ] `[SERVICE]_API_BASE_URL` - API base URL override

```bash
# .env.example for Pattern 3
# Basic Configuration
MCP_TRANSPORT=http
HTTP_PORT=3000
HTTP_HOST=localhost
PLUGINS_DISCOVERY_PATHS=./src/plugins
PLUGINS_AUTOLOAD=true
LOG_LEVEL=info
STORAGE_DENO_KV_PATH=./data/app.db

# OAuth Consumer Configuration
OAUTH_CONSUMER_PROVIDER=myservice
OAUTH_CONSUMER_CLIENT_ID=your-client-id-here
OAUTH_CONSUMER_CLIENT_SECRET=your-client-secret-here
OAUTH_CONSUMER_REDIRECT_URI=http://localhost:3000/oauth/callback
OAUTH_CONSUMER_AUTH_URL=https://api.myservice.com/oauth/authorize
OAUTH_CONSUMER_TOKEN_URL=https://api.myservice.com/oauth/token
OAUTH_CONSUMER_SCOPES=read,write

# Service-Specific Configuration
MYSERVICE_API_VERSION=v1
MYSERVICE_API_TIMEOUT=30000
```

#### ✅ Pattern 4: Advanced Server (Full Control)

Same as Pattern 3, plus any custom configuration variables the user defines.

### Configuration Validation Interview

```
ASK THE USER (for Pattern 3 OAuth setup):
- What is your OAuth client ID?
- What is your OAuth client secret? (will be stored in .env, gitignored)
- What is your authorization URL? (e.g., https://api.service.com/oauth/authorize)
- What is your token URL? (e.g., https://api.service.com/oauth/token)
- What scopes do you need? (comma-separated list)
- What is your redirect URI? (should match HTTP_PORT if using http transport)
```

**Create both `.env.example` (with placeholder values) and guide user to create `.env` (with actual values).**

---

## Phase 4: Implementation

### Implementation Sequence

1. **Create project structure**
2. **Generate main.ts entry point**
3. **Create plugin files**
4. **Implement tools and/or workflows**
5. **Create OAuth consumer (if needed)**
6. **Create API client (if needed)**
7. **Create custom dependencies (if needed)**
8. **Generate environment configuration**
9. **Create MCP server instructions**
10. **Create deno.jsonc configuration**

### Critical Implementation Rules

#### Rule 1: inputSchema Format (CRITICAL)

**ALWAYS use plain object with Zod schemas as values**:

```typescript
// ✅ CORRECT
inputSchema: {
  param1: z.string().describe('Description'),
  param2: z.number().default(10).describe('Description'),
}

// ❌ WRONG - Do NOT wrap with z.object()
inputSchema: z.object({
  param1: z.string(),
})
```

**Rationale**: The MCP library expects plain object structure. Using `z.object()` wrapper causes type and runtime errors.

#### Rule 2: Plugin File Naming

**Plugin files MUST follow these naming patterns**:
- `plugin.ts` or `plugin.js`
- `*Plugin.ts` (e.g., `MyPlugin.ts`, `UtilitiesPlugin.ts`)
- `*.plugin.ts` (e.g., `my.plugin.ts`)

**These will NOT be loaded as plugins**:
- `MyWorkflow.ts` (individual workflow classes)
- `MyTool.ts` (individual tool classes)
- `*.test.ts` or `*.spec.ts` (test files)

#### Rule 3: Plugin Export Patterns

**Use one of these export patterns**:

```typescript
// Option 1: Default export (recommended)
export default {
  name: 'my-plugin',
  version: '1.0.0',
  description: 'My plugin',
  workflows: [new MyWorkflow()],
  
  async initialize(deps, toolRegistry, workflowRegistry) {
    // Optional initialization
  }
} as AppPlugin;

// Option 2: Named export
export const plugin: AppPlugin = {
  name: 'my-plugin',
  // ...
};

// Option 3: Factory function (for dependency injection)
export function createMyPlugin(deps: CustomDependencies): AppPlugin {
  return {
    name: 'my-plugin',
    workflows: [new MyWorkflow(deps.apiClient)],
  };
}
```

#### Rule 4: Workflow Best Practices

**Always include in workflows**:
- Step tracking with timestamps
- Comprehensive error handling
- Failed steps array
- Execution metadata (duration, etc.)
- Zod parameter schema with descriptions

```typescript
export class MyWorkflow extends WorkflowBase {
  readonly name = 'my_workflow';
  readonly version = '1.0.0';
  readonly description = 'Clear description';
  readonly category = 'operation' as const;
  
  readonly parameterSchema = z.object({
    param: z.string().describe('Clear parameter description'),
  });
  
  async execute(params): Promise<WorkflowResult> {
    const steps = [];
    const failedSteps = [];
    const startTime = performance.now();
    
    try {
      // Step implementation with tracking
      steps.push({
        operation: 'step_name',
        success: true,
        timestamp: new Date().toISOString()
      });
      
      return {
        success: true,
        data: result,
        completed_steps: steps,
        failed_steps: [],
        metadata: { executionTime: performance.now() - startTime }
      };
    } catch (error) {
      failedSteps.push({
        operation: 'step_name',
        error_type: 'system_error' as const,
        message: error.message,
        timestamp: new Date().toISOString()
      });
      
      return {
        success: false,
        error: {
          type: 'system_error' as const,
          message: error.message,
          code: 'ERROR_CODE',
          recoverable: true
        },
        completed_steps: steps,
        failed_steps: failedSteps,
        metadata: { executionTime: performance.now() - startTime }
      };
    }
  }
}
```

---

## Pattern 1: Simple Server Implementation

### When to Use Pattern 1

- User needs simple tools only (no workflows)
- No external API integration
- No OAuth authentication
- Beginner-friendly setup

### Files to Create

```
project/
├── main.ts
├── deno.jsonc
├── .env.example
├── .env (guide user to create)
├── .gitignore
├── mcp_server_instructions.md
└── src/
    └── plugins/
        └── UtilitiesPlugin.ts
```

### Implementation Template: main.ts

```typescript
import { AppServer } from 'jsr:@beyondbetter/bb-mcp-server';

const appServer = await AppServer.create({
  serverConfig: {
    name: 'my-mcp-server',
    version: '1.0.0',
    title: 'My MCP Server',
    description: 'Custom MCP server with utility tools',
  },
  pluginConfig: {
    discoveryPaths: ['./src/plugins'],
    autoLoad: true,
  },
});

await appServer.start();
```

### Implementation Template: Plugin with Tools

```typescript
// src/plugins/UtilitiesPlugin.ts
import {
  AppPlugin,
  ToolRegistry,
  WorkflowRegistry,
  z,
} from 'jsr:@beyondbetter/bb-mcp-server';

export default {
  name: 'utilities-plugin',
  version: '1.0.0',
  description: 'Utility tools for [specific purpose]',
  
  async initialize(
    dependencies: any,
    toolRegistry: ToolRegistry,
    workflowRegistry: WorkflowRegistry
  ): Promise<void> {
    // Register Tool 1: [Tool Name]
    toolRegistry.registerTool('[tool_name]', {
      title: '[Tool Title]',
      description: '[Clear description of what this tool does]',
      category: 'Utilities',
      inputSchema: {
        param1: z.string().describe('[Parameter description]'),
        param2: z.number().optional().default(10).describe('[Optional parameter]'),
      }
    }, async (args) => {
      try {
        // Tool implementation
        const result = performOperation(args.param1, args.param2);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        };
      }
    });
    
    // Register additional tools as needed
  }
} as AppPlugin;

function performOperation(param1: string, param2: number): any {
  // Implementation logic
  return { result: 'success' };
}
```

### Interview for Tool Definitions

```
FOR EACH TOOL, ASK THE USER:
- What is the tool name? (use snake_case: get_data, validate_input)
- What does it do? (one sentence description)
- What parameters does it need?
  * For each parameter:
    - Name (snake_case)
    - Type (string, number, boolean, array, object)
    - Required or optional?
    - Default value (if optional)?
    - Description for LLM clients
- What does it return?
  * Success format
  * Error format
```

---

## Pattern 2: Workflow Server Implementation

### When to Use Pattern 2

- User needs multi-step processes
- State management required
- Error recovery needed
- Audit trail important

### Additional Files for Pattern 2

```
project/
├── [all Pattern 1 files]
└── src/
    ├── plugins/
    │   └── WorkflowsPlugin.ts
    └── workflows/
        └── DataProcessingWorkflow.ts
```

### Implementation Template: Workflow Class

```typescript
// src/workflows/DataProcessingWorkflow.ts
import {
  WorkflowBase,
  WorkflowResult,
  z,
} from 'jsr:@beyondbetter/bb-mcp-server';

export class DataProcessingWorkflow extends WorkflowBase {
  readonly name = '[workflow_name]';
  readonly version = '1.0.0';
  readonly description = '[Multi-step process description]';
  readonly category = 'operation' as const;
  
  readonly parameterSchema = z.object({
    param1: z.string().describe('[Parameter 1 description]'),
    param2: z.record(z.unknown()).describe('[Parameter 2 description]'),
    options: z.object({
      validate: z.boolean().default(true).describe('[Option description]'),
    }).optional(),
  });
  
  async execute(params: z.infer<typeof this.parameterSchema>): Promise<WorkflowResult> {
    const startTime = performance.now();
    const steps = [];
    const failedSteps = [];
    
    try {
      // Step 1: [First step description]
      const step1Result = await this.performStep1(params.param1);
      steps.push({
        operation: 'step_1',
        success: true,
        duration_ms: performance.now() - startTime,
        timestamp: new Date().toISOString()
      });
      
      // Step 2: [Second step description]
      const step2Result = await this.performStep2(step1Result, params.param2);
      steps.push({
        operation: 'step_2',
        success: true,
        duration_ms: performance.now() - startTime,
        timestamp: new Date().toISOString()
      });
      
      // Step 3: [Final step description]
      const finalResult = await this.performStep3(step2Result);
      steps.push({
        operation: 'step_3',
        success: true,
        duration_ms: performance.now() - startTime,
        timestamp: new Date().toISOString()
      });
      
      return {
        success: true,
        data: finalResult,
        completed_steps: steps,
        failed_steps: [],
        metadata: {
          executionTime: performance.now() - startTime,
          stepsCompleted: steps.length
        }
      };
      
    } catch (error) {
      failedSteps.push({
        operation: 'workflow_execution',
        error_type: 'system_error' as const,
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
      
      return {
        success: false,
        error: {
          type: 'system_error' as const,
          message: error instanceof Error ? error.message : 'Workflow failed',
          details: error instanceof Error ? error.stack : undefined,
          code: 'WORKFLOW_ERROR',
          stack: error instanceof Error ? error.stack : undefined,
          recoverable: true
        },
        completed_steps: steps,
        failed_steps: failedSteps,
        metadata: { executionTime: performance.now() - startTime }
      };
    }
  }
  
  private async performStep1(param: string): Promise<any> {
    // Step 1 implementation
    return { data: 'step1-result' };
  }
  
  private async performStep2(previousResult: any, param: any): Promise<any> {
    // Step 2 implementation
    return { data: 'step2-result' };
  }
  
  private async performStep3(previousResult: any): Promise<any> {
    // Step 3 implementation
    return { data: 'final-result' };
  }
}
```

### Implementation Template: Workflow Plugin

```typescript
// src/plugins/WorkflowsPlugin.ts
import { AppPlugin } from 'jsr:@beyondbetter/bb-mcp-server';
import { DataProcessingWorkflow } from '../workflows/DataProcessingWorkflow.ts';

export default {
  name: 'workflows-plugin',
  version: '1.0.0',
  description: 'Business process workflows',
  workflows: [new DataProcessingWorkflow()],
} as AppPlugin;
```

### Interview for Workflow Definitions

```
FOR EACH WORKFLOW, ASK THE USER:
- What is the workflow name? (use snake_case: process_order, sync_data)
- What is the overall goal? (one sentence)
- What are the steps? (in order)
  * For each step:
    - Step name/description
    - What data it needs
    - What it produces
    - Can it fail? How to recover?
- What parameters does the workflow need?
  * Same parameter interview as tools
- What should it return on success?
- What should it return on failure?
```

---

## Pattern 3: OAuth-Enabled Server Implementation

### When to Use Pattern 3

- User needs to integrate with external APIs
- API requires OAuth authentication
- Token management needed
- Third-party service integration

### Additional Files for Pattern 3

```
project/
├── [all Pattern 1 & 2 files]
└── src/
    ├── auth/
    │   └── MyServiceOAuthConsumer.ts
    ├── api/
    │   └── MyServiceApiClient.ts
    └── config/
        └── MyServiceDependencies.ts
```

### OAuth Setup Interview

```
ASK THE USER (detailed OAuth information):

1. Service Identification:
   - What service are you integrating with? (e.g., GitHub, Google, Slack, custom)
   - Do you have API documentation URL?

2. OAuth Configuration:
   - What is the authorization URL? (e.g., https://api.service.com/oauth/authorize)
   - What is the token URL? (e.g., https://api.service.com/oauth/token)
   - Does the API use PKCE? (yes/no - most modern APIs do)
   - What OAuth scopes do you need? (read, write, admin, etc.)

3. API Credentials:
   - Do you have a client ID?
   - Do you have a client secret?
   - What is your redirect URI? (must match HTTP server if using http transport)

4. API Details:
   - What is the API base URL? (e.g., https://api.service.com)
   - What API version are you using? (if applicable)
   - What are the rate limits? (requests per second/minute)
   - Does the API require special headers? (e.g., API-Version, User-Agent)

5. Token Management:
   - How long do access tokens last?
   - Does the API provide refresh tokens?
   - Any special token refresh requirements?
```

### Implementation Template: OAuth Consumer

```typescript
// src/auth/MyServiceOAuthConsumer.ts
import {
  OAuthConsumer,
  OAuthConsumerConfig,
  OAuthConsumerDependencies,
} from 'jsr:@beyondbetter/bb-mcp-server';

export class MyServiceOAuthConsumer extends OAuthConsumer {
  constructor(
    config: OAuthConsumerConfig,
    dependencies: OAuthConsumerDependencies
  ) {
    super(
      {
        ...config,
        authUrl: '[AUTHORIZATION_URL]',
        tokenUrl: '[TOKEN_URL]',
        scopes: ['[SCOPE1]', '[SCOPE2]'],
        usePKCE: true, // Enable PKCE for security
      },
      dependencies
    );
  }
  
  // Override if service has custom token handling
  protected async exchangeCodeForTokens(code: string): Promise<any> {
    const result = await super.exchangeCodeForTokens(code);
    
    // Add service-specific processing if needed
    // e.g., validate token, extract user info, etc.
    
    return result;
  }
  
  // Override if service has custom token refresh
  protected async refreshTokens(refreshToken: string): Promise<any> {
    const result = await super.refreshTokens(refreshToken);
    
    // Add service-specific processing if needed
    
    return result;
  }
}
```

### Implementation Template: API Client

```typescript
// src/api/MyServiceApiClient.ts
import {
  BaseApiClient,
  BaseApiClientConfig,
} from 'jsr:@beyondbetter/bb-mcp-server';

export interface MyServiceApiClientConfig extends BaseApiClientConfig {
  apiVersion?: string;
}

export class MyServiceApiClient extends BaseApiClient {
  private apiVersion: string;
  
  constructor(config: MyServiceApiClientConfig) {
    super({
      ...config,
      baseUrl: '[API_BASE_URL]',
      timeout: 30000, // 30 seconds
    });
    this.apiVersion = config.apiVersion || 'v1';
  }
  
  // Implement API methods based on user requirements
  async getData(userId: string, query: string): Promise<any> {
    return this.get(`/${this.apiVersion}/data`, {
      params: { userId, query },
    });
  }
  
  async createRecord(userId: string, data: any): Promise<any> {
    return this.post(`/${this.apiVersion}/records`, data, {
      params: { userId },
    });
  }
  
  async updateRecord(userId: string, recordId: string, data: any): Promise<any> {
    return this.put(`/${this.apiVersion}/records/${recordId}`, data, {
      params: { userId },
    });
  }
  
  async deleteRecord(userId: string, recordId: string): Promise<any> {
    return this.delete(`/${this.apiVersion}/records/${recordId}`, {
      params: { userId },
    });
  }
}
```

### API Client Methods Interview

```
ASK THE USER (for each API operation they need):
- What API endpoint do you need to call? (e.g., GET /api/v1/users, POST /api/v1/data)
- What method? (GET, POST, PUT, DELETE, PATCH)
- What parameters does it need?
  * URL parameters (e.g., userId in /users/{userId})
  * Query parameters (e.g., ?limit=10&offset=0)
  * Request body (for POST/PUT/PATCH)
- What does it return? (response structure)
- Does it require special headers?
- What errors can it return? (400, 401, 403, 404, 429, 500)
```

### Implementation Template: Custom Dependencies

```typescript
// src/config/MyServiceDependencies.ts
import {
  AppServerDependencies,
  CreateCustomAppServerDependencies,
  ConfigManager,
  Logger,
} from 'jsr:@beyondbetter/bb-mcp-server';
import { MyServiceOAuthConsumer } from '../auth/MyServiceOAuthConsumer.ts';
import { MyServiceApiClient } from '../api/MyServiceApiClient.ts';

export interface MyServiceDependencies extends AppServerDependencies {
  myServiceOAuthConsumer: MyServiceOAuthConsumer;
  myServiceApiClient: MyServiceApiClient;
}

export const createMyServiceDependencies: CreateCustomAppServerDependencies<MyServiceDependencies> = async (
  baseConfig,
  overrides
) => {
  const configManager = new ConfigManager();
  const logger = new Logger(configManager.loadLoggingConfig());
  
  // Get base dependencies from library
  const { getAllDependencies } = await import('jsr:@beyondbetter/bb-mcp-server');
  const baseDeps = await getAllDependencies(baseConfig, overrides);
  
  // Create custom OAuth consumer
  const oauthConfig = configManager.loadOAuthConsumerConfig('[SERVICE_NAME]');
  const myServiceOAuthConsumer = new MyServiceOAuthConsumer(
    oauthConfig,
    {
      credentialStore: baseDeps.credentialStore,
      sessionStore: baseDeps.sessionStore,
      logger,
    }
  );
  
  // Create API client with OAuth
  const myServiceApiClient = new MyServiceApiClient({
    logger,
    getAccessToken: async (userId: string) => {
      return await myServiceOAuthConsumer.getAccessToken(userId);
    },
    apiVersion: Deno.env.get('[SERVICE]_API_VERSION') || 'v1',
  });
  
  return {
    ...baseDeps,
    myServiceOAuthConsumer,
    myServiceApiClient,
  };
};
```

### Implementation Template: main.ts with Custom Dependencies

```typescript
// main.ts
import { AppServer } from 'jsr:@beyondbetter/bb-mcp-server';
import { createMyServiceDependencies } from './src/config/MyServiceDependencies.ts';

const appServer = await AppServer.create(
  {
    serverConfig: {
      name: '[service]-mcp-server',
      version: '1.0.0',
      title: '[Service] MCP Server',
      description: 'MCP server with [Service] integration',
    },
    pluginConfig: {
      discoveryPaths: ['./src/plugins'],
      autoLoad: true,
    },
  },
  createMyServiceDependencies
);

await appServer.start();
```

### Implementation Template: OAuth-Enabled Workflow

```typescript
// src/workflows/MyServiceWorkflow.ts
import {
  WorkflowBase,
  WorkflowResult,
  z,
} from 'jsr:@beyondbetter/bb-mcp-server';
import { MyServiceApiClient } from '../api/MyServiceApiClient.ts';

export class MyServiceSyncWorkflow extends WorkflowBase {
  readonly name = '[service]_sync';
  readonly version = '1.0.0';
  readonly description = 'Sync data with [Service] API';
  readonly category = 'operation' as const;
  
  readonly parameterSchema = z.object({
    userId: z.string().describe('User ID for authentication'),
    operation: z.enum(['fetch', 'create', 'update', 'delete']).describe('Operation type'),
    data: z.record(z.unknown()).optional().describe('Data for create/update operations'),
    query: z.string().optional().describe('Query for fetch operation'),
  });
  
  constructor(private apiClient: MyServiceApiClient) {
    super();
  }
  
  async execute(params: z.infer<typeof this.parameterSchema>): Promise<WorkflowResult> {
    const startTime = performance.now();
    const steps = [];
    
    try {
      let result;
      
      // Step 1: Perform operation based on type
      switch (params.operation) {
        case 'fetch':
          result = await this.apiClient.getData(params.userId, params.query || '');
          break;
        case 'create':
          result = await this.apiClient.createRecord(params.userId, params.data);
          break;
        case 'update':
          result = await this.apiClient.updateRecord(params.userId, params.data?.id, params.data);
          break;
        case 'delete':
          result = await this.apiClient.deleteRecord(params.userId, params.data?.id);
          break;
      }
      
      steps.push({
        operation: `${params.operation}_data`,
        success: true,
        duration_ms: performance.now() - startTime,
        timestamp: new Date().toISOString()
      });
      
      return {
        success: true,
        data: result,
        completed_steps: steps,
        failed_steps: [],
        metadata: {
          executionTime: performance.now() - startTime,
          operation: params.operation
        }
      };
      
    } catch (error) {
      return {
        success: false,
        error: {
          type: 'system_error' as const,
          message: error instanceof Error ? error.message : 'Sync failed',
          code: 'SYNC_ERROR',
          recoverable: true
        },
        completed_steps: steps,
        failed_steps: [{
          operation: 'sync_workflow',
          error_type: 'system_error' as const,
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        }],
        metadata: { executionTime: performance.now() - startTime }
      };
    }
  }
}
```

---

## Pattern 4: Advanced Server Implementation

### When to Use Pattern 4

- User explicitly requests full infrastructure control
- Custom storage configuration needed
- Custom error handling required
- Manual tool/workflow registration preferred
- Advanced users only

**Note**: Recommend Pattern 3 first. Only use Pattern 4 if user specifically needs advanced control.

### Additional Configuration for Pattern 4

Pattern 4 extends Pattern 3 with custom dependency factory that overrides ALL library defaults.

```typescript
// src/config/AdvancedDependencies.ts
import {
  AppServerDependencies,
  CreateCustomAppServerDependencies,
  KVManager,
  Logger,
  ConfigManager,
  CredentialStore,
  SessionStore,
  TransportEventStoreChunked,
  TransportManager,
  ToolRegistry,
  WorkflowRegistry,
  PluginManager,
  OAuthProvider,
  ErrorHandler,
  AuditLogger,
} from 'jsr:@beyondbetter/bb-mcp-server';

export const createAdvancedDependencies: CreateCustomAppServerDependencies = async (
  baseConfig,
  overrides
) => {
  // Custom configuration
  const configManager = new ConfigManager();
  const logger = new Logger(configManager.loadLoggingConfig());
  
  // Custom KV storage
  const kvManager = new KVManager(
    {
      path: Deno.env.get('STORAGE_DENO_KV_PATH') || './data/advanced.db',
      prefixes: {
        sessions: ['sessions'],
        credentials: ['credentials'],
        tokens: ['tokens'],
        codes: ['oauth', 'codes'],
        clients: ['oauth', 'clients'],
        transport: ['transport'],
        audit: ['audit'],
        cache: ['cache'],
      },
    },
    logger
  );
  await kvManager.initialize();
  
  // Custom storage components
  const sessionStore = new SessionStore(kvManager, logger);
  const credentialStore = new CredentialStore(kvManager, logger);
  const transportEventStore = new TransportEventStoreChunked(
    kvManager,
    logger,
    {
      maxMessageSize: 50 * 1024,
      compressionThreshold: 10 * 1024,
      enableCompression: true,
      retentionDays: 30,
    }
  );
  
  // Custom transport
  const transportManager = new TransportManager(
    configManager.loadTransportConfig(),
    { sessionStore, transportEventStore, logger }
  );
  
  // Custom registries
  const toolRegistry = new ToolRegistry(logger);
  const workflowRegistry = new WorkflowRegistry(logger);
  const pluginManager = new PluginManager(
    workflowRegistry,
    configManager.loadPluginsConfig(),
    logger
  );
  
  // OAuth provider
  const oauthProvider = new OAuthProvider(
    configManager.loadOAuthProviderConfig(),
    { credentialStore, sessionStore, kvManager, logger }
  );
  
  // Error handling and audit logging
  const errorHandler = new ErrorHandler(logger);
  const auditLogger = new AuditLogger(
    kvManager,
    logger,
    configManager.loadAuditConfig()
  );
  
  return {
    configManager,
    logger,
    kvManager,
    sessionStore,
    credentialStore,
    transportEventStore,
    transportManager,
    toolRegistry,
    workflowRegistry,
    pluginManager,
    oauthProvider,
    errorHandler,
    auditLogger,
  };
};
```

---

## Phase 5: MCP Server Instructions (LLM Context)

### Purpose of MCP Server Instructions

MCP Server Instructions provide context for LLM clients (like Claude) to understand how to use the server. These instructions are loaded by the MCP server and provided to AI models.

### Instructions Template Generation

Generate `mcp_server_instructions.md` based on the pattern and user requirements:

```markdown
# [Server Name] MCP Server Instructions

## Purpose
[Brief description of what this server does and its primary use cases]

## Available Tools

[FOR EACH TOOL CREATED, ADD]:
### [tool_name]
[Description of what the tool does and when to use it]

**Parameters**:
- `param1` (required): [Description and valid values]
- `param2` (optional, default: value): [Description]

**Returns**: [Description of return format]

**Example Usage**:
`` ``` ``json
{
  "param1": "example-value",
  "param2": "optional-value"
}
`` ``` ``

**Error Handling**:
- [Common error 1]: [How to resolve]
- [Common error 2]: [How to resolve]

## Available Workflows

[FOR EACH WORKFLOW CREATED, ADD]:
### [workflow_name]
[Detailed description of the multi-step process]

**Authentication**: [Required/Not Required]
**Duration**: [Estimated execution time]
**Category**: [operation/query/analysis]

**Parameters**:
- `userId` (required): [Description]
- `data` (required): [Description of data structure]

**Process Steps**:
1. [Step 1 description]
2. [Step 2 description]
3. [Step 3 description]

**Returns**: [Description of return format]
- `success`: Boolean indicating workflow success
- `data`: [Description of data structure]
- `completed_steps`: Array of completed step information
- `failed_steps`: Array of failed step information (if any)

**Error Handling**:
- [Error type 1]: [Recovery strategy]
- [Error type 2]: [Recovery strategy]

[IF OAUTH IS USED]:
## Authentication Requirements

This server requires OAuth authentication with [Service Name].

**Authentication Flow**:
1. Check authentication status: Use `oauth_status` tool with userId
2. If not authenticated: Use `initiate_oauth_flow` tool
3. Complete OAuth through returned URL
4. Execute workflows with authenticated context

**Token Management**:
- Access tokens are automatically refreshed
- Tokens are securely stored in encrypted storage
- Re-authentication required if refresh token expires

**Troubleshooting Authentication**:
- **401 Unauthorized**: Token expired or invalid - re-authenticate
- **403 Forbidden**: Insufficient scopes - check required scopes
- **Token refresh failed**: Re-authenticate from step 1

## Usage Guidelines

**When to use workflows vs tools**:
- **Use workflows for**: Multi-step processes, state management, complex business logic
- **Use tools for**: Simple operations, direct queries, validations

**Best Practices**:
- Always validate parameters before execution
- Check authentication status before OAuth-required operations  
- Review workflow results for partial failures in `completed_steps` and `failed_steps`
- Use appropriate error recovery strategies based on error type
- For long-running workflows, inform the user about expected duration

## Common Issues and Solutions

[BASED ON THE API AND WORKFLOWS, ADD COMMON ISSUES]:

**Issue**: [Common problem]
**Solution**: [How to resolve]

**Issue**: [Another common problem]
**Solution**: [How to resolve]
```

---

## Phase 6: Project Configuration Files

### deno.jsonc Generation

```json
{
  "name": "[project-name]",
  "version": "1.0.0",
  "imports": {
    "@beyondbetter/bb-mcp-server": "jsr:@beyondbetter/bb-mcp-server@^0.1.0",
    "@std/assert": "jsr:@std/assert@^1.0.0"
  },
  "tasks": {
    "start": "deno run --allow-all --unstable-kv main.ts",
    "dev": "deno run --allow-all --unstable-kv --watch main.ts",
    "test": "deno test --allow-all tests/"
  },
  "compilerOptions": {
    "strict": true,
    "lib": ["deno.window", "deno.unstable"]
  }
}
```

### .gitignore Generation

```
# Environment files
.env

# Deno KV database
/data/
*.db
*.db-shm
*.db-wal

# Logs
logs/
*.log

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Build artifacts
dist/
build/

# Dependencies cache
node_modules/
```

---

## Phase 7: Setup Instructions for User

### Generate Setup Guide

After creating all files, provide the user with clear setup instructions:

```
TELL THE USER:

I've created your MCP server with the following structure:

[List all files created]

To set up and run your server:

1. Install Deno (if not already installed):
   curl -fsSL https://deno.land/install.sh | sh

2. Create your environment file:
   cp .env.example .env
   
3. Edit .env and fill in the required values:
   [List required environment variables from checklist]
   
   [IF OAUTH]: 
   IMPORTANT: You'll need to obtain OAuth credentials from [Service]:
   - Go to [Service Developer Portal URL]
   - Create a new application
   - Copy the Client ID and Client Secret to your .env file
   - Set the redirect URI to: [REDIRECT_URI]

4. Run the server:
   deno task start
   
5. [IF HTTP TRANSPORT]: The server is now running at http://localhost:[PORT]
   [IF STDIO TRANSPORT]: The server is ready for STDIO connections

6. Test the server:
   [IF HTTP TRANSPORT]:
   - Visit http://localhost:[PORT]/health for health check
   - Use MCP Inspector: npm install -g @modelcontextprotocol/inspector
   
   [IF STDIO TRANSPORT]:
   - Configure in Claude Desktop:
     Edit ~/Library/Application Support/Claude/claude_desktop_config.json
     Add:
     {
       "mcpServers": {
         "[server-name]": {
           "command": "deno",
           "args": ["run", "--allow-all", "--unstable-kv", "[/path/to/main.ts]"]
         }
       }
     }

[IF OAUTH IS USED]:
7. Complete OAuth authentication:
   - Use the `initiate_oauth_flow` tool with your userId
   - Follow the returned URL to authorize
   - Return to the application to complete authentication

Your MCP server is now ready to use!

[IF WORKFLOWS CREATED]:
Available workflows:
[List workflows with brief descriptions]

[IF TOOLS CREATED]:
Available tools:
[List tools with brief descriptions]
```

---

## Phase 8: Validation and Testing Guidance

### Validation Checklist

Before considering the implementation complete, verify:

```
VALIDATION CHECKLIST:

[ ] All files created:
    [ ] main.ts
    [ ] deno.jsonc
    [ ] .env.example
    [ ] .gitignore
    [ ] mcp_server_instructions.md
    [ ] Plugin files
    [ ] Workflow files (if applicable)
    [ ] OAuth consumer (if applicable)
    [ ] API client (if applicable)
    [ ] Custom dependencies (if applicable)

[ ] Code quality:
    [ ] All inputSchema use plain object (not z.object() wrapper)
    [ ] All workflows have proper error handling
    [ ] All workflows track steps and failed steps
    [ ] All tools have clear descriptions
    [ ] All parameters have .describe() calls
    
[ ] Configuration:
    [ ] .env.example has all required variables
    [ ] Environment variables documented
    [ ] Transport type correctly configured
    [ ] OAuth settings correct (if applicable)
    
[ ] Documentation:
    [ ] MCP server instructions complete
    [ ] All tools documented
    [ ] All workflows documented
    [ ] Setup instructions provided
    [ ] Authentication flow documented (if OAuth)
```

### Testing Recommendations

Guide the user on testing:

```
TELL THE USER:

To test your MCP server:

1. Basic functionality test:
   - Start the server: deno task start
   - Check for errors in console output
   - [IF HTTP]: Visit health endpoint

2. Tool testing:
   [FOR EACH TOOL]:
   - Test [tool_name] with: [example parameters]
   - Expected result: [description]

3. Workflow testing:
   [FOR EACH WORKFLOW]:
   - Test [workflow_name] with: [example parameters]
   - Expected steps: [list steps]
   - Expected result: [description]

[IF OAUTH]:
4. OAuth testing:
   - Use oauth_status to check initial state
   - Use initiate_oauth_flow to start authentication
   - Complete OAuth flow in browser
   - Verify token storage
   - Test workflow with authenticated context
   - Test token refresh (wait for expiration or force)

5. Error handling testing:
   - Test with invalid parameters
   - Test with missing required parameters
   - [IF OAUTH]: Test with expired token
   - Verify error messages are clear
```

---

## Common Issues and Troubleshooting

### Issue Resolution Framework

When the user reports issues, follow this diagnostic process:

#### Issue: Server Won't Start

```
ASK THE USER:
- What error message do you see?
- Did you create the .env file?
- Did you run: deno task start
- Are you using Deno 2.5.0 or later? (check with: deno --version)

COMMON CAUSES:
- Missing .env file → Guide to create from .env.example
- Wrong Deno version → Guide to update Deno
- Port already in use → Change HTTP_PORT in .env
- Missing permissions → Ensure using --allow-all flag
```

#### Issue: Plugin Not Loading

```
ASK THE USER:
- What is the plugin file name?
- Where is it located?
- Any error messages in console?

COMMON CAUSES:
- Wrong file naming → Must be *Plugin.ts, plugin.ts, or *.plugin.ts
- Wrong export format → Must export default or named 'plugin'
- Wrong directory → Must be in PLUGINS_DISCOVERY_PATHS
- Syntax error → Check console for TypeScript errors
```

#### Issue: OAuth Not Working

```
ASK THE USER:
- What step of OAuth is failing?
- What error message do you see?
- Did you configure all OAuth environment variables?
- Does your redirect URI match the one in the OAuth provider settings?

COMMON CAUSES:
- Redirect URI mismatch → Must match exactly in both places
- Invalid credentials → Verify client ID and secret
- Wrong OAuth URLs → Check API documentation for correct endpoints
- Missing scopes → Add required scopes to configuration
- CORS issues → If using http transport, check CORS configuration
```

#### Issue: Workflow Execution Fails

```
ASK THE USER:
- What workflow is failing?
- What parameters did you provide?
- What error message appears in failed_steps?
- At what step does it fail?

COMMON CAUSES:
- Invalid parameters → Check parameter schema and types
- Missing authentication → Verify OAuth if required
- API errors → Check external API status and credentials
- Timeout → Increase API_TIMEOUT setting
- Rate limiting → Implement backoff or reduce request frequency
```

---

## Summary: Your Implementation Process

### Step-by-Step Workflow

1. **Phase 1: Discovery**
   - Conduct thorough requirements interview
   - Ask about tools, workflows, APIs, OAuth needs
   - Determine appropriate pattern (1-4)
   - Get all necessary API credentials and configuration

2. **Phase 2: Architecture**
   - Present recommended pattern to user
   - List all files to be created
   - Confirm architecture before implementation

3. **Phase 3: Configuration**
   - Create environment variables checklist
   - Generate .env.example with placeholders
   - Document all required and optional variables
   - Guide user through obtaining OAuth credentials if needed

4. **Phase 4: Implementation**
   - Create all project files
   - Implement tools and/or workflows
   - Create OAuth consumer and API client if needed
   - Follow all critical implementation rules
   - Generate proper error handling

5. **Phase 5: Documentation**
   - Create comprehensive MCP server instructions
   - Document all tools and workflows
   - Include authentication flow if OAuth
   - Add troubleshooting guidance

6. **Phase 6: Configuration Files**
   - Generate deno.jsonc
   - Generate .gitignore
   - Create any additional config files needed

7. **Phase 7: Setup Instructions**
   - Provide clear, step-by-step setup guide
   - Include OAuth setup if applicable
   - Explain how to test the server
   - Guide on Claude Desktop configuration if STDIO

8. **Phase 8: Validation**
   - Run through validation checklist
   - Provide testing recommendations
   - Be available for troubleshooting

### Key Principles

1. **Always interview first** - Never assume requirements
2. **Recommend simplest pattern** - Start with Pattern 1 unless user needs more
3. **Complete implementations** - No placeholders, all code should work
4. **Clear documentation** - MCP instructions should be comprehensive
5. **Proper error handling** - All workflows need try-catch and failed_steps
6. **Configuration checklist** - Ensure all required environment variables are documented
7. **User guidance** - Provide clear setup and testing instructions

### Quality Standards

- ✅ All code follows critical implementation rules
- ✅ All inputSchema use plain objects with Zod values
- ✅ All workflows have comprehensive error handling
- ✅ All tools and workflows have clear descriptions
- ✅ MCP server instructions are complete and accurate
- ✅ Environment configuration is documented with checklist
- ✅ Setup instructions are clear and actionable
- ✅ OAuth flow is properly implemented if needed

---

**You are now ready to help developers build production-ready MCP servers. Start every interaction with the discovery phase, understand requirements fully, recommend the appropriate pattern, and implement complete, working solutions following all guidelines above.**