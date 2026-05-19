import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Shield, Users, KeyRound, Store, Workflow, Activity, ClipboardList, ArrowLeft, LogOut, Menu, X } from "lucide-react";
import LogoBrand from "@/components/LogoBrand";

function NavItem({ path, icon: Icon, title }: { path: string; icon: React.ElementType; title: string }) {
  return <NavLink to={path} className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors cursor-pointer ${isActive ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold" : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"}`}><Icon className="w-4 h-4 flex-shrink-0" /><span>{title}</span></NavLink>;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const systemNav = [
    { title: "ภาพรวมระบบ", path: "/admin", icon: Shield },
    { title: "จัดการผู้ใช้", path: "/admin/users", icon: Users },
    { title: "จัดการสิทธิ์", path: "/admin/roles", icon: KeyRound },
    { title: "ตั้งค่าร้าน", path: "/admin/store", icon: Store },
    { title: "ตั้งค่าช่องทางขาย", path: "/admin/sales-channels", icon: Workflow },
    { title: "ตรวจสอบระบบ", path: "/admin/system", icon: Activity },
    { title: "บันทึกเหตุการณ์", path: "/admin/audit-logs", icon: ClipboardList },
  ];
  return <div className="min-h-screen flex w-full bg-background">
    <aside className="hidden md:flex flex-col w-56 bg-sidebar text-sidebar-foreground border-r border-sidebar-border fixed inset-y-0 left-0 z-40">
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-sidebar-border"><LogoBrand size="sm" iconOnly dark /><div><p className="font-bold text-sidebar-accent-foreground leading-none">Valora</p><p className="text-[10px] text-sidebar-foreground/60 mt-0.5">Admin Console</p></div></div>
      <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto"><p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest px-3 mb-2">System Control</p>{systemNav.map((item) => <NavItem key={item.path} {...item} />)}</nav>
      <div className="px-3 py-4 border-t border-sidebar-border space-y-0.5"><p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest px-3 mb-2">บัญชี</p><NavLink to="/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors cursor-pointer"><ArrowLeft className="w-4 h-4" /><span>กลับไปหน้าร้าน</span></NavLink><NavLink to="/admin-access" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors cursor-pointer"><LogOut className="w-4 h-4" /><span>ออกจากระบบ</span></NavLink></div>
    </aside>
    <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b h-14 flex items-center justify-between px-4 shadow-sm"><LogoBrand size="sm" iconOnly /><button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-foreground rounded-lg hover:bg-muted transition-colors">{sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}</button></header>
    <main className="flex-1 md:ml-56 pt-14 md:pt-0 pb-20 md:pb-0 min-h-screen overflow-x-hidden"><div className="max-w-5xl mx-auto px-3 sm:px-4 md:px-6 py-6 animate-fade-in">{children}</div></main>
  </div>;
}
