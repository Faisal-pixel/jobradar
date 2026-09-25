import type { McpServer } from "@modelcontextprotocol/server";

// On-demand, conversational counterpart to the scheduled Sunday-evening
// weekly report (Phase 10). Deliberately gathers the same kind of data
// via read-only tools rather than calling run_now — run_now("weekly_report")
// actually sends a real Telegram message as a side effect (Decisions
// Log), and this prompt exists so Faisal can pull up a review any time
// without spamming his own phone with a duplicate report every time he
// does.
export function registerWeeklyJobReviewPrompt(server: McpServer): void {
  server.registerPrompt(
    "weekly_job_review",
    {
      title: "Weekly Job Review",
      description: "On-demand conversational version of the Sunday weekly report — does not trigger a real send.",
    },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "Walk me through how my job search went this week, as a conversation, not a raw report.",
              "",
              "Do NOT call run_now — that actually sends a real Telegram message and would duplicate the " +
                "scheduled Sunday report. Instead, gather this week's picture yourself with read-only tools:",
              "1. search_jobs (status/fitCategory filters as needed) for what was discovered recently, broken down by fit category.",
              "2. list_applications for anything new or updated recently, and their current status.",
              "3. list_pending_outreach for anything still overdue.",
              "4. get_automation_status, just to note whether last Sunday's scheduled report actually ran — not to re-trigger it.",
              "",
              "Then reflect on the week: what moved forward, what stalled, what's overdue — and suggest 2-3 concrete, " +
                "specific priorities for next week. No status-history is tracked for applications/outreach, so " +
                "describe activity as \"this changed recently,\" never as a specific transition you can't actually confirm.",
            ].join("\n"),
          },
        },
      ],
    }),
  );
}
