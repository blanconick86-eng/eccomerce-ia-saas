import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "StoreOne — Chat Support",
  robots: {
    index: false,
    follow: false,
  },
};

export default function WidgetLayout({ children }: { children: ReactNode }) {
  return (
    <div className="h-dvh w-full overflow-hidden bg-white">{children}</div>
  );
}
