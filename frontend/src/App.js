import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import { UserCog } from "lucide-react";

import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Residents from "@/pages/Residents";
import ResidentDetail from "@/pages/ResidentDetail";
import Notes from "@/pages/Notes";
import Incidents from "@/pages/Incidents";
import LogIncident from "@/pages/LogIncident";
import IncidentDetail from "@/pages/IncidentDetail";
import Reports from "@/pages/Reports";
import Supervisions from "@/pages/Supervisions";
import ComingSoon from "@/pages/ComingSoon";
import MissingShare from "@/pages/MissingShare";
import MedicationRound from "@/pages/MedicationRound";
import OfstedReadiness from "@/pages/OfstedReadiness";

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
            <Route path="/missing/share/:token" element={<MissingShare />} />
            <Route
              element={
                <Protected>
                  <Layout />
                </Protected>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/residents" element={<Residents />} />
              <Route path="/residents/:id" element={<ResidentDetail />} />
              <Route path="/notes" element={<Notes />} />
              <Route path="/incidents" element={<Incidents />} />
              <Route path="/incidents/new" element={<LogIncident />} />
              <Route path="/incidents/:id" element={<IncidentDetail />} />
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
              <Route path="/supervisions" element={<Supervisions />} />
              <Route path="/medications" element={<MedicationRound />} />
              <Route path="/ofsted" element={<OfstedReadiness />} />
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
