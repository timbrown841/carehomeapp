import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";

import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";

// Hubs (locked sidebar areas)
import ChildrensServicesHub from "@/pages/ChildrensServicesHub";
import AdultServicesHub from "@/pages/AdultServicesHub";
import ResidentDetail from "@/pages/ResidentDetail";

// Resident-scoped flows that need their own URL (deep-linked)
import LogIncident from "@/pages/LogIncident";
import IncidentDetail from "@/pages/IncidentDetail";
import MissingShare from "@/pages/MissingShare";

// Locked sidebar areas
import HomeOperations from "@/pages/HomeOperations";
import StaffOperationsHub from "@/pages/StaffOperationsHub";
import ComplianceHub from "@/pages/ComplianceHub";
import Admin from "@/pages/Admin";

// Legacy direct routes — kept alive so old Links/bookmarks still work,
// but removed from the sidebar (sidebar locked to 6 hubs).
import Notes from "@/pages/Notes";
import Incidents from "@/pages/Incidents";
import MedicationRound from "@/pages/MedicationRound";
import Visits from "@/pages/Visits";
import PocketMoney from "@/pages/PocketMoney";
import PettyCashPage from "@/pages/PettyCashPage";
import Staff, { TrainingPage } from "@/pages/Staff";
import Handover from "@/pages/Handover";
import Supervisions from "@/pages/Supervisions";
import SaferRecruitment from "@/pages/SaferRecruitment";
import OfstedReadiness from "@/pages/OfstedReadiness";
import CQCReadiness from "@/pages/CQCReadiness";
import AuditLog from "@/pages/AuditLog";
import Reports from "@/pages/Reports";
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

              {/* === SIDEBAR: 7 LOCKED HUBS === */}
              <Route path="/children" element={<ChildrensServicesHub />} />
              <Route path="/adults" element={<AdultServicesHub />} />
              {/* Legacy /residents URL → children's hub (most common case) */}
              <Route path="/residents" element={<Navigate to="/children" replace />} />
              <Route path="/operations" element={<HomeOperations />} />
              <Route path="/staff-operations" element={<StaffOperationsHub />} />
              <Route
                path="/compliance"
                element={<SeniorOrAbove><ComplianceHub /></SeniorOrAbove>}
              />
              <Route
                path="/admin"
                element={<ManagerOnly><Admin /></ManagerOnly>}
              />

              {/* Resident detail — primary deep-link target. URL pattern preserved. */}
              <Route path="/residents/:id" element={<ResidentDetail />} />

              {/* Resident-scoped sub-routes (deep-linked from inside profile) */}
              <Route path="/incidents/new" element={<LogIncident />} />
              <Route path="/incidents/:id" element={<IncidentDetail />} />

              {/* === LEGACY DIRECT ROUTES (kept alive for existing <Link>s and bookmarks).
                    Not in sidebar — accessed via hub tabs. === */}
              <Route path="/notes" element={<Notes />} />
              <Route path="/incidents" element={<Incidents />} />
              <Route path="/medications" element={<MedicationRound />} />
              <Route path="/visits" element={<Visits />} />
              <Route path="/pocket-money" element={<PocketMoney />} />
              <Route path="/petty-cash" element={<PettyCashPage />} />
              <Route path="/staff" element={<Staff />} />
              <Route path="/handover" element={<Handover />} />
              <Route path="/handover/:id" element={<Handover />} />
              <Route path="/training" element={<TrainingPage />} />
              <Route path="/supervisions" element={<Supervisions />} />
              <Route path="/hr" element={<ManagerOnly><SaferRecruitment /></ManagerOnly>} />
              <Route path="/ofsted" element={<OfstedReadiness />} />
              <Route path="/cqc-readiness" element={<SeniorOrAbove><CQCReadiness /></SeniorOrAbove>} />
              <Route path="/audit" element={<SeniorOrAbove><AuditLog /></SeniorOrAbove>} />
              <Route path="/reports" element={<ManagerOnly><Reports /></ManagerOnly>} />

              {/* Key-work editor & library — surfaced from inside Resident Profile */}
              <Route path="/key-work" element={<KeyWorkHub />} />
              <Route
                path="/key-work/new"
                element={<SeniorOrAbove><KeyWorkSessionEditor /></SeniorOrAbove>}
              />
              <Route path="/key-work/:id" element={<KeyWorkSessionDetail />} />
              <Route
                path="/key-work/:id/edit"
                element={<SeniorOrAbove><KeyWorkSessionEditor /></SeniorOrAbove>}
              />
              <Route path="/frameworks" element={<FrameworksList />} />
              <Route path="/frameworks/:id" element={<FrameworkDetail />} />
              <Route path="/resources" element={<ResourcesList />} />
              <Route path="/resources/:id" element={<ResourcePackDetail />} />
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
