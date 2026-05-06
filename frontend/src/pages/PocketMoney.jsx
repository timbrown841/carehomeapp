import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { Wallet, PiggyBank, ArrowUpRight, Coins, Loader2 } from "lucide-react";

const fmt = (n, currency = "GBP") => {
  const s = currency === "GBP" ? "£" : currency + " ";
  const num = Number(n || 0);
  return `${num < 0 ? "-" : ""}${s}${Math.abs(num).toFixed(2)}`;
};

function ageBadge(d) {
  if (!d) return null;
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  if (days >= 14) return { tone: "#A8273A", label: `${days}d ago` };
  if (days >= 7) return { tone: "#B8772F", label: `${days}d ago` };
  return { tone: "#2F6A3A", label: days === 0 ? "today" : `${days}d ago` };
}

export default function PocketMoney() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/pocket-money")
      .then((r) => setRows(r.data || []))
      .finally(() => setLoading(false));
  }, []);

  const totals = useMemo(() => {
    let total = 0,
      weekly = 0;
    for (const r of rows) {
      total += Number(r.total_balance || 0);
      weekly += Number(r.weekly_allowance || 0);
    }
    return { total, weekly };
  }, [rows]);

  return (
    <div className="space-y-5 max-w-5xl mx-auto" data-testid="pocket-money-page">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0e3b4a]">
          Finance · Personal allowance
        </div>
        <h1
          className="font-display font-semibold text-3xl tracking-tight text-[#0F1115] mt-1.5"
          style={{ letterSpacing: "-0.02em" }}
        >
          Pocket money & personal allowance
        </h1>
        <p className="text-[#5d6068] mt-1.5 text-[15px]">
          Live balances and last activity for every young person. Open a profile to see all 17 finance categories or download a monthly statement.
        </p>
      </header>

      <div className="grid sm:grid-cols-3 gap-3">
        <Stat icon={Wallet} tone="#0e3b4a" label="Total finance held" value={fmt(totals.total)} testid="pm-total-finance" />
        <Stat icon={PiggyBank} tone="#2F6A3A" label="Weekly allowance (combined)" value={fmt(totals.weekly)} testid="pm-total-weekly" sub={`${rows.length} young ${rows.length === 1 ? "person" : "people"}`} />
        <Stat icon={Coins} tone="#B8772F" label="Categories per resident" value="17" testid="pm-cat-count" sub="Pocket, savings, clothing, trust, transport, gifts and more" />
      </div>

      {loading ? (
        <div className="text-center py-10 text-[#5d6068]">
          <Loader2 className="animate-spin inline" />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white border divider-soft rounded-xl p-8 text-center text-sm text-[#5d6068]">
          No residents yet.
        </div>
      ) : (
        <div className="bg-white border divider-soft rounded-xl overflow-hidden">
          <table className="w-full text-sm" data-testid="pm-table">
            <thead className="bg-stone-50 border-b divider-soft">
              <tr className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
                <th className="text-left px-4 py-2.5">Young person</th>
                <th className="text-right px-4 py-2.5">Total</th>
                <th className="text-right px-4 py-2.5">Pocket</th>
                <th className="text-right px-4 py-2.5">Savings</th>
                <th className="text-right px-4 py-2.5">Weekly</th>
                <th className="text-left px-4 py-2.5">Last activity</th>
                <th className="text-right px-4 py-2.5">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y divider-soft">
              {rows.map((r) => {
                const age = ageBadge(r.last_tx_date);
                const cur = r.currency || "GBP";
                return (
                  <tr key={r.resident_id} data-testid={`pm-row-${r.resident_id}`} className="hover:bg-stone-50/60">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#0F1115]">{r.name}</div>
                      <div className="text-[11px] text-[#5d6068]">
                        {r.preferred_name && r.preferred_name !== r.name ? `“${r.preferred_name}”` : ""}
                        {r.room ? ` · Room ${r.room}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-[#0e3b4a]">
                      {fmt(r.total_balance, cur)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[#0F1115]">
                      {fmt(r.pocket_balance, cur)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[#2F6A3A]">
                      {fmt(r.savings_balance, cur)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(r.weekly_allowance, cur)}</td>
                    <td className="px-4 py-3">
                      {r.last_tx_label ? (
                        <div>
                          <div className="text-[#0F1115] text-[13px] truncate max-w-[200px]">
                            {r.last_tx_label}
                          </div>
                          {age && (
                            <span
                              className="text-[10px] font-bold uppercase tracking-wider"
                              style={{ color: age.tone }}
                            >
                              {age.label}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[#8a8d95] italic text-xs">No activity</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/residents/${r.resident_id}?tab=pocket-money`}
                        className="inline-flex items-center gap-1 text-[#0e3b4a] font-semibold text-xs hover:underline"
                        data-testid={`pm-open-${r.resident_id}`}
                      >
                        Open <ArrowUpRight size={12} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, tone, label, value, sub, testid }) {
  return (
    <div
      data-testid={testid}
      className="bg-white border-l-4 border-y border-r divider-soft rounded-xl p-4"
      style={{ borderLeftColor: tone }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#5d6068]">
          {label}
        </div>
        <span
          className="w-7 h-7 rounded-md flex items-center justify-center"
          style={{ background: tone + "14", color: tone }}
        >
          <Icon size={14} />
        </span>
      </div>
      <div
        className="font-display text-2xl font-black tabular-nums mt-1.5"
        style={{ color: tone }}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-[#5d6068] mt-1">{sub}</div>}
    </div>
  );
}
