import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  BarChart3, 
  Smartphone, 
  PowerOff, 
  Settings2, 
  LogOut,
  Zap,
  Menu,
  X
} from 'lucide-react';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SidebarItemProps {
  icon: any;
  label: string;
  active: boolean;
  onClick: () => void | Promise<void>;
  collapsed?: boolean;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon: Icon, label, active, onClick, collapsed }) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center w-full p-4 transition-all duration-300 rounded-xl mb-2 group",
      active 
        ? "bg-emerald-500 text-white shadow-lg shadow-emerald-200" 
        : "text-slate-500 hover:bg-emerald-50 hover:text-emerald-600"
    )}
  >
    <Icon size={24} className={cn("min-w-[24px]", active ? "text-white" : "group-hover:scale-110 transition-transform")} />
    {!collapsed && (
      <span className="ml-4 font-medium whitespace-nowrap overflow-hidden transition-all duration-300">
        {label}
      </span>
    )}
  </button>
);

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, path: '/analytics' },
    { id: 'devices', label: 'Devices', icon: Smartphone, path: '/devices' },
    { id: 'load-shedding', label: 'Load Shedding', icon: PowerOff, path: '/load-shedding' },
    { id: 'priorities', label: 'Priorities', icon: Settings2, path: '/priorities' },
  ];

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Desktop Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: isCollapsed ? 80 : 280 }}
        className="hidden md:flex flex-col bg-white border-r border-slate-100 p-4 transition-all duration-300 relative"
      >
        <div className="flex items-center mb-10 px-2">
          <div className="bg-emerald-500 p-2 rounded-lg text-white">
            <Zap size={24} fill="currentColor" />
          </div>
          {!isCollapsed && (
            <motion.span 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="ml-3 text-xl font-bold text-slate-800 tracking-tight"
            >
              SmartGrid
            </motion.span>
          )}
        </div>

        <nav className="flex-1">
          {menuItems.map((item) => (
            <SidebarItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={location.pathname === item.path}
              onClick={() => navigate(item.path)}
              collapsed={isCollapsed}
            />
          ))}
        </nav>

        <div className="mt-auto pt-4 border-t border-slate-100">
          <SidebarItem
            icon={LogOut}
            label="Logout"
            active={false}
            onClick={handleLogout}
            collapsed={isCollapsed}
          />
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="absolute -right-3 top-20 bg-white border border-slate-100 rounded-full p-1 shadow-sm hover:bg-slate-50 transition-colors"
          >
            {isCollapsed ? <Menu size={16} /> : <X size={16} />}
          </button>
        </div>
      </motion.aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-100 flex items-center justify-between px-4 z-50">
        <div className="flex items-center">
          <Zap size={24} className="text-emerald-500" fill="currentColor" />
          <span className="ml-2 font-bold text-slate-800">SmartGrid</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            className="fixed inset-0 bg-white z-40 md:hidden pt-20 px-4"
          >
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  navigate(item.path);
                  setIsMobileMenuOpen(false);
                }}
                className={cn(
                  "flex items-center w-full p-4 rounded-xl mb-2",
                  location.pathname === item.path ? "bg-emerald-500 text-white" : "text-slate-500"
                )}
              >
                <item.icon size={24} className="mr-4" />
                <span className="font-medium">{item.label}</span>
              </button>
            ))}
            <button
              onClick={handleLogout}
              className="flex items-center w-full p-4 rounded-xl text-red-500 mt-4"
            >
              <LogOut size={24} className="mr-4" />
              <span className="font-medium">Logout</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pt-20 md:pt-0">
        <div className="max-w-7xl mx-auto p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
};
