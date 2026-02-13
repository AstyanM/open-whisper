import { Link, Outlet, useLocation } from "react-router-dom";
import { Mic, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { BackendStatusBanner } from "@/components/BackendStatusBanner";

const navItems = [
  { to: "/", label: "Transcription", icon: Mic },
  { to: "/sessions", label: "Sessions", icon: History },
];

export function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-lg font-semibold">Voice to Speech Local</h1>
            <nav className="flex items-center gap-1">
              {navItems.map((item) => {
                const isActive =
                  item.to === "/"
                    ? location.pathname === "/"
                    : location.pathname.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                      isActive
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </header>
      <main className="p-6">
        <BackendStatusBanner />
        <Outlet />
      </main>
    </div>
  );
}
