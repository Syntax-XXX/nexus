import { redirect } from "next/navigation";
import { AppShell } from "@/components/dashboard/app-shell";
import { Overview, type OverviewData } from "@/components/dashboard/overview";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const e2eData: OverviewData = {
  online: true,
  shardLabel: "Shard 2 of 4",
  gatewayLatencyMs: 42,
  uptime: "14d 7h",
  commandActivity: [602, 891, 703, 431, 641, 832, 579],
  plugins: [
    { name: "Moderation", health: "healthy" },
    { name: "Verification", health: "healthy" },
    { name: "Tickets", health: "degraded" },
    { name: "Streamer", health: "disabled" },
  ],
  activity: [
    { event: "Configuration updated", actor: "Elias", plugin: "Settings", time: "14:32" },
    { event: "Warning issued", actor: "Nova", plugin: "Moderation", time: "14:21" },
    { event: "Ticket closed", actor: "Starfall", plugin: "Tickets", time: "13:58" },
    { event: "Member verified", actor: "Mira", plugin: "Verification", time: "13:47" },
  ],
};

export const metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const testMode = process.env.NODE_ENV !== "production" && process.env.NEXUS_E2E_BYPASS_AUTH === "true";
  if (testMode) return <AppShell activePath="/dashboard" guildName="Arcadia Community" userName="Elias"><Overview data={e2eData} /></AppShell>;

  let supabase;
  try { supabase = await createSupabaseServerClient(); } catch { redirect("/login"); }
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) redirect("/login");

  const apiUrl = process.env.API_URL;
  if (!apiUrl) throw new Error("API_URL is not configured");
  const guildResponse = await fetch(`${apiUrl}/v1/guilds`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!guildResponse.ok) throw new Error("Guilds could not be loaded");
  const guilds = await guildResponse.json() as Array<{ id: string; name: string }>;
  const guild = guilds[0];
  if (!guild) redirect("/dashboard/select-guild");
  const pluginResponse = await fetch(`${apiUrl}/v1/guilds/${guild.id}/plugins`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  const plugins = pluginResponse.ok ? await pluginResponse.json() as Array<{ name: string; health: "healthy" | "degraded" | "disabled" }> : [];
  const data: OverviewData = { online: false, shardLabel: "Shard unavailable", gatewayLatencyMs: null, uptime: null, commandActivity: [0, 0, 0, 0, 0, 0, 0], plugins: plugins.slice(0, 4), activity: [] };
  const name = typeof claims.claims.user_metadata?.full_name === "string" ? claims.claims.user_metadata.full_name : "Administrator";
  return <AppShell activePath="/dashboard" guildName={guild.name} userName={name}><Overview data={data} /></AppShell>;
}
