# Security Policy

## Reporting Security Vulnerabilities

If you discover a security vulnerability in BMS POS, please report it by emailing the maintainers directly. Do not open a public issue for security vulnerabilities.

## Security Features

### Authentication and Access Control

**PIN Security**
- Employee PINs are hashed using BCrypt with a work factor of 12
- Legacy plaintext PINs are automatically upgraded to hashed versions on first login
- PIN verification uses constant-time comparison to prevent timing attacks

**Role-Based Access Control**
- Employee and Manager roles with distinct permission levels
- Session-based authentication with automatic logout
- Failed login attempt tracking and account lockout protection

### Data Protection

**Database Security**
- Database credentials stored in environment variables, not in source code
- Connection strings use parameterized queries to prevent SQL injection
- Support for PostgreSQL/Supabase with SSL connections

**Environment Configuration**
- Sensitive configuration values isolated in `.env` file
- `.env` file excluded from version control via `.gitignore`
- Template `.env.example` provided for deployment setup

### Session Management

- Secure session token generation and validation
- Configurable auto-logout after inactivity period
- Session data includes user context for audit trails

## Environment Variables

Required environment variables for deployment:

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
2. Configure all required environment variables
3. Ensure `.env` file permissions are restricted (chmod 600 on Linux/Mac)
4. Never commit `.env` file to version control

### Production Recommendations

- Use strong, unique passwords for all database accounts
- Enable SSL/TLS for database connections when available
- Regularly update dependencies to patch security vulnerabilities
- Configure automatic backups for disaster recovery
- Restrict physical access to devices running the POS system
- Use hardware security features when available (TPM, secure boot)

## Known Limitations

- Desktop application security model assumes physical device security
- No built-in network encryption between Electron frontend and .NET backend (relies on localhost)
- Session tokens stored in browser localStorage (appropriate for desktop kiosk mode)
- Admin panel accessible to users with Manager role

## Security Roadmap

Future security improvements planned:

- Two-factor authentication for Manager accounts
- Enhanced audit logging with tamper protection
- Database encryption at rest
- Application code signing
- Automated security scanning in CI/CD pipeline

## Compliance

This software is designed for small to medium business point-of-sale operations. Organizations with specific compliance requirements (PCI-DSS, HIPAA, etc.) should conduct their own security audit and implement additional controls as needed.
