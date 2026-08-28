import Link from "next/link";
import { AlertTriangle, Bot, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LegalPage({ title, updated, children, operator }: { readonly title: string; readonly updated: string; readonly children: React.ReactNode; readonly operator?: { readonly configured: boolean; readonly missing: readonly string[] } }) {
  return (
    <main className="min-h-svh bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-3 font-semibold tracking-[0.16em]"><Bot className="text-primary" />NEXUS</Link>
          <Button variant="ghost" asChild><Link href="/"><ChevronLeft data-icon="inline-start" />Zurück</Link></Button>
        </div>
      </header>
      <article className="mx-auto max-w-4xl px-5 py-12 md:py-16">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">Stand: {updated}</p>
        {operator && !operator.configured ? <div role="alert" className="mt-6 flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm leading-6 text-amber-950 dark:text-amber-100"><AlertTriangle className="mt-1 size-4 shrink-0" /><p><strong>Betreiberangaben fehlen.</strong> Vor dem öffentlichen Produktivbetrieb müssen die Umgebungsvariablen <code>{operator.missing.join(", ")}</code> mit den echten Anbieterangaben befüllt und diese Texte rechtlich geprüft werden.</p></div> : null}
        <div className="legal-content mt-10">{children}</div>
      </article>
    </main>
  );
}
