import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Mic, FileAudio, History, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { BackendStatusBanner } from "@/components/BackendStatusBanner";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoMark } from "@/components/LogoMark";
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const navItems = [
  { to: "/", label: "Transcription", icon: Mic, description: "Live transcription" },
  { to: "/upload", label: "File Upload", icon: FileAudio, description: "Transcribe audio files" },
  { to: "/sessions", label: "Sessions", icon: History, description: "Session history" },
  { to: "/settings", label: "Settings", icon: Settings, description: "App settings" },
];

export function Layout() {
  const location = useLocation();

  // Scroll to top on navigation
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="min-h-screen bg-background text-foreground">
        <header className="sticky top-0 z-40 border-b border-border/50 bg-background/95 px-6 py-3 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
                <LogoMark size={22} />
                <h1 className="text-lg font-semibold">OpenWhisper</h1>
              </Link>
              <nav className="flex items-center gap-1">
                {navItems.map((item) => {
                  const isActive =
                    item.to === "/"
                      ? location.pathname === "/"
                      : location.pathname.startsWith(item.to);
                  return (
                    <Tooltip key={item.to}>
                      <TooltipTrigger asChild>
                        <Link
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
                      </TooltipTrigger>
                      <TooltipContent>{item.description}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </nav>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <ThemeToggle />
                </div>
              </TooltipTrigger>
              <TooltipContent>Toggle theme</TooltipContent>
            </Tooltip>
          </div>
        </header>
        <main key={location.pathname} className="p-6 animate-in fade-in duration-200">
          <BackendStatusBanner />
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  );
}
