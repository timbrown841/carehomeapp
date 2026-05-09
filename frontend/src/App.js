import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";

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
import MissingShare from "@/pages/MissingShare";
import MedicationRound from "@/pages/MedicationRound";
import OfstedReadiness from "@/pages/OfstedReadiness";
import Staff, { TrainingPage } from "@/pages/Staff";
import Visits from "@/pages/Visits";
import PocketMoney from "@/pages/PocketMoney";
import PettyCashPage from "@/pages/PettyCashPage";
import Handover from "@/pages/Handover";
import SaferRecruitment from "@/pages/SaferRecruitment";
import CQCReadiness from "@/pages/CQCReadiness";
import AuditLog from "@/pages/AuditLog";
import KeyWorkHub from "@/pages/KeyWorkHub";
import KeyWorkSessionEditor from "@/pages/KeyWorkSessionEditor";
import KeyWorkSessionDetail from "@/pages/KeyWorkSessionDetail";
import { FrameworksList, FrameworkDetail } from "@/pages/Frameworks";
import { ResourcesList, ResourcePackDetail } from "@/pages/Resources";

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

function SeniorOrAbove({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!["senior", "manager", "admin"].includes(user.role)) return <Navigate to="/" replace />;
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
              <Route path="/staff" element={<Staff />} />
              <Route path="/training" element={<TrainingPage />} />
              <Route path="/handover" element={<Handover />} />
              <Route path="/handover/:id" element={<Handover />} />
              <Route path="/hr" element={<ManagerOnly><SaferRecruitment /></ManagerOnly>} />
              <Route path="/petty-cash" element={<PettyCashPage />} />
              <Route path="/supervisions" element={<Supervisions />} />
              <Route path="/medications" element={<MedicationRound />} />
              <Route path="/visits" element={<Visits />} />
              <Route path="/pocket-money" element={<PocketMoney />} />
              <Route path="/ofsted" element={<OfstedReadiness />} />
              <Route
                path="/cqc-readiness"
                element={
                  <SeniorOrAbove>
                    <CQCReadiness />
                  </SeniorOrAbove>
                }
              />
              <Route
                path="/audit"
                element={
                  <SeniorOrAbove>
                    <AuditLog />
                  </SeniorOrAbove>
                }
              />
              <Route path="/key-work" element={<KeyWorkHub />} />
              <Route
                path="/key-work/new"
                element={
                  <SeniorOrAbove>
                    <KeyWorkSessionEditor />
                  </SeniorOrAbove>
                }
              />
              <Route path="/key-work/:id" element={<KeyWorkSessionDetail />} />
              <Route
                path="/key-work/:id/edit"
                element={
                  <SeniorOrAbove>
                    <KeyWorkSessionEditor />
                  </SeniorOrAbove>
                }
              />
              <Route path="/frameworks" element={<FrameworksList />} />
              <Route path="/frameworks/:id" element={<FrameworkDetail />} />
              <Route path="/resources" element={<ResourcesList />} />
              <Route path="/resources/:id" element={<ResourcePackDetail />} />
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
