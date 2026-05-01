import { QueryClient, QueryClientProvider, useIsFetching } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { CoupleProvider } from '@/context/CoupleContext';
import { Header } from '@/components/Header';
import { useAppData } from '@/hooks/useAppData';
import Dashboard from '@/pages/Dashboard';
import TreatTracker from '@/pages/TreatTracker';
import History from '@/pages/History';
import Login from '@/pages/Login';
import Onboarding from '@/pages/Onboarding';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 30_000 },
  },
});

function AppContent() {
  const { user, profile, loading } = useAuth();
  const data = useAppData();
  const isFetching = useIsFetching();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-6xl animate-spin-slow inline-block">⚖️</span>
      </div>
    );
  }

  if (!user) return <Login />;

  // Has auth but no profile yet, or profile exists but no couple
  if (!profile?.name || !profile?.coupleId) {
    return <Onboarding />;
  }

  return (
    <>
      {isFetching > 0 && (
        <div className="fixed top-0 left-0 right-0 h-0.5 bg-primary/30 z-50">
          <div className="h-full bg-primary animate-pulse w-full" />
        </div>
      )}
      <Header />
      <Routes>
        <Route path="/" element={<Dashboard data={data} />} />
        <Route path="/treats" element={<TreatTracker data={data} />} />
        <Route path="/history" element={<History data={data} />} />
        <Route path="*" element={<Dashboard data={data} />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <CoupleProvider>
            <AppContent />
          </CoupleProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
