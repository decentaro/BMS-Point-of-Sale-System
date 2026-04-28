#!/usr/bin/env bash
set -euo pipefail

dotnet test BMS_POS_API.Tests/BMS_POS_API.Tests.csproj \
  --filter "FullyQualifiedName~Integration.Postgres" \
  -v normal \
  --logger "console;verbosity=detailed"
