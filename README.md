# BMS Point of Sale System

A full-featured Point of Sale system built with Electron, React, TypeScript, and .NET Core. Designed for retail operations with comprehensive inventory management, batch tracking, sales analytics, and returns processing.

## Screenshots

### Login Screen
![Login Screen](screenshots/login.png)
*PIN-based authentication with role selection*

### Point of Sale
![POS Interface](screenshots/pos.png)
*Product scanning, cart management, and checkout*

### Dashboard
![Dashboard](screenshots/dashboard.png)
*Sales overview and quick actions*

### Inventory Management
![Inventory](screenshots/inventory.png)
*Product catalog with batch tracking and expiration monitoring*

### Sales Reports
![Reports](screenshots/reports.png)
*Analytics and business insights*

### Manager Panel
![Manager](screenshots/manager.png)
*Employee management and system configuration*

> **Note**: Screenshots to be added. Create a `screenshots/` folder in the project root and add images with the names shown above.

## Tech Stack

### Frontend
- **React 19.1.1** with TypeScript 5.9.2
- **Vite 7.1.4** - Fast build tool with hot reload
- **Tailwind CSS 4.1.12** - Utility-first styling
- **shadcn/ui** - Pre-built components with Radix UI
- **Electron 37.3.0** - Cross-platform desktop app
- **React Router 6.30.1** - Client-side routing

### Backend
- **.NET 8.0** with ASP.NET Core
- **Entity Framework Core 9.0** - ORM with migrations
- **PostgreSQL** via Supabase (Npgsql 9.0.4)
- **Serilog 9.0** - Structured JSON logging
- **BCrypt.Net** - Secure PIN hashing
- **Swagger/OpenAPI** - API documentation

## Features

### Core POS Functionality
- **PIN-Based Authentication** - Role-based access (Manager/Cashier/Inventory)
- **Sales Processing** - Multi-item transactions with tax, discounts, and change calculation
- **Multiple Payment Methods** - Cash, Card, ETF/Digital
- **Receipt Generation** - Print or preview with configurable templates
- **Barcode Scanning** - Quick product lookup

### Inventory Management
- **Product Catalog** - Full CRUD with pricing, categories, and images
- **Batch Tracking** - Lot numbers, expiration dates, and supplier info
- **Stock Adjustments** - Manual corrections with audit trail
- **Inventory Counts** - Full, cycle, spot, and annual counts with variance tracking
- **Low Stock Alerts** - Configurable minimum stock levels
- **Expiration Tracking** - Automatic expiry status monitoring

### Returns & Refunds
- **Return Processing** - Link to original sale with reason tracking
- **Manager Approval** - Optional approval for high-value returns
- **Automatic Restocking** - Update inventory on approved returns
- **Return Reasons** - Defective, Wrong Size, Changed Mind, etc.

### Analytics & Reporting
- **Sales Summaries** - Today, week, month with trends
- **Top Products** - Best sellers by quantity and revenue
- **Payment Breakdown** - Analysis by payment method
- **Tax Reports** - Tax collected summaries
- **Employee Performance** - Sales metrics per employee

### Administration
- **Employee Management** - Add/edit/deactivate users with PIN reset
- **System Settings** - Date formats, auto-logout, payment methods
- **Tax Configuration** - Primary + optional secondary tax rates
- **Receipt Templates** - Customizable layouts and paper sizes
- **Audit Logging** - Complete user activity tracking
- **Multi-Display Support** - Configure for multiple monitors

## Project Structure

```
BMS_POS/
├── src/
│   ├── frontend/              # React + TypeScript application
│   │   ├── components/        # 25+ feature components
│   │   │   ├── Login.tsx
│   │   │   ├── POS.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Inventory.tsx
│   │   │   ├── Manager.tsx
│   │   │   ├── Returns.tsx
│   │   │   ├── Reports.tsx
│   │   │   └── ui/           # shadcn/ui components
│   │   ├── contexts/         # React Context for state
│   │   ├── utils/            # API client, session manager
│   │   └── App.tsx           # Main routing
│   │
│   └── electron/             # Electron main process
│       ├── main.js           # Multi-display support
│       └── preload.js        # IPC bridge
│
├── BMS_POS_API/              # .NET Core REST API
│   ├── Controllers/          # 11 API endpoints
│   ├── Models/               # 14 database entities
│   ├── Services/             # Business logic
│   ├── Middleware/           # Logging & error handling
│   ├── Migrations/           # EF Core migrations
│   └── Program.cs            # Auto-migration on startup
│
├── scripts/
│   └── dev.sh                # Start all services
│
├── .env                      # Environment variables (not committed)
├── .env.example              # Template for .env
└── package.json
```

## Installation & Setup

### Prerequisites
- **Node.js 18+**
- **.NET 8.0 SDK**
- **PostgreSQL 13+** or Supabase account

### 1. Clone Repository
```bash
git clone https://github.com/decentaro/BMS-Point-of-Sale-System.git
cd BMS-Point-of-Sale-System
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment

Create `.env` file from template:
```bash
cp .env.example .env
```

Edit `.env` with your database credentials:
```bash
# Database Configuration
BMS_DB_USER=your_postgres_user
BMS_DB_PASSWORD=your_password
BMS_DB_SERVER=your_supabase_host
BMS_DB_PORT=5432
BMS_DB_NAME=postgres
```

### 4. Run Development Environment

Single command to start everything:
```bash
./dev.sh
```

This automatically:
- Starts .NET API on `http://localhost:5002`
- Starts Vite dev server on `http://localhost:3001`
- Launches Electron desktop app
- Applies database migrations
- Creates default manager account

