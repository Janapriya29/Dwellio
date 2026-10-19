import React from 'react';

export const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-dwellio-ivory flex flex-col justify-between p-6 sm:p-12">
      {/* Top Header */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-dwellio-teal flex items-center justify-center shadow-sm">
            <span className="text-dwellio-mint font-bold text-xl">D</span>
          </div>
          <span className="text-2xl font-black tracking-tight text-dwellio-teal">
            Dwellio
          </span>
        </div>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-dwellio-mint/40 text-dwellio-teal border border-dwellio-mint">
          Phase 1: Foundation Ready
        </span>
      </header>

      {/* Main Hero Card */}
      <main className="max-w-3xl w-full mx-auto my-12 text-center">
        <div className="bg-white rounded-3xl shadow-md border border-dwellio-mint/30 p-8 sm:p-14">
          <div className="inline-block p-3 rounded-2xl bg-dwellio-mint/30 text-dwellio-teal mb-6">
            <svg
              className="w-10 h-10 mx-auto text-dwellio-teal"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold text-dwellio-teal tracking-tight mb-3">
            Dwellio
          </h1>
          <p className="text-xl sm:text-2xl font-medium text-dwellio-teal/80 mb-6">
            Your Home, in Good Hands.
          </p>

          <p className="text-base sm:text-lg text-dwellio-teal/70 max-w-xl mx-auto leading-relaxed mb-8">
            The full-stack monorepo foundation is configured and operational.
            Frontend, backend services, and shared packages are ready for Phase 2 development.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-dwellio-mint/30 text-left">
            <div className="p-4 rounded-xl bg-dwellio-ivory/70 border border-dwellio-mint/40">
              <p className="text-xs font-semibold text-dwellio-teal/60 uppercase tracking-wider mb-1">
                Frontend
              </p>
              <p className="text-sm font-bold text-dwellio-teal">
                React + Vite + Tailwind
              </p>
            </div>
            <div className="p-4 rounded-xl bg-dwellio-ivory/70 border border-dwellio-mint/40">
              <p className="text-xs font-semibold text-dwellio-teal/60 uppercase tracking-wider mb-1">
                Backend
              </p>
              <p className="text-sm font-bold text-dwellio-teal">
                Node.js + Express + TS
              </p>
            </div>
            <div className="p-4 rounded-xl bg-dwellio-ivory/70 border border-dwellio-mint/40">
              <p className="text-xs font-semibold text-dwellio-teal/60 uppercase tracking-wider mb-1">
                Database
              </p>
              <p className="text-sm font-bold text-dwellio-teal">
                MongoDB (Port 27017)
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-6xl w-full mx-auto text-center text-xs text-dwellio-teal/60">
        &copy; {new Date().getFullYear()} Dwellio. Tagline: Your Home, in Good Hands.
      </footer>
    </div>
  );
};

export default App;
