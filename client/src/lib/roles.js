import {
  LayoutDashboard, Users, Briefcase, Calendar, FileText,
  Package, UserCog, ClipboardList, Settings, LayoutList, Clock, ClipboardCheck, MessagesSquare, BarChart3, Columns3, CreditCard, Sparkles, Map, BookOpen, Wallet,
} from 'lucide-react';

export const STAFF = ['admin', 'office', 'technician'];

// Single source of truth for nav + access control. `roles` = who may see/reach each item.
export const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: STAFF },
      { to: '/assistant', label: 'Assistant', icon: Sparkles, roles: ['admin', 'office'] },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/customers', label: 'Customers', icon: Users, roles: ['admin', 'office'] },
      { to: '/support', label: 'Support', icon: MessagesSquare, roles: ['admin', 'office'] },
      { to: '/jobs', label: 'Jobs', icon: Briefcase, roles: STAFF },
      { to: '/dispatch', label: 'Dispatch', icon: Columns3, roles: ['admin', 'office'] },
      { to: '/schedule', label: 'Schedule', icon: Calendar, roles: STAFF },
      { to: '/route', label: 'Route', icon: Map, roles: STAFF },
      { to: '/inspections', label: 'Inspections', icon: ClipboardCheck, roles: STAFF },
      { to: '/time-clock', label: 'Time Clock', icon: Clock, roles: STAFF },
    ],
  },
  {
    label: 'Billing',
    items: [
      { to: '/invoices', label: 'Invoices', icon: FileText, roles: ['admin', 'office'] },
      { to: '/payments', label: 'Payments', icon: CreditCard, roles: ['admin', 'office'] },
      { to: '/quotes', label: 'Quotes', icon: ClipboardList, roles: ['admin', 'office'] },
      { to: '/price-book', label: 'Price Book', icon: BookOpen, roles: ['admin', 'office'] },
      { to: '/reports', label: 'Reports', icon: BarChart3, roles: ['admin', 'office'] },
      { to: '/payroll', label: 'Payroll', icon: Wallet, roles: ['admin'] },
    ],
  },
  {
    label: 'Resources',
    items: [
      { to: '/inventory', label: 'Inventory', icon: Package, roles: ['admin', 'office'] },
      { to: '/employees', label: 'Team', icon: UserCog, roles: ['admin'] },
    ],
  },
  {
    label: 'System',
    items: [{ to: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] }],
  },
  {
    label: 'My Account',
    items: [{ to: '/portal', label: 'My Portal', icon: LayoutList, roles: ['customer'] }],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap(g => g.items);

// Nav groups visible to a role (empty groups removed).
export function navGroupsForRole(role) {
  return NAV_GROUPS
    .map(g => ({ ...g, items: g.items.filter(i => i.roles.includes(role)) }))
    .filter(g => g.items.length > 0);
}

// The landing route for a role (first item they can see).
export function homeForRole(role) {
  const first = ALL_ITEMS.find(i => i.roles.includes(role));
  return first ? first.to : '/portal';
}

// May this role open this pathname? Detail routes inherit their base (e.g. /jobs/123 → /jobs).
export function canAccess(role, pathname) {
  if (pathname === '/') return ALL_ITEMS.find(i => i.to === '/').roles.includes(role);
  const item = ALL_ITEMS.find(i => i.to !== '/' && (pathname === i.to || pathname.startsWith(i.to + '/')));
  if (!item) return false;
  return item.roles.includes(role);
}
