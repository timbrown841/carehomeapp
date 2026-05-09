import { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  Settings, Users as UsersIcon, Plus, Trash2, X, Loader2,
  ShieldCheck, Activity, FileText, History as HistoryIcon, Building2,
} from "lucide-react";

const ROLE_TIERS = [
  { tier: 1, role: "staff", label: "Support Worker",
    grants: ["Record daily notes & incidents", "Log medication & body maps", "Record compliance checks", "View own training"] },
  { tier: 2, role: "senior", label: "Senior",
    grants: ["All Support Worker", "Edit rotas", "Full training matrix", "Audit log read", "Inline edit residents"] },
  { tier: 3, role: "manager", label: "Manager",
    grants: ["All Senior", "AI reports", "Sign off compliance & key work", "Safer Recruitment & HR", "PDF exports", "Admin (users)"] },
  { tier: 4, role: "admin", label: "Admin",
    grants: ["All Manager", "Delete users", "Delete residents", "Full system control"] },
];

const ROLE_TONE = {
  staff: { bg: "#eef0f3", fg: "#5d6068" },
  senior: { bg: "#e3edf2", fg: "#0e3b4a" },
  manager: { bg: "#e7f1eb", fg: "#2F6A3A" },
  admin: { bg: "#fdecec", fg: "#A8273A" },
};

