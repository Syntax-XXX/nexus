import Link from "next/link";
import {
  Activity,
  BadgeCheck,
  Bot,
  ChartNoAxesCombined,
  ChevronDown,
  CircleGauge,
  FileClock,
  Gavel,
  Hand,
  Logs,
  MessageSquareText,
  Plug,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Ticket,
  Users,
  Wrench,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const navigation = [
  { label: "Overview", href: "/dashboard", icon: CircleGauge },
  { label: "Setup", href: "/dashboard/setup", icon: Wrench },
  { label: "Plugins", href: "/dashboard/plugins", icon: Plug },
  { label: "Moderation", href: "/dashboard/moderation", icon: Gavel },
  { label: "AutoMod", href: "/dashboard/automod", icon: Bot },
  { label: "Verification", href: "/dashboard/verification", icon: BadgeCheck },
  { label: "Welcome", href: "/dashboard/welcome", icon: Hand },
  { label: "Logging", href: "/dashboard/logging", icon: Logs },
  { label: "Tickets", href: "/dashboard/tickets", icon: Ticket },
  { label: "Leveling", href: "/dashboard/leveling", icon: ChartNoAxesCombined },
  { label: "Streamer", href: "/dashboard/streamer", icon: Activity },
  { label: "Roles", href: "/dashboard/roles", icon: Users },
  { label: "Embeds", href: "/dashboard/embeds", icon: MessageSquareText },
  { label: "Analytics", href: "/dashboard/analytics", icon: Sparkles },
  { label: "Audit Log", href: "/dashboard/audit", icon: FileClock },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
] as const;

export interface AppShellProps {
  readonly children: React.ReactNode;
  readonly activePath: string;
  readonly guildName: string;
  readonly userName: string;
}

export function AppShell({ children, activePath, guildName, userName }: AppShellProps) {
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="top-16 h-[calc(100svh-4rem)] border-sidebar-border">
        <SidebarHeader className="h-14 justify-center border-b border-sidebar-border px-4 group-data-[collapsible=icon]:px-2">
          <div className="flex items-center gap-3 overflow-hidden">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <Bot aria-hidden="true" />
            </span>
            <span className="truncate font-semibold tracking-[0.18em] group-data-[collapsible=icon]:hidden">NEXUS</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Manage</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navigation.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={activePath === item.href} tooltip={item.label}>
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Nexus status">
                <ShieldCheck />
                <span>Systems operational</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="flex flex-wrap gap-x-3 px-2 pb-1 text-[11px] text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
            <Link href="/de/nutzungsbedingungen">Terms</Link>
            <Link href="/de/datenschutz">Privacy</Link>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-w-0 bg-background">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger />
            <Button variant="outline" className="max-w-64 justify-between">
              <span className="truncate">{guildName}</span>
              <ChevronDown data-icon="inline-end" />
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon-sm" aria-label="View notifications">
              <Star />
            </Button>
            <Avatar className="size-8">
              <AvatarFallback>{userName.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="hidden text-sm font-medium sm:block">{userName}</span>
          </div>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
