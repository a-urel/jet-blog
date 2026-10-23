import { Skeleton } from "@/components/ui/skeleton";

// Admin pages are dynamic (session-bound), so navigation shows this skeleton
// inside the admin layout while the page reads its data. Public ISR routes have
// no loading.tsx: their prerendered HTML needs none, and a streaming boundary
// could send the response status before notFound() or a slug redirect runs.
export default function AdminLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">Yükleniyor…</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-full max-w-md" />
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}
