# Step-by-Step Instructions: 1-Simple Example

This guide walks you through setting up and running the simple MCP server example. Perfect for beginners who want to understand the basics without complexity.

## 📋 Prerequisites

### Required Software
- **Deno 1.37+**: [Install Deno](https://deno.land/manual/getting_started/installation)
- **Text Editor**: VS Code, Vim, or your preferred editor
- **Terminal/Command Line**: Bash, Zsh, PowerShell, or similar

### Optional Tools
- **Git**: For version control and collaboration
- **Beyond Better CLI**: For testing MCP client integration
- **Postman/curl**: For HTTP transport testing

### Knowledge Prerequisites
- Basic TypeScript/JavaScript understanding
- Command line familiarity
- Basic understanding of environment variables

## 🚀 Setup Process

### Step 1: Navigate to Example Directory
```bash
# From the bb-mcp-server root directory
cd examples/1-simple

# Verify you're in the right place
ls -la
# You should see: main.ts, src/, README.md, etc.
```

### Step 2: Environment Configuration
```bash
# Copy the environment template
cp .env.example .env

# View the configuration options
cat .env.example
```

**Key Configuration Options**:
- `MCP_TRANSPORT`: Choose 'stdio' (default) or 'http'
- `LOG_LEVEL`: Set to 'debug' for learning, 'info' for normal use
- `PLUGINS_DISCOVERY_PATHS`: Where to find plugins (default: ./src/plugins)

**For Learning** (recommended settings in `.env`):
```bash
# Enable debug logging to see what's happening
LOG_LEVEL=debug
LOG_FORMAT=text

# Use STDIO transport for MCP client integration
MCP_TRANSPORT=stdio

# Enable development mode
DEV_MODE=true
```

### Step 3: Understand the Code Structure
```bash
# Explore the project structure
tree -I 'node_modules|.git'
# or
find . -type f -name '*.ts' -o -name '*.md' -o -name '*.json*' | sort
```

**Key Files**:
- `main.ts`: Entry point with minimal AppServer setup
- `src/plugins/SimplePlugin.ts`: Self-contained plugin with 3 tools
- `.env.example`: Configuration template
- `deno.jsonc`: Deno configuration and tasks

### Step 4: Examine the Plugin Code
```bash
# Look at the main entry point
cat main.ts

# Examine the plugin structure
cat src/plugins/SimplePlugin.ts
```

**Understanding the Plugin**:
1. **Plugin Definition**: Metadata and initialization
2. **Tool Registration**: Three utility tools
3. **Parameter Validation**: Zod schemas for type safety
4. **Error Handling**: Consistent error patterns
5. **Response Formatting**: MCP-compliant responses

## ⚡ Running the Example

### Option 1: STDIO Transport (Recommended for Learning)
```bash
# Run with default settings
deno run --allow-all main.ts

# OR use the task shortcut
deno task start

# OR with debug logging
deno task start:debug
```

**What You'll See**:
```
🔧 Initializing SimplePlugin...
✅ SimplePlugin initialized with 3 tools
🎉 Simple MCP Server started successfully!
📝 Available tools: current_datetime, get_system_info, validate_json
🔄 Transport: stdio
```

**STDIO Mode**: The server reads from stdin and writes to stdout, following the MCP protocol. It's ready for MCP client integration.

### Option 2: HTTP Transport (For Testing and Debugging)
```bash
# Run with HTTP transport
MCP_TRANSPORT=http deno run --allow-all main.ts

# OR use the task shortcut
deno task start:http
```

**What You'll See**:
```
🔧 Initializing SimplePlugin...
✅ SimplePlugin initialized with 3 tools
🎉 Simple MCP Server started successfully!
📝 Available tools: current_datetime, get_system_info, validate_json
🔄 Transport: http
🌐 HTTP server listening on http://localhost:3000
```

**HTTP Mode**: The server runs as a web service. You can:
- View server status at: `http://localhost:3000`
- Test tools via HTTP requests
- Use browser dev tools for debugging

## 🧪 Testing the Tools

### Using HTTP Transport (Easiest for Beginners)

1. **Start the server in HTTP mode**:
   ```bash
   deno task start:http
   ```

2. **Test the current_datetime tool**:
   ```bash
   curl -X POST http://localhost:3000/tools/current_datetime \
     -H "Content-Type: application/json" \
     -d '{}'
   ```

   **With parameters**:
   ```bash
   curl -X POST http://localhost:3000/tools/current_datetime \
     -H "Content-Type: application/json" \
     -d '{"format": "human", "timezone": "America/New_York"}'
   ```

3. **Test the get_system_info tool**:
   ```bash
   curl -X POST http://localhost:3000/tools/get_system_info \
     -H "Content-Type: application/json" \
     -d '{"detail": "detailed", "includeMemory": true}'
   ```

4. **Test the validate_json tool**:
   ```bash
   curl -X POST http://localhost:3000/tools/validate_json \
     -H "Content-Type: application/json" \
     -d '{"json_string": "{\"name\": \"test\", \"value\": 42}"}'
   ```

   **Test with invalid JSON**:
   ```bash
   curl -X POST http://localhost:3000/tools/validate_json \
     -H "Content-Type: application/json" \
     -d '{"json_string": "{invalid json}"}'
   ```

### Using STDIO Transport (MCP Client Integration)

For STDIO testing, you'll need an MCP client. Here's a simple test:

```bash
# Start the server
deno run --allow-all main.ts

# In another terminal, send MCP protocol messages
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}' | deno run --allow-all main.ts
```

### Running Demonstration Tests

```bash
# Run all tests
deno test --allow-all src/tests/

# Run specific tool tests
deno test --allow-all src/tests/tools/

# Run in watch mode for development
deno task test:watch
```

## 🐛 Debugging and Troubleshooting

### Enable Debug Logging
```bash
# Set debug level in .env
LOG_LEVEL=debug

# Or run with debug flag
LOG_LEVEL=debug deno task start
```

**Debug Output Shows**:
- Plugin discovery and loading
- Tool registration process
- Request/response details
- Error stack traces
- Performance metrics

### Common Issues and Solutions

#### 1. Permission Errors
```bash
# Error: Permission denied
# Solution: Use --allow-all flag
deno run --allow-all main.ts

# Or specific permissions
deno run --allow-net --allow-read --allow-write --allow-env main.ts
```

#### 2. Plugin Not Found
```bash
# Error: Plugin discovery failed
# Check: Plugin discovery path in .env
PLUGINS_DISCOVERY_PATHS=./src/plugins

# Verify: Plugin file exists
ls -la src/plugins/SimplePlugin.ts

# Check: Plugin syntax
deno check src/plugins/SimplePlugin.ts
```

#### 3. Port Already in Use (HTTP Mode)
```bash
# Error: Address already in use
# Solution: Use different port
HTTP_PORT=3001 deno task start:http

# Or find what's using the port
lsof -i :3000
```

#### 4. Tool Parameter Validation Errors
```bash
# Error: Parameter validation failed
# Check: Parameter names and types match Zod schema
# Example: current_datetime expects 'timezone', not 'tz'

# Debug: Enable debug logging to see validation details
LOG_LEVEL=debug
```

#### 5. Environment Variable Issues
```bash
# Error: Configuration not loaded
# Check: .env file exists and is readable
ls -la .env
cat .env

# Verify: Environment variables are loaded
echo $MCP_TRANSPORT
```

### Debugging Workflow

1. **Enable debug logging**: `LOG_LEVEL=debug`
2. **Check file permissions**: `ls -la`
3. **Verify syntax**: `deno check main.ts`
4. **Test configuration**: `deno task start:debug`
5. **Isolate issues**: Test one tool at a time
6. **Check logs**: Look for error messages and stack traces

## 📚 Learning Activities

### Activity 1: Explore Tool Parameters

1. **Test different datetime formats**:
   ```bash
   # ISO format (default)
   {"format": "iso"}
   
   # Human readable
   {"format": "human"}
   
   # Unix timestamp
   {"format": "unix"}
   
   # Different timezones
   {"timezone": "UTC"}
   {"timezone": "America/Los_Angeles"}
   {"timezone": "Europe/London"}
   ```

2. **Explore system info levels**:
   ```bash
   # Basic info
   {"detail": "basic"}
   
   # Detailed info
   {"detail": "detailed", "includeMemory": true, "includeEnvironment": true}
   ```

3. **Test JSON validation**:
   ```bash
   # Valid JSON
   {"json_string": "{\"valid\": true}"}
   
   # Invalid JSON
   {"json_string": "{invalid}"}
   
   # Complex nested JSON
   {"json_string": "{\"user\": {\"name\": \"test\", \"prefs\": [1,2,3]}}"}
   ```

### Activity 2: Modify the Plugin

1. **Add a new tool** (e.g., random number generator):
   ```typescript
   function registerRandomNumberTool(registry: ToolRegistry): void {
     const parameterSchema = z.object({
       min: z.number().default(0),
       max: z.number().default(100),
     });
     
     registry.registerTool('random_number', {
       title: 'Random Number Generator',
       description: 'Generate a random number within specified range',
       category: 'utility',
       tags: ['math', 'random'],
       inputSchema: parameterSchema,
     }, async (args) => {
       const params = parameterSchema.parse(args);
       const randomNum = Math.floor(Math.random() * (params.max - params.min + 1)) + params.min;
       
       return {
         content: [{
           type: 'text',
           text: JSON.stringify({ number: randomNum, min: params.min, max: params.max }),
         }]
       };
     });
   }
   ```

2. **Register the new tool** in the plugin initialization

3. **Test the new tool**:
   ```bash
   deno task start:http
   curl -X POST http://localhost:3000/tools/random_number \
     -H "Content-Type: application/json" \
     -d '{"min": 1, "max": 10}'
   ```

### Activity 3: Configuration Experiments

1. **Try different log levels**:
   - `LOG_LEVEL=error` (minimal logging)
   - `LOG_LEVEL=debug` (verbose logging)
   - `LOG_FORMAT=json` (structured logs)

2. **Switch between transports**:
   - Test STDIO mode: `MCP_TRANSPORT=stdio`
   - Test HTTP mode: `MCP_TRANSPORT=http`
   - Compare behavior and use cases

3. **Plugin configuration**:
   - Try disabling autoload: `PLUGINS_AUTOLOAD=false`
   - Experiment with allow/block lists
   - Test different discovery paths

## 🎓 What's Next?

After completing this example:

### Immediate Next Steps
1. **Review the code**: Understand every line in main.ts and SimplePlugin.ts
2. **Run all tests**: See the testing patterns in action
3. **Modify tools**: Add parameters, change behavior, create new tools
4. **Experiment**: Try different configurations and observe behavior

### Progression Path
1. **Master this example**: Complete all activities and exercises
2. **Move to 2-plugin-workflows**: Learn about multi-step processes
3. **Study 3-plugin-api-auth**: Understand external API integration
4. **Explore 4-manual-deps**: Gain complete infrastructure control

### Key Concepts to Internalize
- **Plugin Architecture**: Self-contained, discoverable plugins
- **Tool Development**: Parameter validation, error handling, response formatting
- **Configuration Management**: Environment-driven, flexible configuration
- **Testing Patterns**: How to test tools and plugins effectively
- **MCP Protocol**: Understanding the underlying communication protocol

---

**🎯 Success Criteria**: You've successfully completed this example when you can:
- Run the server in both STDIO and HTTP modes
- Test all three tools with various parameters
- Debug issues using log output and error messages
- Modify the plugin to add new functionality
- Explain how plugin discovery and tool registration work
- Configure the server for different use cases

**Ready for the next level?** Proceed to [2-plugin-workflows](../2-plugin-workflows/) to learn about multi-step processes!