### 5. Login

Default manager account (created automatically):
- **Employee ID**: `0001`
- **PIN**: `1234`

## Available Scripts

### Development
```bash
./dev.sh              # Start everything (recommended)
npm run dev           # Electron with DevTools
npm run dev-vite      # Vite dev server only
```

### Production
```bash
npm start             # Run built application
npm run build-react   # Build React app
npm run build         # Package Electron app
```

### Multi-Display
```bash
npm run display0      # Primary display
npm run display1      # Secondary display
npm run display2      # Tertiary display
npm run dev-touch     # Touch-enabled display
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - PIN-based login
- `POST /api/auth/validate-manager` - Manager validation

### Employees
- `GET /api/employees` - List all employees
- `POST /api/employees` - Create employee
- `PUT /api/employees/{id}` - Update employee
- `PUT /api/employees/{id}/reset-pin` - Reset PIN

### Products
- `GET /api/products` - List products
- `GET /api/products/barcode/{barcode}` - Scan barcode
- `GET /api/products/low-stock` - Low stock alerts
- `GET /api/products/expiring?days=30` - Expiring products
- `POST /api/products` - Create product
- `PUT /api/products/{id}` - Update product

### Sales
- `GET /api/sales` - List sales
- `GET /api/sales/today` - Today's summary
- `GET /api/sales/top-products` - Best sellers
- `POST /api/sales` - Create sale

### Returns
- `GET /api/returns` - List returns
- `POST /api/returns` - Process return
- `PUT /api/returns/{id}/approve` - Approve return

### Inventory
- `GET /api/inventorycount` - Inventory counts
- `POST /api/inventorycount` - Start count
- `PUT /api/inventorycount/{id}/complete` - Complete count

### Settings
- `GET /api/tax-settings` - Tax configuration
- `GET /api/system-settings` - System settings
- `POST /api/system-settings` - Update settings

### Audit
- `GET /api/user-activity` - User activity logs

### Health
- `GET /health` - API health status

## Database Schema

### Core Tables
- **employees** - User accounts with hashed PINs
- **products** - Product catalog
- **product_batches** - Batch tracking with expiration
- **sales** / **sale_items** - Transaction records
- **returns** / **return_items** - Return records
- **inventory_counts** / **inventory_count_items** - Count sessions
- **stock_adjustments** - Stock corrections

### Configuration
- **tax_settings** - Tax rates and business info
- **system_settings** - System configuration
- **admin_settings** - Admin preferences

### Audit
- **user_activities** - Complete audit trail

## Security Features

- **PIN Hashing** - BCrypt with automatic upgrade from legacy plaintext
- **Role-Based Access** - Manager/Cashier/Inventory permissions
- **Session Management** - Auto-logout after configurable timeout
- **Audit Trail** - All CRUD operations logged with user/timestamp
- **Price Change Alerts** - Major changes (>20%) flagged
- **SSL/TLS** - Required for database connections

## Configuration

### System Settings
- Date format and regional settings
- Auto-logout timeout (default: 30 minutes)
- Payment methods (Cash/Card/Digital)
- Receipt auto-print toggle
- Theme and font scaling

### Tax Settings
- Business name and tax number
- Primary tax rate (0-100%)
- Optional secondary tax
- Tax exemptions support

### Return Policies
- Require receipt for returns
- Manager approval threshold
- Auto-restock toggle
- Return time limit (days)

## Logging

All API requests logged to `logs/comprehensive-{date}.json`:

```json
{
  "@t": "2025-01-26T15:30:45Z",
  "Application": "BMS_POS",
  "Action": "LOGIN",
  "UserId": 5,
  "Details": "Successful login"
}
```

## Troubleshooting

### API Won't Start
```bash
# Check logs
cat logs/comprehensive-*.json

# Verify database connection
dotnet run --urls="http://localhost:5002"
```

### Frontend Connection Issues
```bash
# Verify API is running
curl http://localhost:5002/health

# Check environment variable
echo $VITE_API_BASE_URL
```

### Database Migration Issues
```bash
cd BMS_POS_API
dotnet ef migrations list
dotnet ef database update
```

## Development Workflow

### Adding a New Feature
1. Create model in `BMS_POS_API/Models/`
2. Add DbSet to `BmsPosDbContext.cs`
3. Create migration: `dotnet ef migrations add FeatureName`
4. Create controller in `BMS_POS_API/Controllers/`
5. Add React component in `src/frontend/components/`
6. Add route to `App.tsx`

### Creating Migrations
```bash
cd BMS_POS_API
dotnet ef migrations add MigrationName
dotnet ef database update
```

## Architecture Benefits

- **Separation of Concerns** - Frontend, backend, and database layers
- **Type Safety** - TypeScript on frontend, C# on backend
- **Hot Reload** - Fast development with Vite
- **Structured Logging** - JSON logs for analysis
- **Real-time Database** - Supabase subscriptions enabled
- **Offline-Ready** - Electron works without internet (API must be local)
- **Cross-Platform** - Windows, macOS, Linux support

## Support

- **API Documentation**: `/swagger` endpoint (development mode)
- **Health Check**: `/health` endpoint
- **Logs**: `logs/comprehensive-{date}.json`

## License

ISC

## Author

Marc
