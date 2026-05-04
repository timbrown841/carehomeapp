import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import { UserCog, ClipboardCheck, BadgeCheck } from "lucide-react";

import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Residents from "@/pages/Residents";
import Notes from "@/pages/Notes";
import Incidents from "@/pages/Incidents";
import LogIncident from "@/pages/LogIncident";
import Reports from "@/pages/Reports";
import ComingSoon from "@/pages/ComingSoon";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="text-stone-500 text-sm">Loading…</div>
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function ManagerOnly({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!["manager", "admin"].includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <Protected>
                  <Layout />
                </Protected>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/residents" element={<Residents />} />
              <Route path="/notes" element={<Notes />} />
              <Route path="/incidents" element={<Incidents />} />
              <Route path="/incidents/new" element={<LogIncident />} />
              <Route
                path="/staff"
                element={
                  <ComingSoon
                    title="Staff Management"
                    description="Team profiles, rotas, and role permissions for your home."
                    icon={UserCog}
                  />
                }
              />
              <Route
                path="/supervisions"
                element={
                  <ComingSoon
                    title="Supervisions & Appraisals"
                    description="1:1 records, development plans, and reflective practice logs."
                    icon={ClipboardCheck}
                  />
                }
              />
              <Route
                path="/ofsted"
                element={
                  <ComingSoon
                    title="Ofsted Readiness"
                    description="Inspection-ready checklist, evidence library, and compliance scoring."
                    icon={BadgeCheck}
                  />
                }
              />
              <Route
                path="/reports"
                element={
                  <ManagerOnly>
                    <Reports />
                  </ManagerOnly>
                }
              />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </div>
  );
}

export default App;
