"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signInWithDiscord() {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!origin) throw new Error("Dashboard URL is not configured");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "discord",
    options: {
      redirectTo: `${origin}/auth/callback?next=/dashboard`,
      scopes: "identify guilds",
    },
  });
  if (error || !data.url) redirect("/login?error=oauth_start");
  redirect(data.url);
}
