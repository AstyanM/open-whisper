function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-4">
        <h1 className="text-xl font-semibold">Voice to Speech Local</h1>
        <p className="text-sm text-gray-400">
          Phase 1 — Foundations
        </p>
      </header>
      <main className="p-6">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
            <h2 className="text-lg font-medium mb-2">Status</h2>
            <div className="space-y-2 text-sm text-gray-300">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span>Frontend shell ready</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-500" />
                <span>Backend integration pending</span>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
