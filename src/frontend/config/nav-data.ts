import {
  ShoppingCart, History, RotateCcw,
  Package, Boxes,
  Users, Receipt, Settings, BarChart2, Activity, ShieldAlert,
} from 'lucide-react'
import type { ElementType } from 'react'

export interface NavCard {
  route: string
  label: string
  sub: string
  icon: ElementType
  accent: string
}

export const ACCENT_CLASSES: Record<string, { icon: string; hover: string; bg: string }> = {
  emerald: { icon: 'text-emerald-600', hover: 'hover:border-emerald-300 hover:bg-emerald-50', bg: 'bg-emerald-50' },
  blue:    { icon: 'text-blue-600',    hover: 'hover:border-blue-300 hover:bg-blue-50',       bg: 'bg-blue-50'    },
  orange:  { icon: 'text-orange-500',  hover: 'hover:border-orange-300 hover:bg-orange-50',   bg: 'bg-orange-50'  },
  teal:    { icon: 'text-teal-600',    hover: 'hover:border-teal-300 hover:bg-teal-50',       bg: 'bg-teal-50'    },
  violet:  { icon: 'text-violet-600',  hover: 'hover:border-violet-300 hover:bg-violet-50',   bg: 'bg-violet-50'  },
  navy:    { icon: 'text-[hsl(215,65%,30%)]', hover: 'hover:border-slate-400 hover:bg-slate-100', bg: 'bg-slate-100' },
  slate:   { icon: 'text-slate-600',   hover: 'hover:border-slate-300 hover:bg-slate-100',   bg: 'bg-slate-50'   },
  red:     { icon: 'text-red-600',     hover: 'hover:border-red-300 hover:bg-red-50',         bg: 'bg-red-50'     },
}

export const CASHIER_CARDS: NavCard[] = [
  { route: '/pos',           label: 'Point of Sale',  sub: 'Start selling',     icon: ShoppingCart, accent: 'emerald' },
  { route: '/sales-history', label: 'Sales History',  sub: 'View transactions', icon: History,      accent: 'blue'    },
  { route: '/returns',       label: 'Returns',        sub: 'Process refunds',   icon: RotateCcw,    accent: 'orange'  },
]

export const INVENTORY_CARDS: NavCard[] = [
  { route: '/inventory',            label: 'Basic Inventory',    sub: 'Add / edit products',    icon: Package, accent: 'teal' },
  { route: '/inventory-management', label: 'Advanced Inventory', sub: 'Adjustments & tracking', icon: Boxes,   accent: 'teal' },
]

export const MANAGER_CARDS: NavCard[] = [
  { route: '/employees',    label: 'Employees',    sub: 'Manage staff',    icon: Users,   accent: 'violet' },
  { route: '/tax-settings', label: 'Tax Settings', sub: 'Configure taxes', icon: Receipt, accent: 'navy'   },
]

export const SYSTEM_CARDS: NavCard[] = [
  { route: '/system-settings', label: 'System Settings', sub: 'Preferences',         icon: Settings,    accent: 'slate'   },
  { route: '/reports',         label: 'Reports',         sub: 'Analytics',            icon: BarChart2,   accent: 'emerald' },
  { route: '/user-activity',   label: 'User Activity',   sub: 'Audit trail',          icon: Activity,    accent: 'blue'    },
  { route: '/admin',           label: 'Admin Panel',     sub: 'Technical settings',   icon: ShieldAlert, accent: 'red'     },
]
