import { Suspense } from "react";
import { VisualApp } from "@/components/VisualApp";

export default function VisualPage() {
  return (
    <Suspense fallback={<Bootstrapping />}>
      <VisualApp />
    </Suspense>
  );
}

function Bootstrapping() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[1280px] items-center justify-center px-6">
      <p className="font-mono text-[11px] uppercase tracking-archive text-muted">
        loading visual engine…
      </p>
    </div>
  );
}
