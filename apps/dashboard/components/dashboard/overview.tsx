import { Activity, Bot, Clock3, ExternalLink, Layers3, Radio, Settings, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface OverviewData {
  readonly online: boolean;
  readonly shardLabel: string;
  readonly gatewayLatencyMs: number | null;
  readonly uptime: string | null;
  readonly commandActivity: readonly number[];
  readonly plugins: readonly { name: string; health: "healthy" | "degraded" | "disabled" }[];
  readonly activity: readonly { event: string; actor: string; plugin: string; time: string }[];
}

const healthClass = {
  healthy: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  degraded: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  disabled: "border-border bg-muted text-muted-foreground",
} as const;

export function Overview({ data }: { readonly data: OverviewData }) {
  const max = Math.max(...data.commandActivity, 1);
  const points = data.commandActivity.map((value, index) => {
    const x = data.commandActivity.length === 1 ? 0 : (index / (data.commandActivity.length - 1)) * 100;
    return `${x},${100 - (value / max) * 78}`;
  }).join(" ");

  return (
    <main className="mx-auto w-full max-w-[1500px] p-4 md:p-7 lg:p-8">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Overview</h1>
          <p className="mt-2 text-muted-foreground">Your community at a glance</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline"><ExternalLink data-icon="inline-start" />Invite Nexus</Button>
          <Button><Settings data-icon="inline-start" />Configure server</Button>
        </div>
      </div>

      <section aria-label="Bot status" className="mt-8 grid divide-y border-y md:grid-cols-4 md:divide-x md:divide-y-0">
        <Status icon={Bot} label={data.online ? "Bot online" : "Bot offline"} detail={data.online ? "Connected" : "Disconnected"} healthy={data.online} />
        <Status icon={Layers3} label={data.shardLabel} detail="Gateway allocation" />
        <Status icon={Radio} label={data.gatewayLatencyMs === null ? "Gateway unavailable" : `Gateway ${data.gatewayLatencyMs} ms`} detail="Current latency" />
        <Status icon={Clock3} label={data.uptime ?? "Uptime unavailable"} detail="Current process" />
      </section>

      <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,0.8fr)]">
        <section className="rounded-xl border bg-card p-5" aria-labelledby="command-activity-title">
          <div className="flex items-center justify-between">
            <h2 id="command-activity-title" className="font-semibold">Command activity</h2>
            <Badge variant="outline">Last 7 days</Badge>
          </div>
          <div className="mt-6 h-64 w-full" aria-label="Seven-day command activity chart">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="size-full overflow-visible" role="img">
              {[20, 40, 60, 80].map((line) => <line key={line} x1="0" x2="100" y1={line} y2={line} className="stroke-border" strokeWidth="0.4" />)}
              <polyline points={points} fill="none" className="stroke-primary" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
              {points.split(" ").map((point) => {
                const [cx, cy] = point.split(",");
                return <circle key={point} cx={cx} cy={cy} r="1.25" className="fill-primary" />;
              })}
            </svg>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5" aria-labelledby="plugin-health-title">
          <div className="flex items-center justify-between">
            <h2 id="plugin-health-title" className="font-semibold">Plugin health</h2>
            <Button variant="link" size="sm">View all</Button>
          </div>
          <div className="mt-5 divide-y rounded-lg border">
            {data.plugins.map((plugin) => (
              <div key={plugin.name} className="flex items-center justify-between gap-4 px-4 py-4">
                <span className="flex items-center gap-3 text-sm font-medium"><ShieldCheck className="text-muted-foreground" />{plugin.name}</span>
                <Badge variant="outline" className={healthClass[plugin.health]}>{plugin.health}</Badge>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-5 overflow-hidden rounded-xl border bg-card" aria-labelledby="recent-activity-title">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 id="recent-activity-title" className="font-semibold">Recent activity</h2>
          <Button variant="link" size="sm">View all activity</Button>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>Event</TableHead><TableHead>Actor</TableHead><TableHead>Plugin</TableHead><TableHead>Time</TableHead></TableRow></TableHeader>
          <TableBody>
            {data.activity.length ? data.activity.map((item) => (
              <TableRow key={`${item.event}-${item.time}`}>
                <TableCell className="font-medium"><Activity className="mr-2 inline text-muted-foreground" />{item.event}</TableCell>
                <TableCell>{item.actor}</TableCell><TableCell>{item.plugin}</TableCell><TableCell className="text-muted-foreground">{item.time}</TableCell>
              </TableRow>
            )) : <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">Activity will appear after Nexus processes its first event.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </section>
    </main>
  );
}

function Status({ icon: Icon, label, detail, healthy = false }: { readonly icon: typeof Bot; readonly label: string; readonly detail: string; readonly healthy?: boolean }) {
  return <div className="flex items-center gap-4 px-3 py-5 md:px-5"><span className={healthy ? "text-emerald-400" : "text-primary"}><Icon /></span><div><p className="text-sm font-semibold">{label}</p><p className="mt-0.5 text-xs text-muted-foreground">{detail}</p></div></div>;
}
