import { Suspense } from "react";
import { EntitiesApp } from "@/components/EntitiesApp";

export default function EntitiesPage() {
  return (
    <Suspense fallback={<Bootstrapping />}>
      <EntitiesApp />
    </Suspense>
  );
}

function Bootstrapping() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[1280px] items-center justify-center px-6">
      <p className="font-mono text-[11px] uppercase tracking-archive text-muted">
        building entity graph…
      </p>
    </div>
  );
}
