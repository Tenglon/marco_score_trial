import { Suspense } from "react";
import { CompareApp } from "@/components/CompareApp";

export default function ComparePage() {
  return (
    <Suspense fallback={<Bootstrapping />}>
      <CompareApp />
    </Suspense>
  );
}

function Bootstrapping() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[1280px] items-center justify-center px-6">
      <p className="font-mono text-[11px] uppercase tracking-archive text-muted">
        comparing…
      </p>
    </div>
  );
}
