# Instructions Loading System Implementation

## Overview

Implemented a flexible, configurable instructions loading mechanism for the BB MCP Server that supports multiple input sources with proper fallback handling and clear separation of concerns.

## Key Features

✅ **Multiple Input Sources**: Support for environment variables, file paths, and default files  
✅ **Priority-based Loading**: Clear priority order with proper fallback chain  
✅ **Generic Fallback**: Built-in generic instructions focused on workflow execution  
✅ **Comprehensive Validation**: Instructions validation with proper error handling  
✅ **Seamless Integration**: Integrated into BeyondMcpServer initialization process  
✅ **Type Safety**: Full TypeScript support with proper type definitions  
✅ **Test Coverage**: Complete unit tests for all functionality  

## Files Created/Modified

### New Files

1. **`src/lib/instructions.ts`** - Generic fallback instructions
   - Comprehensive workflow-focused instructions
   - Details about execute_workflow and get_schema_for_workflow tools
   - Generic patterns applicable to any MCP server using bb-mcp-server

2. **`src/lib/utils/InstructionsLoader.ts`** - Instructions loading utility
   - Flexible loading with 4 fallback strategies
   - Validation and debugging utilities
   - Type-safe interfaces and error handling

3. **`tests/unit/utils/InstructionsLoader.test.ts`** - Comprehensive test suite
   - Tests for all loading strategies
   - Validation testing
   - Error handling verification

4. **`examples/instructions-loading-example.ts`** - Working demonstration
   - Shows all loading strategies in action
   - Validation examples
   - Usage guidance

### Modified Files

1. **`src/lib/server/BeyondMcpServer.ts`**
   - Added instructions loading during initialization
   - Integration with new InstructionsLoader utility
   - Source tracking for debugging

2. **`src/lib/server/DependencyHelpers.ts`**
   - Updated to use new `MCP_SERVER_INSTRUCTIONS` config name
   - Maintains backward compatibility patterns

## Loading Strategy (Priority Order)

### 1. Direct Configuration String (Highest Priority)
- **Environment Variable**: `MCP_SERVER_INSTRUCTIONS`
- **Use Case**: Direct instructions content in environment variable
- **Priority**: Highest - overrides all other sources

### 2. File Path Loading
- **Environment Variable**: `MCP_INSTRUCTIONS_FILE`
- **Use Case**: Path to custom instructions file
- **Priority**: Second - used when no direct config provided
- **Features**: Supports relative and absolute paths

### 3. Default File Loading
- **Default Path**: `mcp_server_instructions.md` in project root
- **Use Case**: Standard location for project-specific instructions
- **Priority**: Third - used when no config or file path specified
- **Note**: Follows convention from actionstep-mcp-server-legacy

### 4. Embedded Fallback (Final Fallback)
- **Source**: `DEFAULT_INSTRUCTIONS` constant in `src/lib/instructions.ts`
- **Use Case**: Ensures server always has instructions, even if no other sources available
- **Priority**: Lowest - guaranteed fallback
- **Content**: Generic workflow-focused instructions

## Environment Variables

### New Variables
- `MCP_SERVER_INSTRUCTIONS`: Direct instructions content (replaces old `INSTRUCTIONS`)
- `MCP_INSTRUCTIONS_FILE`: Path to instructions file

### Migration Guide
Old variable `INSTRUCTIONS` should be renamed to `MCP_SERVER_INSTRUCTIONS`:

```bash
# Old
INSTRUCTIONS="Your instructions here"

# New
MCP_SERVER_INSTRUCTIONS="Your instructions here"
```

## API Reference

### Core Functions

#### `loadInstructions(options: InstructionsLoaderOptions): Promise<string>`
Loads instructions using the priority-based strategy.

**Options:**
- `logger: Logger` - Logger instance for debug output
- `instructionsConfig?: string` - Direct instructions from config
- `instructionsFilePath?: string` - Path to instructions file
- `defaultFileName?: string` - Default file name (default: 'mcp_server_instructions.md')
- `basePath?: string` - Base path for resolving relative paths

