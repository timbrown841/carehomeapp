import { ShieldCheck, FileLock2, UserCheck, Clipboard, Lock } from "lucide-react";

export default function SaferRecruitment() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto" data-testid="safer-recruitment-page">
      <header>
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0e3b4a]">
          HR · Safeguarding · GDPR
        </div>
        <h1
          className="font-display font-semibold text-3xl tracking-tight text-[#0F1115] mt-1.5"
          style={{ letterSpacing: "-0.02em" }}
        >
          Safer Recruitment & HR
        </h1>
        <p className="text-[#5d6068] mt-1.5 text-[15px]">
          DBS, right-to-work, references, interviews, employment history, identity checks, probation, disciplinary records, occupational health and the Single Central Record.
        </p>
      </header>

      <div className="bg-[#0e3b4a]/5 border-l-4 border-[#0e3b4a] divider-soft border-y border-r rounded-2xl p-5 flex items-start gap-4">
        <span className="w-10 h-10 rounded-xl bg-[#0e3b4a] text-white flex items-center justify-center shrink-0">
          <Lock size={18} />
        </span>
        <div>
          <div className="font-semibold text-[#0F1115]">Restricted area</div>
          <p className="text-sm text-[#2f3038] mt-1">
            This module is HR/management-only. Once role-based permissions are wired up (Phase B), only HR, Registered Manager, Responsible Individual and Admin roles will see this section. Support Workers and Senior Support Workers will not see it at all.
          </p>
        </div>
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#5d6068] px-1 mb-3">
          Coming up
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { icon: ShieldCheck, label: "DBS Checks", desc: "Enhanced DBS uploads, expiry tracking, update-service status." },
            { icon: UserCheck, label: "Right to Work", desc: "Document uploads, share codes, expiry reminders." },
            { icon: Clipboard, label: "References & Interviews", desc: "Reference forms, interview record templates, panel notes." },
            { icon: FileLock2, label: "Single Central Record", desc: "Live SCR view with one-click PDF export for inspections." },
          ].map((b) => (
            <div
              key={b.label}
              className="bg-white border divider-soft rounded-xl p-4 flex items-start gap-3"
            >
              <span className="w-9 h-9 rounded-lg bg-[#0e3b4a]/10 text-[#0e3b4a] flex items-center justify-center shrink-0">
                <b.icon size={16} />
              </span>
              <div>
                <div className="font-semibold text-sm text-[#0F1115]">
                  {b.label}
                </div>
                <p className="text-xs text-[#5d6068] mt-0.5">{b.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
