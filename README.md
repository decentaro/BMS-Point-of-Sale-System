# BMS POS Electron Application

A modern Point of Sale system built with Electron.js, React, Tailwind CSS, shadcn/ui, and a .NET API backend (PostgreSQL via Supabase). Local SQLite artifacts have been removed.

## Features

- **Login System**: Manager and Cashier authentication
- **Employee Management**: Full CRUD operations for employees
- **Touch-Friendly Interface**: Optimized for touch screens and kiosks
- **SQLite Database**: Local database storage with automatic seeding
- **Clean Architecture**: Separated main process, renderer, and database layers

## Project Structure

```
BMS_POS/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── main.js           # Main application entry
│   │   └── preload.js        # Secure API bridge (HTTP to .NET)
│   └── renderer/             # React renderer (Vite + Tailwind)
│       ├── components/       # React screens & UI primitives (shadcn/ui)
│       ├── index.html        # Renderer entry
│       └── main.tsx          # React bootstrap
├── BMS_POS_API/              # ASP.NET Core Web API (EF Core + Npgsql)
├── docs/                     # Documentation
└── package.json              # App scripts and deps
```

## Default Login Credentials

### Manager Account
- **Employee ID**: 999
- **PIN**: 1234

### Regular Employees
- **Employee ID**: 123, **PIN**: 1234 (John Doe)
- **Employee ID**: 456, **PIN**: 5678 (Jane Smith)
- **Employee ID**: 789, **PIN**: 9999 (Bob Wilson)

## Installation & Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Run Application**:
   ```bash
   npm start
   ```

3. **Development Mode** (with DevTools):
   ```bash
   npm run dev
   ```

## Usage

### Login Screen
1. Select your role (Cashier / Inventory / Manager)
2. Tap the Employee ID field and use the keypad to enter
3. Tap the PIN field and use the keypad to enter
4. Press Sign in

### Manager Dashboard
1. **View Employees**: All regular employees are listed in the left panel
2. **Add Employee**: Fill out the form and click "ADD EMPLOYEE"
3. **Edit Employee**: Click an employee in the list, modify fields, click "SAVE CHANGES"
4. **Delete Employee**: Select an employee and click "DELETE"
5. **Clear Form**: Click "CLEAR" to reset the form

### Input Methods
- **Numeric Keypad**: Numbers 0-9
- **Letter Keypad**: A-Z for names
- **Special Keys**: CLR (clear field), ⌫ (backspace), SPACE

## Backend
The Electron preload connects to the .NET API at `http://localhost:5001/api` by default. Override with `BMS_POS_API_BASE_URL` env var.

## Color Scheme

- **Background**: #1E1E1E (Dark)
- **Panels**: #2D2D30 (Medium Dark)
- **Employee Rows**: #505050 (Gray)
- **Primary (Add/Login)**: #4CAF50 (Green)
- **Edit**: #2196F3 (Blue)
- **Delete**: #F44336 (Red)
- **Clear/Orange**: #FF9800 (Orange)
- **Back/Gray**: #9E9E9E (Gray)

## Architecture Benefits

- **No Data Binding Issues**: Direct DOM manipulation eliminates framework binding problems
- **Fast Performance**: Native web technologies with Electron wrapper
- **Cross-Platform**: Runs on Windows, macOS, and Linux
- **Touch Optimized**: Large buttons and intuitive interface
- **Secure**: Sandboxed renderer with IPC communication