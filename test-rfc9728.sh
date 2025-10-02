#!/bin/bash

echo "Testing RFC 9728 Resource-Specific Metadata Endpoints"
echo "====================================================="
echo ""

echo "1. Testing general oauth-protected-resource endpoint:"
curl -s http://localhost:3001/.well-known/oauth-protected-resource | jq -r '.resource // "NO RESOURCE FIELD"'
echo ""

echo "2. Testing resource-specific endpoint for /mcp:"
curl -s http://localhost:3001/.well-known/oauth-protected-resource/mcp | jq -r '.resource // "NO RESOURCE FIELD"'
echo ""

echo "3. Full metadata for /mcp:"
curl -s http://localhost:3001/.well-known/oauth-protected-resource/mcp | jq .
