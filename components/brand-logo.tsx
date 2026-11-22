import Link from "next/link";
import { Sparkles } from "lucide-react";

type BrandLogoProps = {
  href?: string;
  compact?: boolean;
};

export function BrandLogo({ href = "/", compact = false }: BrandLogoProps) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2.5 text-slate-900 hover:opacity-90 transition-opacity"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-xs">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
      </span>
      {!compact && (
        <span className="text-base font-semibold tracking-tight text-slate-900">
          StoreMind <span className="text-indigo-600">AI</span>
        </span>
      )}
    </Link>
  );
}
