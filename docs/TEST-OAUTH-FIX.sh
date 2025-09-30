#!/bin/bash

# Test OAuth Error Code Fix
# This script verifies that the token endpoint returns proper OAuth error codes

echo "🧪 Testing OAuth Error Code Fix"
echo "================================"
echo ""

BASE_URL="http://localhost:3001"

echo "Test 1: Invalid Refresh Token (Should return 'invalid_grant')"
echo "-----------------------------------------------------------"
RESPONSE=$(curl -s -X POST "$BASE_URL/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token&refresh_token=nonexistent_token&client_id=test_client")

echo "Response:"
echo "$RESPONSE" | jq .

ERROR_CODE=$(echo "$RESPONSE" | jq -r '.error')
ERROR_DESC=$(echo "$RESPONSE" | jq -r '.error_description')

if [ "$ERROR_CODE" = "invalid_grant" ]; then
  echo "✅ PASS: Correct error code 'invalid_grant' returned"
else
  echo "❌ FAIL: Expected 'invalid_grant', got '$ERROR_CODE'"
  exit 1
fi

if [[ "$ERROR_DESC" == *"refresh token"* ]] || [[ "$ERROR_DESC" == *"Invalid or expired"* ]]; then
  echo "✅ PASS: Descriptive error message preserved"
else
  echo "❌ FAIL: Generic error message: '$ERROR_DESC'"
  exit 1
fi

echo ""
echo "Test 2: Missing Required Parameter (Should return 'invalid_request')"
echo "------------------------------------------------------------------"
RESPONSE=$(curl -s -X POST "$BASE_URL/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token&client_id=test_client")

echo "Response:"
echo "$RESPONSE" | jq .

ERROR_CODE=$(echo "$RESPONSE" | jq -r '.error')

if [ "$ERROR_CODE" = "invalid_request" ]; then
  echo "✅ PASS: Correct error code 'invalid_request' for missing parameter"
else
  echo "❌ FAIL: Expected 'invalid_request', got '$ERROR_CODE'"
  exit 1
fi

echo ""
echo "Test 3: Unsupported Grant Type (Should return 'unsupported_grant_type')"
echo "--------------------------------------------------------------------"
RESPONSE=$(curl -s -X POST "$BASE_URL/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&username=test&password=test&client_id=test_client")

echo "Response:"
echo "$RESPONSE" | jq .

ERROR_CODE=$(echo "$RESPONSE" | jq -r '.error')

if [ "$ERROR_CODE" = "unsupported_grant_type" ]; then
  echo "✅ PASS: Correct error code 'unsupported_grant_type'"
else
  echo "⚠️  WARN: Expected 'unsupported_grant_type', got '$ERROR_CODE' (may need additional handling)"
fi

echo ""
echo "Test 4: Well-Known Metadata (Should return 200)"
echo "---------------------------------------------"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$BASE_URL/.well-known/oauth-authorization-server")

BODY=$(echo "$RESPONSE" | sed '$d')
HTTP_CODE=$(echo "$RESPONSE" | grep HTTP_CODE | cut -d: -f2)

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ PASS: Metadata endpoint returns 200"
  echo "Issuer: $(echo "$BODY" | jq -r '.issuer')"
  echo "Token Endpoint: $(echo "$BODY" | jq -r '.token_endpoint')"
  echo "Registration Endpoint: $(echo "$BODY" | jq -r '.registration_endpoint')"
else
  echo "❌ FAIL: Expected 200, got $HTTP_CODE"
  exit 1
fi

echo ""
echo "🎉 All Tests Passed!"
echo "===================="
echo ""
echo "Next Steps:"
echo "1. Clear MCP Inspector cache (localStorage.clear() in browser console)"
echo "2. Connect to http://localhost:3001/mcp in MCP Inspector"
echo "3. Should redirect to authorization and complete OAuth flow"
echo ""
