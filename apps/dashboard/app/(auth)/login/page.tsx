import { Bot, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signInWithDiscord } from "./actions";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6">
      <section className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-2xl shadow-black/10">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Bot aria-hidden="true" />
          </span>
          <span className="text-xl font-semibold tracking-[0.18em]">NEXUS</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Manage your community</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Sign in with Discord to configure servers where you have Manage Server or Administrator access.
        </p>
        <form action={signInWithDiscord} className="mt-8">
          <Button type="submit" size="lg" className="w-full">
            <ShieldCheck data-icon="inline-start" />
            Continue with Discord
          </Button>
        </form>
        <p className="mt-6 text-xs leading-5 text-muted-foreground">
          Nexus requests identity and server-list access only. Sensitive actions are authorized again on the server.
        </p>
        <nav aria-label="Legal" className="mt-5 flex gap-4 border-t pt-5 text-xs text-muted-foreground">
          <Link className="hover:text-foreground" href="/de/nutzungsbedingungen">Nutzungsbedingungen</Link>
          <Link className="hover:text-foreground" href="/de/datenschutz">Datenschutz</Link>
        </nav>
      </section>
    </main>
  );
}
