import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";
import Logo, { WordMark } from "@/components/Logo";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("admin@care.local");
  const [password, setPassword] = useState("Admin@123");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
      toast.success("Welcome back");
      nav("/");
    } catch (err) {
      const msg = formatApiError(err.response?.data?.detail) || "Login failed";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-canvas">
      {/* Left brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-[#0F2A47] via-[#1E4D5C] to-[#2D6A4F] text-stone-100 relative overflow-hidden">
        <div className="flex items-center gap-3">
          <Logo size={42} mono />
          <div>
            <div className="font-display font-bold text-xl text-white">
              Safelyn <span className="text-white/70">Systems</span>
            </div>
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/60">
              Care · Safeguarding · Compliance
            </div>
          </div>
        </div>

        <div className="relative z-10">
          <h1 className="font-display font-black text-5xl leading-tight tracking-tight mb-4">
            Reducing risk.
            <br />
            Improving care.
            <br />
            Empowering staff.
          </h1>
          <p className="text-white/70 max-w-md leading-relaxed">
            A calmer way for children's homes and adult-care teams to log daily
            notes, manage safeguarding and stay inspection-ready. Just speak — we'll
            handle the rest.
          </p>

          <div className="mt-12 grid grid-cols-3 gap-4 max-w-lg">
            {[
              { k: "Voice-first", v: "Log in seconds, on the move" },
              { k: "Safeguarding", v: "Flags & manager summaries" },
              { k: "Auditable", v: "Every entry timestamped" },
            ].map((f) => (
              <div key={f.k} className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="font-display font-semibold text-white mb-1">{f.k}</div>
                <div className="text-xs text-white/70 leading-relaxed">{f.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-xs text-white/50">
          © {new Date().getFullYear()} Safelyn Systems · Built with care.
        </div>

        <div className="absolute -right-32 -bottom-32 w-96 h-96 rounded-full bg-[#E57A5D]/20 blur-3xl"></div>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <Logo size={42} />
            <WordMark />
          </div>

          <h2 className="font-display font-black text-3xl sm:text-4xl mb-2 text-stone-900">
            Sign in
          </h2>
          <p className="text-stone-600 mb-8">
            Welcome back. Continue providing exceptional care.
          </p>

          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="text-sm font-medium text-stone-700 mb-1.5 block">
                Email
              </label>
              <input
                data-testid="login-email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white border divider-soft rounded-xl px-4 py-3 text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#1E4D5C] focus:border-transparent"
                placeholder="you@home.uk"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-stone-700 mb-1.5 block">
                Password
              </label>
              <input
                data-testid="login-password-input"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white border divider-soft rounded-xl px-4 py-3 text-stone-900 focus:outline-none focus:ring-2 focus:ring-[#1E4D5C] focus:border-transparent"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div
                data-testid="login-error"
                className="text-sm text-[#B23A48] bg-[#B23A48]/10 border border-[#B23A48]/20 rounded-lg px-4 py-2.5"
              >
                {error}
              </div>
            )}

            <button
              data-testid="login-submit-btn"
              type="submit"
              disabled={busy}
              className="w-full bg-[#1E4D5C] hover:bg-[#163A47] disabled:opacity-50 text-white font-medium rounded-xl px-6 py-3.5 transition-colors flex items-center justify-center gap-2"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              Sign in
            </button>
          </form>

          <div className="mt-8 p-4 rounded-xl bg-stone-100 border divider-soft text-xs text-stone-600 leading-relaxed">
            <div className="font-semibold text-stone-700 mb-1.5">Demo accounts</div>
            <div>
              <code className="text-[#1E4D5C]">admin@care.local</code> / Admin@123 ·{" "}
              <code className="text-[#1E4D5C]">manager@care.local</code> / Manager@123 ·{" "}
              <code className="text-[#1E4D5C]">senior@care.local</code> / Senior@123 ·{" "}
              <code className="text-[#1E4D5C]">staff@care.local</code> / Staff@123
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
