import { Check, PlugZap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils";
import {
  connectorCatalog,
  composioManagedConnectorKeys,
  providerPresets,
  builtInSkillCatalog,
} from "@/constants";
import {
  normalizeAgentConnectors,
} from "@/lib/data-mappers";
import {
  connectorStatusLabel,
  connectorStatusVariant,
  presetDisplayModel,
} from "@/lib/helpers";
import { getTriggerTypeLabel } from "@/lib/automations";
import { ApprovalQueue } from "@/components/chat/ApprovalQueue";
import { DigitalTwinPanel } from "@/components/inspector/DigitalTwinPanel";
import { ReflectionPanel } from "@/components/inspector/ReflectionPanel";
import { TrustPolicyEditor } from "@/components/inspector/TrustPolicyEditor";
import type { AgentConnectorKey } from "@/types";
import type {
  WorkspaceAgent,
  RuntimeHealth,
  Automation,
  AutomationRun,
} from "@/types";

interface AccountsViewProps {
  hasAgentRuntime: boolean;
  hasSupabaseConfig: boolean;
  copilotAuthenticated: boolean;
  githubModelsReady: boolean;
  showAllProviderPresets: boolean;
  setShowAllProviderPresets: (value: boolean) => void;
  runtimeHealth: RuntimeHealth;
  connectorAuthSessions: RuntimeHealth["connectorSessions"];
  connectorTokenDrafts: Record<string, string>;
  setConnectorTokenDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  connectorAuthBusyKey: string | null;
  connectorAuthMessage: string | null;
  automations: Automation[];
  automationRunsById: Record<string, AutomationRun[]>;
  automationError: string | null;
  isLoadingAutomations: boolean;
  isTriggeringAutomationId: string | null;
  allAgents: WorkspaceAgent[];
  selectedAgent: WorkspaceAgent | null;
  updateCustomAgent: (agentId: string, updater: (agent: WorkspaceAgent) => WorkspaceAgent) => void;
  handleStartCopilotAuth: () => Promise<void>;
  handleStartConnectorOAuth: (provider: string) => Promise<void>;
  handleSaveConnectorToken: (provider: string) => Promise<void>;
  handleDisconnectConnector: (provider: string) => Promise<void>;
  handleEnableConnectorForAllAgents: (connectorKey: AgentConnectorKey) => void;
  refreshConnectorAuth: () => Promise<void>;
  refreshRuntimeHealth: () => void;
  refreshAutomations: () => Promise<void>;
  handleTriggerAutomation: (automationId: string) => Promise<void>;
}

export function AccountsView({
  hasAgentRuntime,
  hasSupabaseConfig,
  copilotAuthenticated,
  githubModelsReady,
  runtimeHealth,
  connectorAuthSessions,
  connectorTokenDrafts,
  setConnectorTokenDrafts,
  connectorAuthBusyKey,
  connectorAuthMessage,
  automations,
  automationRunsById,
  automationError,
  isLoadingAutomations,
  isTriggeringAutomationId,
  allAgents,
  selectedAgent,
  updateCustomAgent,
  handleStartCopilotAuth,
  handleStartConnectorOAuth,
  handleSaveConnectorToken,
  handleDisconnectConnector,
  handleEnableConnectorForAllAgents,
  refreshConnectorAuth,
  refreshRuntimeHealth,
  refreshAutomations,
  handleTriggerAutomation,
}: AccountsViewProps) {
  const builtInToolRows = [
    {
      id: "sandbox",
      label: "Sandbox files & shell",
      description:
        "Read/write files, inspect repos, and run commands in the local workspace sandbox.",
      status: hasAgentRuntime ? "available" : ("offline" as const),
    },
    {
      id: "web",
      label: "Web research",
      description:
        "Fetch pages, extract text, make HTTP requests, and launch Browser Use sessions.",
      status: hasAgentRuntime ? "available" : ("offline" as const),
    },
    {
      id: "messaging",
      label: "Messaging & inbox",
      description:
        "Use threads, channels, council sessions, and delegated task rooms inside Control Room.",
      status: "available" as const,
    },
    {
      id: "memory",
      label: "Memory & history",
      description:
        "Store thread summaries, notes, knowledge, and file attachments through the runtime memory layer.",
      status: hasAgentRuntime ? "available" : ("offline" as const),
    },
    {
      id: "scheduled",
      label: "Scheduled triggers",
      description:
        "Create and run automations for chat, command, tool, and delegation flows.",
      status: hasAgentRuntime ? "available" : ("offline" as const),
    },
    {
      id: "delegation",
      label: "Agents & delegation",
      description:
        "Create specialists, open channels, dispatch delegations, and review work across the workspace.",
      status: "available" as const,
    },
    {
      id: "integrations",
      label: "Tools & integrations",
      description:
        "Manage secrets, bindings, HTTP tools, provider accounts, and runtime-backed integrations.",
      status: hasAgentRuntime ? "available" : ("partial" as const),
    },
    {
      id: "services",
      label: "Services",
      description:
        "Run and inspect local runtime-backed services, workspace devices, browser sessions, and command runs.",
      status: hasAgentRuntime ? "available" : ("offline" as const),
    },
    {
      id: "interaction",
      label: "User interaction",
      description:
        "Ask follow-ups in-thread, keep work in Galaxy when simple, or escalate to collaboration when needed.",
      status: "available" as const,
    },
  ];

  const builtInSkillRows = builtInSkillCatalog.map((skill) => ({
    ...skill,
    status: hasAgentRuntime ? "available" : ("partial" as const),
  }));

  const selectedAgentSkillRows = (() => {
    if (!selectedAgent) {
      return [];
    }

    const normalizedSkills = selectedAgent.skills.map((skill) =>
      skill.toLowerCase(),
    );

    return builtInSkillRows.map((skill) => {
      const matchedByName = normalizedSkills.some((entry) =>
        skill.keywords.some((keyword) => entry.includes(keyword)),
      );
      const hasRequiredPermissions = skill.requiredPermissions.every(
        (permission) => selectedAgent.permissions[permission],
      );

      return {
        ...skill,
        matchedByName,
        hasRequiredPermissions,
        state: matchedByName
          ? "enabled"
          : hasRequiredPermissions
            ? "ready"
            : "blocked",
      };
    });
  })();

  return (
    <div className="space-y-4 mt-2">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 p-4">
          <DigitalTwinPanel />
        </div>
        <ApprovalQueue className="self-start" />
      </div>

      <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e252e]">
          <p className="text-sm font-semibold text-[#e2e8f0]">
            Control Room Built-in
          </p>
          <p className="text-[12px] text-[#8b949e]">
            Nebula-style built-in capabilities, backed by the runtime
            and workspace features already wired here.
          </p>
        </div>
        <div className="divide-y divide-[#1e252e]">
          {builtInToolRows.map((tool) => (
            <div
              key={tool.id}
              className="px-4 py-3 flex items-start justify-between gap-4"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div
                  className={cn(
                    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                    tool.status === "available"
                      ? "border-[#10b981]/25 bg-[#10b981]/10 text-[#34d399]"
                      : tool.status === "partial"
                        ? "border-[#f59e0b]/25 bg-[#f59e0b]/10 text-[#fbbf24]"
                        : "border-white/10 bg-white/[0.03] text-[#6e7681]",
                  )}
                >
                  <Check className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-[#e2e8f0]">
                    {tool.label}
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-[#8b949e]">
                    {tool.description}
                  </p>
                </div>
              </div>
              <Badge
                variant={
                  tool.status === "available"
                    ? "emerald"
                    : tool.status === "partial"
                      ? "amber"
                      : "muted"
                }
              >
                {tool.status === "available"
                  ? "Available"
                  : tool.status === "partial"
                    ? "Partial"
                    : "Offline"}
              </Badge>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-[#1e252e] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[#e2e8f0]">
              Connector Hub
            </p>
            <p className="text-[12px] text-[#8b949e]">
              Bind services per agent from the agent editor. Runtime
              status is shown here so you know what is ready.
            </p>
          </div>
          <PlugZap className="h-4 w-4 text-[#f59e0b]" />
        </div>
        <div className="grid grid-cols-1 divide-y divide-[#1e252e] md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-3">
          {connectorCatalog.map((connector) => {
            const Icon = connector.icon;
            const authProvider = connector.key;
            const supportsOAuth = composioManagedConnectorKeys.has(
              connector.key,
            );
            const supportsToken = [
              "composio",
              "slack",
              "notion",
              "vercel",
              "supabase",
              "webhook",
            ].includes(authProvider);
            const authSession =
              connectorAuthSessions?.[authProvider] ??
              runtimeHealth.connectorSessions?.[authProvider] ??
              null;
            const status = connectorStatusLabel(connector.key, {
              hasAgentRuntime,
              hasSupabaseConfig,
              runtimeHealth,
              copilotAuthenticated,
            });
            const enabledCount = allAgents.filter(
              (agent) =>
                normalizeAgentConnectors(agent.permissions.connectors)[
                  connector.key
                ],
            ).length;
            return (
              <div
                key={`connector-hub-${connector.key}`}
                className="p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#f59e0b]/20 bg-[#f59e0b]/10 text-[#fbbf24]">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-[#e2e8f0]">
                        {connector.label}
                      </p>
                      <p className="mt-1 text-[12px] leading-relaxed text-[#8b949e]">
                        {connector.description}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={
                      connectorStatusVariant(status) as
                        | "emerald"
                        | "amber"
                        | "muted"
                    }
                  >
                    {status}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="muted">
                    {enabledCount} agent
                    {enabledCount === 1 ? "" : "s"}
                  </Badge>
                  {connector.automationKey ? (
                    <Badge variant="cyan">
                      {connector.automationKey}
                    </Badge>
                  ) : null}
                  {authSession?.connected ? (
                    <Badge variant="emerald">
                      {authSession.authType}
                    </Badge>
                  ) : null}
                </div>
                {status === "Connected" &&
                connector.key !== "localBridge" &&
                connector.key !== "browser" &&
                enabledCount < allAgents.length ? (
                  <div className="mt-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 border-[#e0d2c0] bg-[#fffaf2] px-2.5 text-[11px] text-[#8f4b2d] hover:bg-[#f7efe3]"
                      onClick={() =>
                        handleEnableConnectorForAllAgents(
                          connector.key,
                        )
                      }
                    >
                      Enable for all agents
                    </Button>
                  </div>
                ) : null}
                {authSession?.connected ? (
                  <p className="mt-2 truncate text-[11px] text-[#7d6b5a]">
                    {authSession.accountLabel ||
                      authSession.keyPreview ||
                      "Connected locally"}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {connector.key === "github" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 border-[#e0d2c0] bg-[#fffaf2] px-2.5 text-[11px] text-[#8f4b2d] hover:bg-[#f7efe3]"
                      onClick={() => void handleStartCopilotAuth()}
                    >
                      {copilotAuthenticated
                        ? "Reconnect GitHub"
                        : "Connect GitHub"}
                    </Button>
                  ) : null}
                  {supportsOAuth ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 border-[#e0d2c0] bg-[#fffaf2] px-2.5 text-[11px] text-[#8f4b2d] hover:bg-[#f7efe3]"
                      disabled={
                        connectorAuthBusyKey ===
                        `${authProvider}:oauth`
                      }
                      onClick={() =>
                        void handleStartConnectorOAuth(authProvider)
                      }
                    >
                      {connectorAuthBusyKey ===
                      `${authProvider}:oauth`
                        ? "Opening..."
                        : authSession?.connected
                          ? "Reconnect Composio"
                          : "Connect Composio"}
                    </Button>
                  ) : null}
                  {authSession?.connected &&
                  authProvider !== "github" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 border-[#e0d2c0] bg-[#fffaf2] px-2.5 text-[11px] text-[#7d6b5a] hover:bg-[#f7efe3]"
                      disabled={
                        connectorAuthBusyKey ===
                        `${authProvider}:disconnect`
                      }
                      onClick={() =>
                        void handleDisconnectConnector(authProvider)
                      }
                    >
                      Disconnect
                    </Button>
                  ) : null}
                </div>
                {supportsToken ? (
                  <div className="mt-3 flex gap-2">
                    <Input
                      type="password"
                      value={connectorTokenDrafts[authProvider] ?? ""}
                      onChange={(event) =>
                        setConnectorTokenDrafts((current) => ({
                          ...current,
                          [authProvider]: event.target.value,
                        }))
                      }
                      placeholder={`${connector.label} token`}
                      className="h-8 rounded-md border-[#d7c8b7] bg-[#fffaf2] px-2 text-[11px] text-[#2f261f] placeholder-[#9a8978]"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 shrink-0 border-[#e0d2c0] bg-[#fffaf2] px-2.5 text-[11px] text-[#8f4b2d] hover:bg-[#f7efe3]"
                      disabled={
                        connectorAuthBusyKey ===
                        `${authProvider}:token`
                      }
                      onClick={() =>
                        void handleSaveConnectorToken(authProvider)
                      }
                    >
                      Save
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e0d2c0] px-4 py-3">
          <p className="text-[12px] text-[#7d6b5a]">
            {connectorAuthMessage ||
              "OAuth tokens are stored only in your local runtime, not in Vercel."}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 border-[#e0d2c0] bg-[#fffaf2] px-2.5 text-[11px] text-[#8f4b2d] hover:bg-[#f7efe3]"
            onClick={() => {
              void refreshConnectorAuth();
              void refreshRuntimeHealth();
            }}
          >
            Refresh Connectors
          </Button>
        </div>
      </div>

      {selectedAgent ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 p-4">
            <TrustPolicyEditor
              agentId={selectedAgent.id}
              agentName={selectedAgent.name}
            />
          </div>
          <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 p-4">
            <ReflectionPanel
              agentId={selectedAgent.id}
              agentName={selectedAgent.name}
              currentSystemPrompt={selectedAgent.systemPrompt}
              onApplyPatch={(patchedPrompt) => {
                updateCustomAgent(selectedAgent.id, (agent) => ({
                  ...agent,
                  systemPrompt: patchedPrompt,
                }));
              }}
            />
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e252e]">
          <p className="text-sm font-semibold text-[#e2e8f0]">
            Workspace Skill Packs
          </p>
          <p className="text-[12px] text-[#8b949e]">
            Reusable specialist skills for document work, browser QA,
            GitHub workflows, research, and deployment tasks.
          </p>
        </div>
        <div className="divide-y divide-[#1e252e]">
          {builtInSkillRows.map((skill) => {
            const Icon = skill.icon;
            return (
              <div
                key={skill.id}
                className="px-4 py-3 flex items-start justify-between gap-4"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
                      skill.status === "available"
                        ? "border-[#06b6d4]/25 bg-[#06b6d4]/10 text-[#67e8f9]"
                        : "border-[#f59e0b]/25 bg-[#f59e0b]/10 text-[#fbbf24]",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[15px] font-medium text-[#e2e8f0]">
                        {skill.label}
                      </p>
                      {skill.requiredPermissions.map((permission) => (
                        <span
                          key={`${skill.id}-${permission}`}
                          className="inline-flex items-center rounded-full border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[#6e7f93]"
                        >
                          {permission}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-[#8b949e]">
                      {skill.description}
                    </p>
                  </div>
                </div>
                <Badge
                  variant={
                    skill.status === "available" ? "cyan" : "amber"
                  }
                >
                  {skill.status === "available"
                    ? "Ready"
                    : "Runtime Needed"}
                </Badge>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e252e]">
          <p className="text-sm font-semibold text-[#e2e8f0]">
            Agent Skill Surface
          </p>
          <p className="text-[12px] text-[#8b949e]">
            {selectedAgent
              ? `Skill readiness for ${selectedAgent.name}. Add matching skill tags in the agent editor to make these specialties explicit.`
              : "Select an agent to inspect which skill packs it can handle right now."}
          </p>
        </div>
        {selectedAgent ? (
          <div className="divide-y divide-[#1e252e]">
            <div className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg">{selectedAgent.emoji}</span>
                <p className="text-[14px] font-medium text-[#e2e8f0]">
                  {selectedAgent.name}
                </p>
                <Badge variant="muted">
                  {selectedAgent.provider} · {selectedAgent.model}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedAgent.skills.length > 0 ? (
                  selectedAgent.skills.map((skill) => (
                    <span
                      key={`${selectedAgent.id}-${skill}`}
                      className="inline-flex items-center rounded-full border border-[#10b981]/20 bg-[#10b981]/10 px-2.5 py-1 text-[11px] text-[#86efac]"
                    >
                      {skill}
                    </span>
                  ))
                ) : (
                  <span className="text-[12px] text-[#6e7681]">
                    No explicit skill tags yet.
                  </span>
                )}
              </div>
            </div>
            {selectedAgentSkillRows.map((skill) => {
              const Icon = skill.icon;
              return (
                <div
                  key={`agent-skill-${skill.id}`}
                  className="px-4 py-3 flex items-start justify-between gap-4"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div
                      className={cn(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
                        skill.state === "enabled"
                          ? "border-[#10b981]/25 bg-[#10b981]/10 text-[#34d399]"
                          : skill.state === "ready"
                            ? "border-[#06b6d4]/25 bg-[#06b6d4]/10 text-[#67e8f9]"
                            : "border-white/10 bg-white/[0.03] text-[#6e7681]",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[14px] font-medium text-[#e2e8f0]">
                          {skill.label}
                        </p>
                        {skill.matchedByName ? (
                          <Badge variant="emerald">Tagged</Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[12px] leading-relaxed text-[#8b949e]">
                        {skill.description}
                      </p>
                      <p className="mt-2 text-[11px] text-[#6e7681]">
                        Needs {skill.requiredPermissions.join(" + ")}{" "}
                        permissions
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={
                      skill.state === "enabled"
                        ? "emerald"
                        : skill.state === "ready"
                          ? "cyan"
                          : "muted"
                    }
                  >
                    {skill.state === "enabled"
                      ? "Enabled"
                      : skill.state === "ready"
                        ? "Ready"
                        : "Blocked"}
                  </Badge>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-6 text-center text-[12px] text-[#6e7681]">
            Pick an agent from the sidebar and this panel will show
            which skill packs it can take on.
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e252e]">
          <p className="text-sm font-semibold text-[#e2e8f0]">
            Provider Accounts
          </p>
          <p className="text-[12px] text-[#8b949e]">
            API keys and OAuth connections available to agents.
          </p>
        </div>
        <div className="divide-y divide-[#1e252e]">
          {providerPresets.map((preset) => {
            const isCopilot = preset.provider === "Copilot";
            const isGitHub = preset.provider === "GitHub";
            const isActive = isCopilot
              ? copilotAuthenticated
              : isGitHub
                ? githubModelsReady
                : false;

            return (
              <div
                key={`${preset.provider}-${preset.model}`}
                className="px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-md flex items-center justify-center text-[11px] font-bold",
                      isActive
                        ? "bg-[#10b981]/15 text-[#34d399]"
                        : "bg-[#1e252e] text-[#6e7681]",
                    )}
                  >
                    {preset.provider.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-[#e2e8f0] truncate">
                      {preset.provider}
                    </p>
                    <p className="text-[11px] text-[#6e7681] truncate">
                      {presetDisplayModel(preset)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={isActive ? "emerald" : "muted"}>
                    {isActive ? "Connected" : "Not Configured"}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e252e]">
          <p className="text-sm font-semibold text-[#e2e8f0]">
            Agent Bindings
          </p>
          <p className="text-[12px] text-[#8b949e]">
            Which provider and model each agent uses.
          </p>
        </div>
        <div className="divide-y divide-[#1e252e]">
          {allAgents.filter((a) => a.source === "custom").length >
          0 ? (
            allAgents
              .filter((a) => a.source === "custom")
              .map((agent) => (
                <div
                  key={agent.id}
                  className="px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-lg">{agent.emoji}</span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-[#e2e8f0] truncate">
                        {agent.name}
                      </p>
                      <p className="text-[11px] text-[#6e7681]">
                        {agent.provider} · {agent.model}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        agent.sandboxMode === "workspace-write"
                          ? "emerald"
                          : "amber"
                      }
                    >
                      {agent.sandboxMode}
                    </Badge>
                  </div>
                </div>
              ))
          ) : (
            <div className="px-4 py-6 text-center text-[12px] text-[#6e7681]">
              No custom agents yet. Create one to configure provider
              bindings.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-[#1e252e] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[#e2e8f0]">
              Event Triggers & Automations
            </p>
            <p className="text-[12px] text-[#8b949e]">
              Phase 2 event entrypoints for scheduled, webhook, repo,
              and manual workspace runs.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="muted">{automations.length} loaded</Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void refreshAutomations()}
              disabled={isLoadingAutomations}
              className="h-8 px-2.5 text-[11px]"
            >
              {isLoadingAutomations ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        </div>
        {automationError ? (
          <div className="border-b border-red-900/30 bg-[#3f191f]/20 px-4 py-2 text-[12px] text-[#fda4af]">
            {automationError}
          </div>
        ) : null}
        <div className="divide-y divide-[#1e252e]">
          {automations.length > 0 ? (
            automations.map((automation) => {
              const latestRun =
                automationRunsById[automation.id]?.[0] ?? null;
              const isTriggering =
                isTriggeringAutomationId === automation.id;

              return (
                <div
                  key={automation.id}
                  className="px-4 py-3 flex items-start justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[14px] font-medium text-[#e2e8f0]">
                        {automation.name}
                      </p>
                      <Badge
                        variant={
                          automation.status === "active"
                            ? "emerald"
                            : automation.status === "error"
                              ? "danger"
                              : automation.status === "paused"
                                ? "amber"
                                : "muted"
                        }
                      >
                        {automation.status}
                      </Badge>
                      <Badge variant="cyan">
                        {getTriggerTypeLabel(automation.trigger.type)}
                      </Badge>
                      <Badge variant="muted">
                        {automation.action.type.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[12px] text-[#8b949e]">
                      Agent: {automation.agentName} · Runs:{" "}
                      {automation.runCount} · Errors:{" "}
                      {automation.errorCount}
                    </p>
                    <p className="mt-2 text-[12px] leading-relaxed text-[#6e7681]">
                      Last status:{" "}
                      {automation.lastRunStatus || "Never run"}
                      {automation.lastRunAt
                        ? ` · ${formatRelativeTime(automation.lastRunAt)}`
                        : ""}
                    </p>
                    {latestRun ? (
                      <p className="mt-1 text-[11px] leading-relaxed text-[#6e7f93]">
                        Latest recorded run: {latestRun.status}
                        {latestRun.completedAt
                          ? ` · completed ${formatRelativeTime(latestRun.completedAt)}`
                          : ` · triggered ${formatRelativeTime(latestRun.triggeredAt)}`}
                        {latestRun.error
                          ? ` · ${latestRun.error}`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void handleTriggerAutomation(automation.id)
                      }
                      disabled={
                        isTriggering ||
                        automation.status === "disabled"
                      }
                      className="h-8 rounded-xl border border-white/8 px-3 text-[11px] text-[#c3d0dc] hover:bg-white/[0.05]"
                    >
                      {isTriggering ? "Triggering..." : "Run Now"}
                    </Button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-4 py-6 text-center text-[12px] text-[#6e7681]">
              {hasAgentRuntime
                ? "No automations yet. Phase 2 trigger plumbing is ready for schedules and event hooks."
                : "Runtime is offline, so automations are unavailable right now."}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1e252e]">
          <p className="text-sm font-semibold text-[#e2e8f0]">
            Health Checks
          </p>
          <p className="text-[12px] text-[#8b949e]">
            Live provider connectivity status.
          </p>
        </div>
        <div className="divide-y divide-[#1e252e]">
          {runtimeHealth?.providers &&
            Object.entries(runtimeHealth.providers).map(
              ([provider, available]) => (
                <div
                  key={provider}
                  className="px-4 py-3 flex items-center justify-between gap-3"
                >
                  <span className="text-[13px] text-[#c9d1d9] capitalize">
                    {provider.replace(/([A-Z])/g, " $1")}
                  </span>
                  <Badge variant={available ? "emerald" : "muted"}>
                    {available ? "Available" : "Unavailable"}
                  </Badge>
                </div>
              ),
            )}
        </div>
      </div>
    </div>
  );
}
