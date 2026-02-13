import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { TranscriptionPage } from "@/pages/TranscriptionPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<TranscriptionPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
