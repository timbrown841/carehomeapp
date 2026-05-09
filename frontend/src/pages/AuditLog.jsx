import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Link } from "react-router-dom";
import {
  History,
  Search,
  Filter,
  User,
  ShieldCheck,
  FileText,
  Camera,
  Pencil,
  PlusCircle,
  Trash2,
  Loader2,
  CalendarRange,
  ChevronRight,
  X,
} from "lucide-react";

const ACTION_META = {
  create: { label: "Created", tone: "#3F4F8C", icon: PlusCircle },
  update: { label: "Updated", tone: "#0e3b4a", icon: Pencil },
  update_status: { label: "Status changed", tone: "#0e3b4a", icon: Pencil },
  upload_photo: { label: "Photo uploaded", tone: "#3F4F8C", icon: Camera },
  remove_photo: { label: "Photo removed", tone: "#A8273A", icon: Camera },
  upload_document: { label: "Document uploaded", tone: "#3F4F8C", icon: FileText },
  delete_document: { label: "Document deleted", tone: "#A8273A", icon: Trash2 },
  sign_off: { label: "Signed off", tone: "#2F6A3A", icon: ShieldCheck },
  delete: { label: "Deleted", tone: "#A8273A", icon: Trash2 },
};

const OBJECT_LABEL = {
  resident: "Resident",
  incident: "Incident",
  document: "Document",
  return_interview: "Return Interview",
  resident_photo: "Resident Photo",
  missing_episode: "Missing Episode",
  handover: "Handover",
};