#### `validateInstructions(instructions: string, logger?: Logger): boolean`
Validates loaded instructions meet minimum requirements.

**Validation Criteria:**
- Minimum length: 100 characters
- Must contain either "MCP Server" or "workflow"

#### `getInstructionsLoadingSummary(options: InstructionsLoaderOptions): InstructionsLoadingSummary`
Returns summary of loading configuration for debugging.

## Integration Points

### BeyondMcpServer Integration
Instructions are loaded during server initialization:

```typescript
// In BeyondMcpServer.initialize()
const instructions = await loadInstructions({
  logger: this.logger,
  instructionsConfig: this.configManager.get('MCP_SERVER_INSTRUCTIONS'),
  instructionsFilePath: this.configManager.get('MCP_INSTRUCTIONS_FILE'),
  defaultFileName: 'mcp_server_instructions.md',
  basePath: Deno.cwd(),
});
```

### Error Handling
- Graceful fallback through priority chain
- Detailed logging at each step
- Never fails - always returns valid instructions
- Comprehensive error context for debugging

## Generic Instructions Content

The fallback instructions in `src/lib/instructions.ts` include:

- **Workflow System Overview**: Comprehensive guide to workflow execution
- **Core Tools Documentation**: 
  - `execute_workflow` - Primary workflow execution tool
  - `get_schema_for_workflow` - Essential schema discovery tool
  - `get_server_status` - Server health and workflow discovery
- **Best Practices**: Workflow discovery patterns and error handling
- **Authentication**: User context requirements and security
- **Error Troubleshooting**: Common issues and resolution steps

## Usage Examples

### Environment Variable Setup
```bash
# Option 1: Direct instructions
MCP_SERVER_INSTRUCTIONS="Custom instructions for my server..."

# Option 2: File path
MCP_INSTRUCTIONS_FILE="./config/custom-instructions.md"

# Option 3: Use default file (no env vars needed)
# Just place instructions in: ./mcp_server_instructions.md
```

### Programmatic Usage
```typescript
import { loadInstructions } from '@beyondbetter/bb-mcp-server/utils';

const instructions = await loadInstructions({
  logger: myLogger,
  instructionsConfig: process.env.MCP_SERVER_INSTRUCTIONS,
  instructionsFilePath: process.env.MCP_INSTRUCTIONS_FILE,
});
```

## Testing

Comprehensive test suite covers:
- ✅ All loading strategies
- ✅ Priority order enforcement  
- ✅ File I/O error handling
- ✅ Validation logic
- ✅ Edge cases (empty files, whitespace, etc.)
- ✅ Debugging utilities

Run tests with:
```bash
deno task tool:test tests/unit/utils/InstructionsLoader.test.ts
```

## Benefits

1. **Flexibility**: Multiple ways to provide instructions based on deployment needs
2. **Reliability**: Always has fallback instructions, never fails
3. **Developer Experience**: Clear priority, good logging, comprehensive validation
4. **Maintainability**: Clean separation of concerns, well-tested
5. **Compatibility**: Follows established patterns from actionstep-mcp-server-legacy
6. **Documentation**: Self-documenting code with comprehensive examples

## Future Enhancements

Possible future improvements:
- Remote URL loading support
- Template interpolation in instructions
- Instruction caching and hot-reloading
- Multiple instruction files merging
- Per-workflow custom instructions

## Migration Impact

- **Breaking Change**: `INSTRUCTIONS` environment variable renamed to `MCP_SERVER_INSTRUCTIONS`
- **Backward Compatibility**: Old patterns still work, just need variable rename
- **Enhanced Functionality**: More loading options without breaking existing usage
- **Better Error Handling**: More resilient instruction loading

This implementation provides a robust, flexible foundation for instruction management across all BB MCP servers while maintaining clean architecture and comprehensive error handling.