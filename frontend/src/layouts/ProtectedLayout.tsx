import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useInvoiceConfig } from '../hooks/useSettings';
import { LogOut, Settings, LayoutDashboard, FileText, Landmark, Users, Contact, Menu } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

const FALLBACK_BRAND = 'El Contador';

export default function ProtectedLayout() {
  const { user, isLoading, logout } = useAuth();
  const { data: invoiceConfig } = useInvoiceConfig();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const companyName = (invoiceConfig?.companyName && String(invoiceConfig.companyName).trim()) || FALLBACK_BRAND;
  const logoUrl = invoiceConfig?.logoPath ? `/api/invoice-config/logo?t=${invoiceConfig.logoPath}` : null;

  useEffect(() => {
    document.title = companyName;
  }, [companyName]);

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Expenses', path: '/expenses', icon: FileText },
    { name: 'Sales', path: '/sales', icon: FileText },
    { name: 'Bank', path: '/bank', icon: Landmark },
    { name: 'Reconciliation', path: '/reconciliation', icon: FileText },
    { name: 'Contacts', path: '/contacts', icon: Contact },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  const navLinks = (
    <>
      {navItems.map((item) => {
        const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
        return (
          <Link
            key={item.name}
            to={item.path}
            onClick={() => setMobileNavOpen(false)}
            className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
              isActive ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <item.icon size={20} />
            {item.name}
          </Link>
        );
      })}
    </>
  );

  const sidebarContent = (
    <>
      <div className="p-4 flex items-center gap-2 min-h-[3rem]">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-8 w-auto object-contain flex-shrink-0" />
        ) : null}
        <h1 className="text-xl font-bold text-white truncate">{companyName}</h1>
      </div>
      <nav className="flex-1 px-2 py-4 space-y-1">
        {navLinks}
      </nav>
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
            <Users size={16} />
          </div>
          <div className="text-sm">
            <div className="font-medium text-white">{user.name || 'User'}</div>
            <div className="text-xs text-slate-400 capitalize">{user.role}</div>
          </div>
        </div>
        <Button variant="outline" className="w-full justify-start text-slate-800 bg-white" onClick={() => { setMobileNavOpen(false); logout(); }}>
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </Button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile: header with hamburger */}
      <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-slate-900 text-white border-b border-slate-800 shrink-0 fixed top-0 left-0 right-0 z-40">
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger
            className="inline-flex items-center justify-center rounded-md p-2 text-slate-300 hover:text-white hover:bg-slate-800 -ml-1"
          >
            <Menu className="h-6 w-6" />
            <span className="sr-only">Open menu</span>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 bg-slate-900 text-slate-300 border-slate-800 flex flex-col rounded-none" showCloseButton={true}>
            {sidebarContent}
          </SheetContent>
        </Sheet>
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-7 w-auto object-contain flex-shrink-0" />
        ) : null}
        <h1 className="text-lg font-bold truncate">{companyName}</h1>
      </header>

      {/* Desktop: sidebar */}
      <aside className="hidden md:flex w-64 bg-slate-900 text-slate-300 flex-col shrink-0">
        {sidebarContent}
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-auto pt-14 md:pt-0">
        <div className="p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
