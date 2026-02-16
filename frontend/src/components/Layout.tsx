import { Link, Outlet, useLocation } from "react-router-dom";
import { Mic, History, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { BackendStatusBanner } from "@/components/BackendStatusBanner";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoMark } from "@/components/LogoMark";

const navItems = [
  { to: "/", label: "Transcription", icon: Mic },
  { to: "/sessions", label: "Sessions", icon: History },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/95 px-6 py-3 shadow-sm backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <LogoMark size={22} />
              <h1 className="text-lg font-semibold">OpenWhisper</h1>
            </div>
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
                      "relative flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                      isActive
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                    {isActive && (
                      <span className="absolute bottom-0 left-1/2 h-0.5 w-4/5 -translate-x-1/2 rounded-full bg-amber-500" />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main className="p-6">
        <BackendStatusBanner />
        <Outlet />
      </main>
    </div>
  );
}