function formatTs(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function shortRef(id) {
  if (!id) return "";
  return String(id).replace(/-/g, "").slice(-8).toUpperCase();
}

function actorInitials(name) {
  if (!name) return "—";
  return name
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function ChangeChip({ field, before, after }) {
  const fmt = (v) => {
    if (v == null || v === "") return "—";
    if (typeof v === "object") return JSON.stringify(v).slice(0, 60);
    const s = String(v);
    return s.length > 80 ? s.slice(0, 80) + "…" : s;
  };
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-stone-50 border divider-soft text-[11px]"
      data-testid={`audit-change-${field}`}
    >
      <span className="font-bold uppercase tracking-wider text-[10px] text-[#5d6068]">{field}</span>
      <span className="text-[#A8273A] line-through max-w-[120px] truncate">{fmt(before)}</span>
      <ChevronRight size={11} className="text-[#5d6068]" />
      <span className="text-[#2F6A3A] font-semibold max-w-[160px] truncate">{fmt(after)}</span>
    </div>
  );
}

export default function AuditLog() {
  const { isSeniorOrAbove } = useAuth();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [facets, setFacets] = useState({ actors: [], object_types: [], actions: [] });
  const [filters, setFilters] = useState({
    q: "",
    actor_id: "",
    object_type: "",
    action: "",
    from_at: "",
    to_at: "",
  });
  const [residents, setResidents] = useState([]);
  const [residentFilter, setResidentFilter] = useState("");

  useEffect(() => {
    api.get("/audit/facets").then((r) => setFacets(r.data || {})).catch(() => {});
    api.get("/residents").then((r) => setResidents(r.data || [])).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
      if (residentFilter) params.set("resident_id", residentFilter);
      params.set("limit", "300");
      const r = await api.get(`/audit?${params.toString()}`);
      setItems(r.data?.items || []);
      setTotal(r.data?.total || 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, residentFilter]);

  const residentNameById = useMemo(() => {
    const m = {};
    residents.forEach((r) => (m[r.id] = r.name));
    return m;
  }, [residents]);

  const grouped = useMemo(() => {
    const groups = {};
    items.forEach((e) => {
      const day = (e.at || "").slice(0, 10);
      if (!groups[day]) groups[day] = [];
      groups[day].push(e);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [items]);

  const clearFilters = () =>
    setFilters({ q: "", actor_id: "", object_type: "", action: "", from_at: "", to_at: "" }) ||
    setResidentFilter("");

  if (!isSeniorOrAbove) {
    return (
      <div className="text-center py-16 text-stone-500" data-testid="audit-no-access">
        Audit log is available to seniors, managers and admins.
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-6xl mx-auto" data-testid="audit-log-page">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0e3b4a]">
          Inspection-ready accountability
        </div>
        <h1
          className="font-display font-semibold text-3xl tracking-tight text-[#0F1115] mt-1.5"
          style={{ letterSpacing: "-0.02em" }}
        >
          Audit log
        </h1>
        <p className="text-[#5d6068] mt-1.5 text-[15px]">
          Every safeguarding-relevant action across Safelyn Systems — who did what, when, and what
          changed. Append-only · time-stamped · inspector-friendly.
        </p>
      </header>

      {/* Filter bar */}
      <section
        className="bg-white border divider-soft rounded-2xl p-4 space-y-3"
        data-testid="audit-filters"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a8d95]" />
            <input
              data-testid="audit-search"
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              placeholder="Search summary or staff name…"
              className="w-full bg-stone-50 border divider-soft rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]"
            />
          </div>
          <select
            value={residentFilter}
            onChange={(e) => setResidentFilter(e.target.value)}
            data-testid="audit-resident-filter"
            className="bg-stone-50 border divider-soft rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]"
          >
            <option value="">All residents</option>
            {residents.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <select
            value={filters.actor_id}
            onChange={(e) => setFilters({ ...filters, actor_id: e.target.value })}
            data-testid="audit-actor-filter"
            className="bg-stone-50 border divider-soft rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]"
          >
            <option value="">All staff</option>
            {(facets.actors || []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.count})
              </option>
            ))}
          </select>
          <select
            value={filters.object_type}
            onChange={(e) => setFilters({ ...filters, object_type: e.target.value })}
            data-testid="audit-object-filter"
            className="bg-stone-50 border divider-soft rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]"
          >
            <option value="">All record types</option>
            {(facets.object_types || []).map((o) => (
              <option key={o} value={o}>
                {OBJECT_LABEL[o] || o}
              </option>
            ))}
          </select>
          <select
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
            data-testid="audit-action-filter"
            className="bg-stone-50 border divider-soft rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]"
          >
            <option value="">All actions</option>
            {(facets.actions || []).map((a) => (
              <option key={a} value={a}>
                {ACTION_META[a]?.label || a}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={clearFilters}
            data-testid="audit-clear-filters"
            className="text-xs text-[#5d6068] hover:text-[#A8273A] inline-flex items-center gap-1"
          >
            <X size={12} /> Clear
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <CalendarRange size={14} className="text-[#5d6068]" />
          <input
            type="date"
            value={filters.from_at ? filters.from_at.slice(0, 10) : ""}
            onChange={(e) =>
              setFilters({ ...filters, from_at: e.target.value ? `${e.target.value}T00:00:00` : "" })
            }
            data-testid="audit-from"
            className="bg-stone-50 border divider-soft rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]"
          />
          <span className="text-xs text-[#5d6068]">to</span>
          <input
            type="date"
            value={filters.to_at ? filters.to_at.slice(0, 10) : ""}
            onChange={(e) =>
              setFilters({ ...filters, to_at: e.target.value ? `${e.target.value}T23:59:59` : "" })
            }
            data-testid="audit-to"
            className="bg-stone-50 border divider-soft rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0e3b4a]"
          />
          <span className="ml-auto text-xs text-[#5d6068]" data-testid="audit-result-count">
            {loading ? "…" : `${items.length} of ${total} events`}
          </span>
        </div>
      </section>

      {/* Events grouped by day */}
      {loading ? (
        <div className="text-center py-12 text-[#5d6068]">
          <Loader2 className="animate-spin inline" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="bg-white border divider-soft rounded-2xl p-10 text-center" data-testid="audit-empty">
          <span className="inline-flex w-10 h-10 rounded-xl bg-[#0e3b4a]/10 text-[#0e3b4a] items-center justify-center">
            <History size={18} />
          </span>
          <p className="text-sm text-[#5d6068] mt-2">No audit events match these filters.</p>
        </div>
      ) : (
        <ul className="space-y-5" data-testid="audit-events-list">
          {grouped.map(([day, events]) => (
            <li key={day}>
              <div className="flex items-center gap-2 mb-2 sticky top-0 bg-canvas py-1 z-10">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#5d6068]">
                  {new Date(day).toLocaleDateString("en-GB", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
                <span className="flex-1 h-px bg-stone-200" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
                  {events.length} event{events.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="space-y-2">
                {events.map((e) => {
                  const meta = ACTION_META[e.action] || { label: e.action, tone: "#5d6068", icon: History };
                  const Icon = meta.icon;
                  return (
                    <li
                      key={e.id}
                      data-testid={`audit-event-${e.id}`}
                      className="bg-white border-l-4 border-y border-r divider-soft rounded-xl p-3 sm:p-4 flex items-start gap-3"
                      style={{ borderLeftColor: meta.tone }}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white font-bold text-[10px]"
                        style={{ background: meta.tone }}
                      >
                        {actorInitials(e.actor_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded text-white inline-flex items-center gap-1"
                            style={{ background: meta.tone }}
                          >
                            <Icon size={10} /> {meta.label}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
                            {OBJECT_LABEL[e.object_type] || e.object_type}
                          </span>
                          {e.resident_id && (
                            <Link
                              to={`/residents/${e.resident_id}`}
                              data-testid={`audit-event-${e.id}-resident-link`}
                              className="text-[11px] text-[#0e3b4a] hover:underline font-semibold"
                            >
                              {residentNameById[e.resident_id] || "Resident"}
                            </Link>
                          )}
                          <span className="text-[10px] font-mono uppercase tracking-wider text-[#8a8d95]">
                            #{shortRef(e.object_id)}
                          </span>
                        </div>
                        <div className="font-semibold text-sm text-[#0F1115] mt-1">{e.summary}</div>
                        <div className="text-[11px] text-[#5d6068] mt-0.5 inline-flex items-center gap-1.5">
                          <User size={10} /> {e.actor_name || "—"}{" "}
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-stone-100">
                            {e.actor_role || "—"}
                          </span>
                          <span>·</span>
                          <span>{formatTs(e.at)}</span>
                        </div>
                        {Object.keys(e.changes || {}).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {Object.entries(e.changes).map(([f, c]) => (
                              <ChangeChip key={f} field={f} before={c.before} after={c.after} />
                            ))}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
