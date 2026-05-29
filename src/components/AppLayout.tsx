import React from "react";
import type { ActiveTab } from "../types";
import {
  FileCheck,
  History,
  Database,
  Settings2,
  UserCircle,
  LogOut,
  Menu,
  X,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { SiteLogo } from "./SiteLogo";
import { SITE_TAGLINE } from "../constants/branding";

const NAV: { id: ActiveTab; label: string; desc: string; icon: React.ElementType }[] = [
  { id: "form", label: "Novo espelho", desc: "Emitir frete / viagem", icon: FileCheck },
  { id: "history", label: "Histórico", desc: "Espelhos emitidos", icon: History },
  { id: "catalogs", label: "Cadastros", desc: "Clientes, motoristas e frota", icon: Database },
  { id: "company", label: "Empresas", desc: "Emitentes do espelho", icon: Settings2 },
  { id: "account", label: "Conta", desc: "Senha e usuários", icon: UserCircle },
];

interface AppLayoutProps {
  activeTab: ActiveTab;
  onNavigate: (tab: ActiveTab) => void;
  authUser: { nome: string; username: string } | null;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export function AppLayout({
  activeTab,
  onNavigate,
  authUser,
  theme,
  onToggleTheme,
  onLogout,
  children,
}: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [mobileNav, setMobileNav] = React.useState(false);

  const isDark = theme === "dark";

  const navItem = (item: (typeof NAV)[0]) => {
    const Icon = item.icon;
    const active = activeTab === item.id;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => {
          onNavigate(item.id);
          setMobileNav(false);
        }}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition cursor-pointer ${
          active
            ? "bg-emerald-600 text-white shadow-sm"
            : isDark
              ? "text-slate-300 hover:bg-slate-800 hover:text-white"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        }`}
      >
        <Icon className={`w-5 h-5 shrink-0 ${active ? "text-white" : "text-emerald-600"}`} />
        {(sidebarOpen || mobileNav) && (
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold leading-tight">{item.label}</span>
            <span
              className={`block text-[11px] truncate ${
                active ? "text-emerald-100" : "text-slate-400"
              }`}
            >
              {item.desc}
            </span>
          </span>
        )}
      </button>
    );
  };

  const sidebarContent = (
    <>
      <div className="flex items-center gap-2 px-3 py-4 border-b border-slate-200/80">
        <SiteLogo
          size="sidebar"
          showText={sidebarOpen || mobileNav}
          subtitle={SITE_TAGLINE}
          className="flex-1 min-w-0"
        />
        {!mobileNav && (
          <button
            type="button"
            onClick={() => setSidebarOpen((o) => !o)}
            className="hidden lg:flex p-1.5 rounded-md hover:bg-slate-100 text-slate-500 cursor-pointer shrink-0"
            title={sidebarOpen ? "Recolher menu" : "Expandir menu"}
          >
            {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        )}
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">{NAV.map(navItem)}</nav>

      <div className="p-3 border-t border-slate-200/80 space-y-2">
        {(sidebarOpen || mobileNav) && authUser && (
          <p className="text-xs text-slate-500 px-2 truncate">
            Olá, <span className="font-semibold text-slate-700">{authUser.nome}</span>
          </p>
        )}
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onToggleTheme}
            className="flex-1 p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer flex items-center justify-center"
            title="Tema"
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="flex-1 p-2 rounded-lg border border-slate-200 text-red-600 hover:bg-red-50 cursor-pointer flex items-center justify-center gap-1 text-xs font-semibold"
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
            {(sidebarOpen || mobileNav) && <span>Sair</span>}
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div
      className={`h-dvh max-h-dvh flex overflow-hidden ${isDark ? "bg-slate-950 text-slate-100" : "bg-slate-100 text-slate-900"}`}
    >
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 border-r transition-all duration-200 ${
          isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
        } ${sidebarOpen ? "w-64" : "w-[72px]"}`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileNav && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileNav(false)}
            aria-hidden
          />
          <aside
            className={`relative w-[min(280px,85vw)] flex flex-col shadow-xl ${
              isDark ? "bg-slate-900" : "bg-white"
            }`}
          >
            <button
              type="button"
              className="absolute top-3 right-3 p-2 rounded-lg hover:bg-slate-100 cursor-pointer"
              onClick={() => setMobileNav(false)}
            >
              <X className="w-5 h-5" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <header
          className={`shrink-0 z-30 border-b px-4 py-2.5 sm:py-3 flex items-center justify-between gap-3 ${
            isDark ? "bg-slate-900/95 border-slate-800 backdrop-blur" : "bg-white/95 border-slate-200 backdrop-blur"
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="lg:hidden p-2 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"
              onClick={() => setMobileNav(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base font-bold truncate">
                {NAV.find((n) => n.id === activeTab)?.label}
              </h1>
              <p className="text-xs text-slate-500 truncate hidden sm:block">
                {NAV.find((n) => n.id === activeTab)?.desc}
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-slate-400 hidden md:inline">
            {new Date().toLocaleDateString("pt-BR")}
          </span>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6 max-w-6xl w-full mx-auto">
          {children}
        </main>

        <footer className="shrink-0 py-2 sm:py-3 text-center text-[11px] text-slate-400 border-t border-slate-200/60">
          M.A.F Transportes e Seguros de Cargas
        </footer>
      </div>
    </div>
  );
}
