import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ThemeProvider } from "@/components/ThemeProvider";
import { TranscriptionProvider } from "@/contexts/TranscriptionContext";
import { TranscriptionPage } from "@/pages/TranscriptionPage";
import { SessionListPage } from "@/pages/SessionListPage";
import { SessionDetailPage } from "@/pages/SessionDetailPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { OverlayPage } from "@/pages/OverlayPage";
import { Toaster } from "@/components/ui/sonner";

function App() {
  return (
    <ThemeProvider>
    <BrowserRouter>
      <Toaster />
      <Routes>
        <Route path="/overlay" element={<OverlayPage />} />
        <Route
          element={
            <TranscriptionProvider>
              <Layout />
            </TranscriptionProvider>
          }
        >
          <Route path="/" element={<TranscriptionPage />} />
          <Route path="/sessions" element={<SessionListPage />} />
          <Route path="/sessions/:id" element={<SessionDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
