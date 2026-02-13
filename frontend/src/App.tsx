import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { TranscriptionPage } from "@/pages/TranscriptionPage";
import { SessionListPage } from "@/pages/SessionListPage";
import { SessionDetailPage } from "@/pages/SessionDetailPage";
import { OverlayPage } from "@/pages/OverlayPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/overlay" element={<OverlayPage />} />
        <Route element={<Layout />}>
          <Route path="/" element={<TranscriptionPage />} />
          <Route path="/sessions" element={<SessionListPage />} />
          <Route path="/sessions/:id" element={<SessionDetailPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
