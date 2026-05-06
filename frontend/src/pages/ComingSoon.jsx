import { Link } from "react-router-dom";
import { Construction, ArrowLeft } from "lucide-react";

export default function ComingSoon({ title, description, icon: Icon = Construction }) {
  return (
    <div className="space-y-6" data-testid={`coming-soon-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <div>
        <h1 className="font-display font-semibold text-3xl tracking-tight text-stone-900">
          {title}
        </h1>
        <p className="text-stone-600 mt-1 max-w-2xl">{description}</p>
      </div>

      <div className="bg-white border divider-soft rounded-2xl p-10 sm:p-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-[#1E4D5C]/10 text-[#1E4D5C] flex items-center justify-center mx-auto mb-5">
          <Icon size={28} />
        </div>
        <h3 className="font-display font-bold text-2xl text-stone-900">
          Coming soon
        </h3>
        <p className="text-stone-600 mt-2 max-w-md mx-auto leading-relaxed">
          We're polishing this module to keep your home audit-ready and your
          team supported. It will appear here in a future update.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 mt-6 text-sm font-semibold text-[#1E4D5C] hover:underline"
        >
          <ArrowLeft size={14} /> Back to dashboard
        </Link>
      </div>
    </div>
  );
}
