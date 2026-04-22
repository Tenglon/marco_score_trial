import { Suspense } from "react";
import { SearchApp } from "@/components/SearchApp";

export default function Page() {
  return (
    <Suspense fallback={<Bootstrapping />}>
      <SearchApp />
    </Suspense>
  );
}

function Bootstrapping() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[1280px] items-center justify-center px-6">
      <p className="font-mono text-[11px] uppercase tracking-archive text-muted">
        loading archive…
      </p>
    </div>
  );
}
