import { useSearchParams } from "react-router-dom";

/**
 * Reusable hub tab strip. Tabs are URL-deep-linkable via ?tab=<id>.
 * Props:
 *  - tabs: [{ id, label, icon, badge?, hidden? }]
 *  - defaultTab: id of the first tab
 *  - testidPrefix: data-testid prefix for each tab (e.g. "residents-tab")
 *  - children: function (activeId) => ReactNode
 */
export default function HubTabs({ tabs, defaultTab, testidPrefix, children }) {
  const [params, setParams] = useSearchParams();
  const visible = tabs.filter((t) => !t.hidden);
  const requested = params.get("tab");
  const active = visible.find((t) => t.id === requested)?.id || defaultTab || visible[0]?.id;

  const setActive = (id) => {
    const next = new URLSearchParams(params);
    next.set("tab", id);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1 border-b divider-soft overflow-x-auto -mx-1 px-1" data-testid={`${testidPrefix}-tabstrip`}>
        {visible.map((t) => {
          const Icon = t.icon;
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              className={`px-3 py-2 -mb-px border-b-2 text-[13px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                isActive
                  ? "text-[#0e3b4a] border-[#0e3b4a]"
                  : "text-[#5d6068] border-transparent hover:text-[#0F1115]"
              }`}
              data-testid={`${testidPrefix}-${t.id}`}
            >
              {Icon && <Icon size={14} />}
              {t.label}
              {t.badge != null && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-[#0e3b4a]/10 text-[#0e3b4a] text-[10px] font-bold px-1.5">
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div>{children(active)}</div>
    </div>
  );
}
