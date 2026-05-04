# Security Policy

## Reporting Security Vulnerabilities

If you discover a security vulnerability in BMS POS, please report it by emailing the maintainers directly. Do not open a public issue for security vulnerabilities.

## Security Features

### Authentication and Access Control

**PIN Security**
- Employee PINs are hashed using BCrypt (work factor 12)
- Legacy plaintext PINs are automatically upgraded to BCrypt on first login
- PIN verification uses constant-time comparison to prevent timing attacks

**JWT Tokens**
- Stateless JWT bearer tokens issued on login
- Per-token denylist — tokens are revoked immediately on logout (DB-persisted)
- Claims enforcement middleware overwrites any client-supplied role/ID headers with values from the verified JWT, so the frontend cannot escalate privileges by sending forged headers

**Role-Based Access Control**
- Three roles: **Manager**, **Cashier**, **Inventory** — each with distinct permission sets
- Managers have all permissions; other roles have explicit allow-lists
- Route-level guards on both the frontend (React) and the API (controller attributes)

**Login Lockout**
- Repeated failed PIN attempts trigger an account lockout
- Lockout state is persisted in the database and survives API restarts

**Rate Limiting**
- Auth endpoints: 10 requests / 5 minutes per IP
- Global: 300 requests / minute per IP

### Data Protection

**Database Security**
- Database credentials stored in environment variables, never in source code
- EF Core parameterised queries throughout — no raw SQL string concatenation
- PostgreSQL / Supabase with SSL connections supported

**Environment Configuration**
- All secrets isolated in `.env` (excluded from version control via `.gitignore`)
- Template `.env.example` provided for deployment setup

### Session Management

- JWT tokens with short expiry; revoked immediately on logout via denylist
- Configurable auto-logout after inactivity (default 30 minutes)
- Full audit trail — every login, sale, return, and configuration change recorded with user, timestamp, and IP

### Network Security

- CORS restricted to `localhost` only (Electron renderer origin)
- Security headers middleware applied to all responses
- API binds to localhost only — not exposed to the network by default

## Environment Variables

| Variable | Description |
|----------|-------------|
| `BMS_DB_USER` | Database username |
| `BMS_DB_PASSWORD` | Database password |
| `BMS_DB_SERVER` | Database server hostname |
| `BMS_DB_PORT` | Database port (default: 5432) |
| `BMS_DB_NAME` | Database name |

## Deployment Security

### Initial Setup

1. Copy `.env.example` to `.env`
2. Fill in all required environment variables
3. Restrict `.env` file permissions (`chmod 600` on Linux/Mac)
4. Never commit `.env` to version control

### JWT Secret

The API generates a persistent JWT signing secret on first run, stored at:
- **Linux/Mac:** `~/.config/BMS_POS/bms-jwt.secret`
- **Windows:** `%APPDATA%\BMS_POS\bms-jwt.secret`

Permissions are automatically set to owner read/write only (0600) on Unix. To rotate the secret (invalidates all active sessions), delete the file and restart the API.

### Production Recommendations

- Use strong, unique database passwords
- Enable SSL/TLS for database connections
- Keep dependencies updated
- Configure automatic database backups
- Restrict physical access to POS devices
- Use secure boot / TPM where available

## Known Limitations

- No network encryption between the Electron frontend and the .NET backend — both run on localhost, so in-transit encryption is not required, but network-exposed deployments would need a TLS proxy
- Session tokens stored in Electron's renderer localStorage (appropriate for a locked-down kiosk)
- Physical device security is assumed — a compromised device undermines all software-level controls
