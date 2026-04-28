#!/usr/bin/env bash
# generate-types.sh
# Generates TypeScript types from the .NET API's OpenAPI spec.
#
# Usage:
#   ./scripts/generate-types.sh
#
# Requirements:
#   dotnet tool restore   (installs swashbuckle CLI from .config/dotnet-tools.json)
#   npm ci                (installs openapi-typescript)
#
# What it does:
#   1. Builds the API project
#   2. Exports the OpenAPI JSON from the built DLL (no running server needed)
#   3. Runs openapi-typescript to emit src/frontend/types/generated/api.ts
#   4. Runs tsc --noEmit to verify the generated types compile cleanly

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_PROJECT="$REPO_ROOT/BMS_POS_API/BMS_POS_API.csproj"
API_DLL="$REPO_ROOT/BMS_POS_API/bin/Release/net8.0/BMS_POS_API.dll"
OPENAPI_OUT="$REPO_ROOT/openapi.json"
TS_OUT="$REPO_ROOT/src/frontend/types/generated/api.ts"

echo "==> Building API..."
dotnet build "$API_PROJECT" --configuration Release --nologo -q

echo "==> Exporting OpenAPI spec..."
# Swagger CLI reads the DLL and serializes the spec without booting the app
dotnet swagger tofile --output "$OPENAPI_OUT" "$API_DLL" v1

echo "==> Generating TypeScript types..."
mkdir -p "$(dirname "$TS_OUT")"
npx openapi-typescript "$OPENAPI_OUT" --output "$TS_OUT"

echo "==> Type-checking generated output..."
npx tsc --noEmit

echo ""
echo "Done. Generated: $TS_OUT"
echo "Commit this file to keep types in sync with the API."
echo "If tsc --noEmit fails after regenerating, the API broke a contract used by the frontend."
