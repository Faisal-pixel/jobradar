import type { McpServer } from "@modelcontextprotocol/server";

// Phase 11 prompt: a reusable morning-ritual starter. Prompts are never
// autonomously suggested by Claude (confirmed live during Phase 11
// investigation — both Claude Code and Claude Desktop only ever surface
// them as something the user explicitly picks), so this exists purely
// to save Faisal re-typing the same request every day, not to change
// Claude's spontaneous behavior.
export function registerDailyJobHuntPrompt(server: McpServer): void {
  server.registerPrompt(
    "daily_job_hunt",
    {
      title: "Daily Job Hunt",
      description: "Morning check-in: latest automation run, fresh top-fit jobs, and anything due today.",
    },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "Give me my daily JobRadar check-in:",
              "1. Call get_automation_status and summarize the latest discovery_cycle and daily_digest runs — when they last ran and whether they succeeded.",
              "2. Call search_jobs with status=\"reviewed\" and fitCategory=\"A\" for fresh top matches. For each, name the company and role and one line on why it fits.",
              "3. Call list_pending_outreach for anything due today or overdue.",
              "4. Call list_applications and flag any that look like they need a follow-up.",
              "",
              "Summarize all of this as a short, prioritized list of what I should actually do today — not a raw dump of each tool's output.",
            ].join("\n"),
          },
        },
      ],
    }),
  );
}
