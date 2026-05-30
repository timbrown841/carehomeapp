import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { OrgProvider, useOrg } from "@/context/OrgContext";
import { Toaster } from "@/components/ui/sonner";

import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import WelcomeSelector from "@/pages/WelcomeSelector";

// Hubs (locked sidebar areas)
import ChildrensServicesHub from "@/pages/ChildrensServicesHub";
import AdultServicesHub from "@/pages/AdultServicesHub";
import ResidentDetail from "@/pages/ResidentDetail";

// Resident-scoped flows that need their own URL (deep-linked)
import LogIncident from "@/pages/LogIncident";
import IncidentDetail from "@/pages/IncidentDetail";
import MissingShare from "@/pages/MissingShare";
import InspectorPreview from "@/pages/InspectorPreview";

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
import TrainingCentre from "@/pages/TrainingCentre";
import Handover from "@/pages/Handover";
import Supervisions from "@/pages/Supervisions";
import SaferRecruitment from "@/pages/SaferRecruitment";
import HandoverDigest from "@/pages/HandoverDigest";
import NotificationCentre from "@/pages/NotificationCentre";
import InductionPolicyHub from "@/pages/InductionPolicyHub";
import PolicyDetail from "@/pages/PolicyDetail";
import PolicyAssignment from "@/pages/PolicyAssignment";
import MyPolicies from "@/pages/MyPolicies";
import GovernanceHub from "@/pages/GovernanceHub";
import PolicyIntelligence from "@/pages/PolicyIntelligence";
import OfstedReadiness from "@/pages/OfstedReadiness";
import CQCReadiness from "@/pages/CQCReadiness";
import AuditLog from "@/pages/AuditLog";
import Reports from "@/pages/Reports";
import KeyWorkHub from "@/pages/KeyWorkHub";
import KeyWorkSessionEditor from "@/pages/KeyWorkSessionEditor";
import KeyWorkSessionDetail from "@/pages/KeyWorkSessionDetail";
import { FrameworksList, FrameworkDetail } from "@/pages/Frameworks";
import { ResourcesList, ResourcePackDetail } from "@/pages/Resources";
import Reflection from "@/pages/Reflection";
import ReflectionSupervision from "@/pages/ReflectionSupervision";
import LeaveRequests from "@/pages/LeaveRequests";
import ShiftSwaps from "@/pages/ShiftSwaps";
import TasksPage from "@/pages/TasksPage";
import StaffInductionList, { InductionDetailPage } from "@/pages/StaffInduction";

function Protected({ children }) {
  const { user, loading } = useAuth();
  const { effectiveMode, settings } = useOrg();
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="text-stone-500 text-sm">Loading…</div>
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  // After login, the user must have an active session mode. For single-sector
  // orgs this is auto-set. For dual orgs they're redirected to /welcome.
  if (!effectiveMode && settings.service_modes?.length > 1) {
    return <Navigate to="/welcome" replace />;
  }
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

function RequireMode({ mode, children }) {
  const { effectiveMode, loading } = useOrg();
  if (loading) return null;
  if (effectiveMode !== mode) return <Navigate to="/" replace />;
  return children;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <OrgProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/welcome" element={<WelcomeSelector />} />
            <Route path="/missing/share/:token" element={<MissingShare />} />
            <Route path="/inspector-preview/:token" element={<InspectorPreview />} />
            <Route
              element={
                <Protected>
                  <Layout />
                </Protected>
              }
            >
              <Route path="/" element={<Dashboard />} />

              {/* === SIDEBAR: 7 LOCKED HUBS === */}
              <Route path="/children" element={<RequireMode mode="children"><ChildrensServicesHub /></RequireMode>} />
              <Route path="/adults" element={<RequireMode mode="adult"><AdultServicesHub /></RequireMode>} />
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
              <Route path="/leave-requests" element={<LeaveRequests />} />
              <Route path="/shift-swaps" element={<ShiftSwaps />} />
              <Route path="/handover" element={<Handover />} />
              <Route path="/handover/:id" element={<Handover />} />
              <Route path="/training" element={<TrainingCentre />} />
              <Route path="/tasks" element={<TasksPage />} />
              <Route path="/induction" element={<StaffInductionList />} />
              <Route path="/induction/:aid" element={<InductionDetailPage />} />
              <Route path="/supervisions" element={<Supervisions />} />
              <Route path="/hr" element={<ManagerOnly><SaferRecruitment /></ManagerOnly>} />
              <Route path="/handover-digest" element={<ManagerOnly><HandoverDigest /></ManagerOnly>} />
              <Route path="/notifications-centre" element={<NotificationCentre />} />
              <Route path="/policies" element={<ManagerOnly><InductionPolicyHub /></ManagerOnly>} />
              <Route path="/policies/:id" element={<ManagerOnly><PolicyDetail /></ManagerOnly>} />
              <Route path="/policy-assignments/:id" element={<PolicyAssignment />} />
              <Route path="/my-policies" element={<MyPolicies />} />
              <Route path="/governance" element={<GovernanceHub />} />
              <Route path="/policy-intelligence" element={<PolicyIntelligence />} />
              <Route path="/ofsted" element={<RequireMode mode="children"><OfstedReadiness /></RequireMode>} />
              <Route path="/cqc-readiness" element={<RequireMode mode="adult"><SeniorOrAbove><CQCReadiness /></SeniorOrAbove></RequireMode>} />
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

              {/* Staff Reflection &amp; Wellbeing — personal, accessed via avatar menu */}
              <Route path="/reflection" element={<Reflection />} />
              <Route
                path="/reflection/supervision/:userId"
                element={<ManagerOnly><ReflectionSupervision /></ManagerOnly>}
              />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="top-right" />
        </OrgProvider>
      </AuthProvider>
    </div>
  );
}

export default App;
