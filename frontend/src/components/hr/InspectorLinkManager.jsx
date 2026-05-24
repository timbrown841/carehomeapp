/* Inspector Link Manager modal — Phase F.3
 *
 * Manager+ control surface for creating, listing, copying and revoking
 * time-limited read-only SCR preview links.
 *
 * Security-first UX:
 * - Required warning acknowledgement before link creation
 * - Token visible ONCE only (at creation), then never again
 * - Visible token-prefix per link in list for visual identification
 * - One-click revoke with confirmation
 */
import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import {
  X, Loader2, Copy, QrCode, ShieldCheck, AlertTriangle,
  Clock, Trash2, Eye, Link2, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const EXPIRY_OPTIONS = [
  { v: 1,  label: "1 hour" },
  { v: 4,  label: "4 hours (default)" },
  { v: 24, label: "24 hours" },
];

function fmtExpiry(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch { return "—"; }
}

export default function InspectorLinkManager({ filters, onClose }) {
  const [tab, setTab] = useState("create");
  const [hours, setHours] = useState(4);
  const [acknowledged, setAcknowledged] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);  // raw token + QR (one-time)
  const [links, setLinks] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [copyOk, setCopyOk] = useState(false);

  const loadLinks = useCallback(async () => {
    setLoadingList(true);
    try {
      const r = await api.get("/hr/scr/inspector-links?include_inactive=true");
      setLinks(r.data.links || []);
    } catch {
      toast.error("Could not load links");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { if (tab === "list") loadLinks(); }, [tab, loadLinks]);

  // When the user switches to "list" while ShareCard is mounted, clear it
  // so the LinkList becomes the primary visual.
  useEffect(() => {
    if (tab === "list" && created) {
      setCreated(null);
    }
  }, [tab, created]);

  const create = async () => {
    if (!acknowledged) {
      toast.error("Please acknowledge the security notice");
      return;
    }
    setCreating(true);
    try {
      const r = await api.post("/hr/scr/inspector-link", {
        expires_in_hours: hours,
        sector: "children",
        non_compliant_only: filters?.non_compliant_only || false,
        role: filters?.role || null,
        employment_type: filters?.employment_type || null,
        status: filters?.status || null,
      });
      setCreated(r.data);
      toast.success("Inspector link created");
      // also pre-load the list so when user switches tabs it's fresh
      loadLinks();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not create link");
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    if (!created?.share_url) return;
    try {
      await navigator.clipboard.writeText(created.share_url);
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 1500);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Could not copy");
    }
  };

  const revoke = async (id) => {
    if (!window.confirm("Revoke this inspector preview link immediately? This cannot be undone.")) return;
    try {
      await api.delete(`/hr/scr/inspector-link/${id}`);
      toast.success("Link revoked");
      await loadLinks();
    } catch {
      toast.error("Could not revoke link");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4"
      style={{ background: "rgba(11,14,22,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
      data-testid="inspector-link-manager"
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b divider-soft sticky top-0 bg-white z-10">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-[#B8772F]" />
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0e3b4a]">
                  Inspector preview links
                </span>
              </div>
              <h3 className="font-display font-semibold text-lg text-[#0F1115] mt-1"
                style={{ letterSpacing: "-0.02em" }}>
                Share the SCR with inspectors
              </h3>
              <p className="text-[12px] text-stone-600 mt-1">
                Time-limited · Read-only · Revocable · Audit-logged.
              </p>
            </div>
            <button type="button" onClick={onClose}
              className="p-1.5 rounded-md hover:bg-stone-100 text-stone-500"
              data-testid="inspector-link-manager-close">
              <X size={18} />
            </button>
          </div>

          {/* Tabs */}
          <div className="mt-3 flex gap-1">
            <TabBtn active={tab === "create"} onClick={() => { setTab("create"); setCreated(null); }} testid="inspector-link-tab-create">
              Create
            </TabBtn>
            <TabBtn active={tab === "list"} onClick={() => setTab("list")} testid="inspector-link-tab-list">
              Manage active links
            </TabBtn>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {tab === "create" && !created && (
            <CreateForm
              hours={hours} setHours={setHours}
              acknowledged={acknowledged} setAcknowledged={setAcknowledged}
              creating={creating} onCreate={create}
              filters={filters}
            />
          )}

          {tab === "create" && created && (
            <ShareCard created={created} copy={copy} copyOk={copyOk}
              onCreateAnother={() => setCreated(null)} />
          )}

          {tab === "list" && (
            <LinkList
              links={links}
              loading={loadingList}
              onRevoke={revoke}
              onRefresh={loadLinks}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children, testid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
        active ? "bg-[#0e3b4a] text-white" : "text-stone-600 hover:bg-stone-100"
      }`}
      data-testid={testid}
    >
      {children}
    </button>
  );
}

function CreateForm({ hours, setHours, acknowledged, setAcknowledged, creating, onCreate, filters }) {
  const activeFilters = [];
  if (filters?.non_compliant_only) activeFilters.push("non-compliant only");
  if (filters?.role) activeFilters.push(`role=${filters.role}`);
  if (filters?.employment_type) activeFilters.push(`employment=${filters.employment_type}`);
  if (filters?.status) activeFilters.push(`status=${filters.status}`);

  return (
    <div className="space-y-4" data-testid="inspector-link-create-form">
      {/* Security notice */}
      <div className="bg-[#FCEFD4] border-l-4 border-[#B8772F] rounded-r-lg p-3 flex items-start gap-2">
        <AlertTriangle size={14} className="text-[#7a4d12] mt-0.5 shrink-0" />
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#7a4d12]">
            Security notice
          </div>
          <p className="text-[12px] text-[#0F1115] mt-1 leading-relaxed">
            This link provides temporary read-only access to the Single Central Record.
            Do not share outside authorised inspection or governance purposes.
          </p>
        </div>
      </div>

      {/* Expiry selector */}
      <div>
        <label className="text-[11px] font-bold uppercase tracking-wider text-[#0e3b4a] block mb-2">
          Link expires in
        </label>
        <div className="grid grid-cols-3 gap-2" data-testid="inspector-link-expiry">
          {EXPIRY_OPTIONS.map((o) => (
            <button key={o.v} type="button"
              onClick={() => setHours(o.v)}
              className={`px-3 py-2 rounded-lg border text-[12px] font-semibold transition-colors ${
                hours === o.v
                  ? "bg-[#0e3b4a] text-white border-[#0e3b4a]"
                  : "bg-white border-stone-200 hover:border-[#0e3b4a]"
              }`}
              data-testid={`inspector-link-expiry-${o.v}`}>
              <Clock size={11} className="inline mr-1.5" />
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter snapshot preview */}
      <div className="bg-stone-50 rounded-lg p-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-1">
          Filter snapshot
        </div>
        {activeFilters.length === 0 ? (
          <p className="text-[12px] text-stone-700">All staff (no filters active)</p>
        ) : (
          <p className="text-[12px] text-stone-700">{activeFilters.join(" · ")}</p>
        )}
        <p className="text-[10px] text-stone-500 mt-1">
          The inspector will see the SCR with these exact filters applied.
        </p>
      </div>

      {/* Acknowledgement */}
      <label className="flex items-start gap-2 cursor-pointer p-2 -m-2 rounded hover:bg-stone-50">
        <input type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5 accent-[#0e3b4a]"
          data-testid="inspector-link-acknowledge" />
        <span className="text-[12px] text-[#0F1115] leading-relaxed">
          I confirm this link will be shared with an authorised inspector, Regulation 44
          visitor, Responsible Individual, or governance professional, and that all
          access is audit-logged.
        </span>
      </label>

      <Button onClick={onCreate} disabled={creating || !acknowledged}
        className="w-full bg-[#B8772F] hover:bg-[#a3661f] text-white text-[13px] h-10"
        data-testid="inspector-link-create-btn">
        {creating ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Link2 size={14} className="mr-1.5" />}
        Create inspector link
      </Button>
    </div>
  );
}

function ShareCard({ created, copy, copyOk, onCreateAnother }) {
  return (
    <div className="space-y-4" data-testid="inspector-link-share-card">
      <div className="bg-[#E7F3EC] border-l-4 border-[#2F6A3A] rounded-r-lg p-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-[#1f4f2b]">
          Link ready · Expires {fmtExpiry(created.expires_at)}
        </div>
        <p className="text-[12px] text-[#0F1115] mt-1">
          The full link is shown <strong>once</strong>. Copy it now or scan the QR code.
          You can revoke it any time from the "Manage active links" tab.
        </p>
      </div>

      {/* The actual link */}
      <div>
        <label className="text-[11px] font-bold uppercase tracking-wider text-[#0e3b4a]">Share URL</label>
        <div className="mt-1 flex items-center gap-2">
          <code className="flex-1 px-2.5 py-2 bg-stone-50 border divider-soft rounded-md text-[11px] font-mono break-all"
            data-testid="inspector-link-url">{created.share_url}</code>
          <Button onClick={copy} variant="outline"
            className="text-[12px] h-9"
            data-testid="inspector-link-copy-btn">
            {copyOk ? <Check size={12} className="mr-1 text-[#2F6A3A]" /> : <Copy size={12} className="mr-1" />}
            {copyOk ? "Copied!" : "Copy"}
          </Button>
        </div>
      </div>

      {/* QR Code */}
      <div className="bg-stone-50 rounded-xl p-4 text-center" data-testid="inspector-link-qr">
        <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-2 flex items-center justify-center gap-1.5">
          <QrCode size={11} /> Scan on site
        </div>
        <img src={created.qr_data_url} alt="Inspector preview QR code"
          className="mx-auto rounded-md border divider-soft bg-white p-2"
          style={{ maxWidth: 220 }} />
        <p className="text-[10px] text-stone-500 mt-2">
          Inspector can scan this QR with any phone camera — no Safelyn login required.
        </p>
      </div>

      <div className="flex gap-2">
        <Button onClick={onCreateAnother} variant="outline" className="flex-1 text-[12px] h-9"
          data-testid="inspector-link-create-another">
          Create another
        </Button>
      </div>
    </div>
  );
}

function LinkList({ links, loading, onRevoke, onRefresh }) {
  if (loading) {
    return (
      <div className="text-stone-500 text-sm flex items-center gap-2">
        <Loader2 size={14} className="animate-spin" /> Loading links…
      </div>
    );
  }
  if (links.length === 0) {
    return (
      <div className="bg-stone-50 rounded-xl p-6 text-center text-stone-500 text-[13px]"
        data-testid="inspector-links-empty">
        No inspector preview links yet.
      </div>
    );
  }
  return (
    <div className="space-y-2" data-testid="inspector-links-list">
      {links.map((l) => (
        <div key={l.id} className="bg-white border divider-soft rounded-lg p-3"
          data-testid={`inspector-link-row-${l.id}`}>
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-mono text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded">
                  {l.token_prefix}…
                </span>
                <StatusPill link={l} />
              </div>
              <div className="text-[11px] text-stone-600 mt-1">
                Created by <strong>{l.created_by_name || "—"}</strong>
                {" · "}{fmtExpiry(l.created_at)}
              </div>
              <div className="text-[11px] text-stone-500">
                Expires {fmtExpiry(l.expires_at)} ·
                <Eye size={10} className="inline mx-1" />
                {l.view_count} view{l.view_count === 1 ? "" : "s"}
                {l.last_viewed_at && <> · last viewed {fmtExpiry(l.last_viewed_at)}</>}
              </div>
              {l.revoked_at && (
                <div className="text-[11px] text-[#A8273A] mt-0.5">
                  Revoked {fmtExpiry(l.revoked_at)}
                  {l.revoked_by_name && <> by {l.revoked_by_name}</>}
                </div>
              )}
            </div>
            {l.is_active && (
              <Button variant="outline" size="sm" onClick={() => onRevoke(l.id)}
                className="text-[11px] h-7 border-[#A8273A] text-[#A8273A] hover:bg-[#A8273A0a]"
                data-testid={`inspector-link-revoke-${l.id}`}>
                <Trash2 size={11} className="mr-1" /> Revoke
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusPill({ link }) {
  let bg, fg, label;
  if (link.is_revoked) {
    bg = "#FBE3E7"; fg = "#7a1a28"; label = "Revoked";
  } else if (link.is_expired) {
    bg = "#F1EFEC"; fg = "#5d6068"; label = "Expired";
  } else {
    bg = "#E7F3EC"; fg = "#1f4f2b"; label = "Active";
  }
  return (
    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{ background: bg, color: fg }}>
      {label}
    </span>
  );
}