function CreateUserModal({ onClose, onCreated, isAdmin }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("staff");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim() || !email.trim() || password.length < 6) {
      toast.error("Name, email, and a 6+ char password are required.");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post("/admin/users", {
        name: name.trim(), email: email.trim().toLowerCase(), password, role,
      });
      toast.success(`Created ${data.name} (${data.role})`);
      onCreated && onCreated(data);
      onClose();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not create user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-xl border divider-soft" data-testid="admin-create-user-modal">
        <div className="px-5 py-4 border-b divider-soft flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0e3b4a] text-white flex items-center justify-center"><UsersIcon size={18} /></div>
          <div className="flex-1">
            <div className="text-[15px] font-semibold text-[#0F1115]">Create user</div>
            <div className="text-[11px] text-[#5d6068]">They&apos;ll sign in with this email + password.</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-stone-100"><X size={18} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-[12px] font-semibold text-[#0F1115] mb-1">Full name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border divider-soft text-[14px] focus:ring-2 focus:ring-[#0e3b4a]/20 outline-none"
              data-testid="admin-create-name" placeholder="e.g. Jamie Cooper" />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[#0F1115] mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border divider-soft text-[14px] focus:ring-2 focus:ring-[#0e3b4a]/20 outline-none"
              data-testid="admin-create-email" placeholder="jamie@care.local" />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[#0F1115] mb-1">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border divider-soft text-[14px] focus:ring-2 focus:ring-[#0e3b4a]/20 outline-none"
              data-testid="admin-create-password" placeholder="Min 6 characters" />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[#0F1115] mb-1">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border divider-soft text-[13px] bg-white" data-testid="admin-create-role">
              <option value="staff">Support Worker (staff)</option>
              <option value="senior">Senior</option>
              <option value="manager">Manager</option>
              {isAdmin && <option value="admin">Admin</option>}
            </select>
          </div>
        </div>
        <div className="px-5 py-3 border-t divider-soft flex items-center gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-[13px] font-medium text-[#2f3038] hover:bg-stone-100">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="ml-auto px-4 py-2 rounded-lg bg-[#0e3b4a] text-white text-[13px] font-semibold hover:bg-[#0c2f3b] disabled:opacity-60 inline-flex items-center gap-2"
            data-testid="admin-create-save">
            {saving && <Loader2 size={14} className="animate-spin" />}
            Create user
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [users, setUsers] = useState([]);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [u, i] = await Promise.all([
        api.get("/auth/users"),
        api.get("/admin/system-info"),
      ]);
      setUsers(u.data || []);
      setInfo(i.data);
    } catch (e) {
      toast.error("Could not load admin data");
    } finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const deleteUser = async (uid) => {
    if (!isAdmin) return;
    if (!window.confirm("Delete this user permanently? This cannot be undone.")) return;
    try {
      await api.delete(`/admin/users/${uid}`);
      toast.success("User deleted");
      refresh();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Could not delete");
    }
  };

  const StatCard = ({ icon: Icon, label, value, testid }) => (
    <div className="rounded-xl border divider-soft bg-white p-3 sm:p-4" data-testid={testid}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="text-[#5d6068]" />
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#5d6068]">{label}</div>
      </div>
      <div className="text-2xl font-bold text-[#0F1115]">{value ?? "—"}</div>
    </div>
  );

  return (
    <div className="space-y-6" data-testid="admin-page">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-[#0e3b4a] text-white flex items-center justify-center">
              <Settings size={16} />
            </div>
            <h1 className="text-3xl font-semibold text-[#0F1115]">Admin</h1>
          </div>
          <p className="text-[13px] text-[#5d6068] max-w-2xl">
            User management, role permissions, and system overview.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="px-3 py-2 rounded-lg bg-[#0e3b4a] text-white text-[13px] font-semibold hover:bg-[#0c2f3b] inline-flex items-center gap-2"
          data-testid="admin-add-user"
        >
          <Plus size={14} /> Create user
        </button>
      </div>

      {loading && <div className="py-12 text-center text-[13px] text-[#5d6068] inline-flex items-center justify-center gap-2 w-full"><Loader2 size={14} className="animate-spin" /> Loading…</div>}

      {!loading && (
        <>
          {/* System info */}
          <section>
            <h2 className="text-[15px] font-semibold text-[#0F1115] mb-3">System overview</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
              <StatCard icon={UsersIcon} label="Users" value={info?.users_total} testid="stat-users" />
              <StatCard icon={Building2} label="Residents" value={info?.residents_total} testid="stat-residents" />
              <StatCard icon={Activity} label="Incidents" value={info?.incidents_total} testid="stat-incidents" />
              <StatCard icon={FileText} label="Daily notes" value={info?.notes_total} testid="stat-notes" />
              <StatCard icon={ShieldCheck} label="Compliance logs" value={info?.compliance_logs_total} testid="stat-compliance" />
              <StatCard icon={HistoryIcon} label="Audit events" value={info?.audit_events_total} testid="stat-audit" />
              <div className="rounded-xl border divider-soft bg-white p-3 sm:p-4 col-span-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#5d6068] mb-1">Users by role</div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(info?.users_by_role || {}).map(([r, n]) => {
                    const t = ROLE_TONE[r] || { bg: "#eef0f3", fg: "#5d6068" };
                    return (
                      <span key={r}
                        className="text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded"
                        style={{ background: t.bg, color: t.fg }}>
                        {r} · {n}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* User list */}
          <section className="rounded-2xl border divider-soft bg-white overflow-hidden" data-testid="admin-users-section">
            <div className="px-4 py-3 border-b divider-soft flex items-center gap-2">
              <UsersIcon size={16} className="text-[#0e3b4a]" />
              <h2 className="text-[14px] font-semibold text-[#0F1115]">Users ({users.length})</h2>
            </div>
            <table className="w-full text-[13px]">
              <thead className="bg-stone-50 text-[10px] uppercase font-bold tracking-wider text-[#5d6068]">
                <tr>
                  <th className="text-left px-4 py-2.5">Name</th>
                  <th className="text-left px-4 py-2.5">Email</th>
                  <th className="text-left px-4 py-2.5">Role</th>
                  <th className="text-left px-4 py-2.5">Joined</th>
                  <th className="text-right px-4 py-2.5"> </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const t = ROLE_TONE[u.role] || { bg: "#eef0f3", fg: "#5d6068" };
                  return (
                    <tr key={u.id} className="border-t divider-soft" data-testid={`admin-user-row-${u.id}`}>
                      <td className="px-4 py-2.5 text-[#0F1115] font-medium">{u.name}</td>
                      <td className="px-4 py-2.5 text-[#5d6068]">{u.email}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded"
                          style={{ background: t.bg, color: t.fg }}>{u.role}</span>
                      </td>
                      <td className="px-4 py-2.5 text-[#5d6068] whitespace-nowrap">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString("en-GB") : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {isAdmin && u.id !== user.id && (
                          <button
                            type="button"
                            onClick={() => deleteUser(u.id)}
                            className="px-2 py-1 rounded text-[12px] font-semibold text-[#A8273A] hover:bg-[#A8273A]/10 inline-flex items-center gap-1"
                            data-testid={`admin-delete-user-${u.id}`}
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* Role/tier matrix */}
          <section className="rounded-2xl border divider-soft bg-white p-4 sm:p-5" data-testid="admin-role-matrix">
            <h2 className="text-[15px] font-semibold text-[#0F1115] mb-3">Roles &amp; permissions</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {ROLE_TIERS.map((rt) => {
                const tone = ROLE_TONE[rt.role];
                return (
                  <div key={rt.role} className="rounded-xl border divider-soft p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded"
                        style={{ background: tone.bg, color: tone.fg }}>Tier {rt.tier} · {rt.role}</span>
                      <span className="text-[14px] font-semibold text-[#0F1115]">{rt.label}</span>
                    </div>
                    <ul className="space-y-1 text-[12px] text-[#2f3038]">
                      {rt.grants.map((g) => (
                        <li key={g} className="flex items-start gap-1.5">
                          <span className="text-[#2F6A3A] mt-0.5">✓</span> {g}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={refresh}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
