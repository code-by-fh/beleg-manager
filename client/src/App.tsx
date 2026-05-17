import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { LoginPage } from "@/pages/Login";
import { DashboardPage } from "@/pages/Dashboard";
import { UploadPage } from "@/pages/Upload";
import { ReviewPage } from "@/pages/Review";
import { SettingsPage } from "@/pages/Settings";
import { ReceiptsPage } from "@/pages/Receipts";
import { KontoabgleichPage } from "@/pages/Kontoabgleich";
import { RequestsPage } from "@/pages/Requests";
import { MonitoringPage } from "@/pages/Monitoring";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RootRedirect } from "@/components/RootRedirect";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/lib/theme";

const qc = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false } },
});

export function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={qc}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
              <Route path="/" element={<RootRedirect />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/receipts" element={<ReceiptsPage />} />
              <Route path="/splits" element={<Navigate to="/requests" replace />} />
              <Route path="/requests" element={<RequestsPage />} />
              <Route path="/kontoabgleich" element={<KontoabgleichPage />} />
              <Route path="/review/:pendingId" element={<ReviewPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/monitoring" element={<MonitoringPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
