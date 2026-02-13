import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { TranscriptionPage } from "@/pages/TranscriptionPage";
import { SessionListPage } from "@/pages/SessionListPage";
import { SessionDetailPage } from "@/pages/SessionDetailPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
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
