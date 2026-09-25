import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";

// Drafts only, never sends — same hard rule as every drafting tool in
// this project (CLAUDE.md: "nothing sends automatically"). There's also
// no MCP tool for reading a company's full outreach history today (only
// list_pending_outreach — strictly overdue — and update_outreach for a
// single known row), so this prompt can't check "have I already
// contacted them" itself; it says so explicitly rather than silently
// assuming a clean slate.
export function registerPrepForOutreachPrompt(server: McpServer): void {
  server.registerPrompt(
    "prep_for_outreach",
    {
      title: "Prep For Outreach",
      description: "Gather what's known about a company/person and draft outreach context. Draft only, never sent.",
      argsSchema: z.object({
        company: z.string().describe("Company name or numeric ID."),
        person: z.string().optional().describe("A specific person's name, if this is about reaching out to them specifically."),
      }),
    },
    ({ company, person }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Help me prepare outreach to ${person ? `${person} at ${company}` : company}.`,
              "",
              `If "${company}" isn't a plain number, resolve it to a numeric company ID first (e.g. via search_jobs ` +
                "results, which include company_id) before calling anything that needs one.",
              "",
              "Gather what's actually known:",
              "1. get_company for the company's profile.",
              `2. get_company_people${person ? ` — check whether "${person}" is already there` : ""}, and research_company_people if you need more (or to confirm a founder not already on file).`,
              "3. research_company for tech stack, hiring signal, and any self-declared social links worth referencing.",
              "",
              "There's no tool that shows this company's full outreach history — only overdue follow-ups " +
                "(list_pending_outreach) — so ask me directly whether I've already reached out before drafting, " +
                "rather than assuming this is the first contact.",
              "",
              "Then draft a short, genuine outreach message referencing something specific and real from what the " +
                "tools actually returned — never invent a detail, a shared connection, or a fact no tool confirmed. " +
                "This is a draft only: nothing gets sent automatically. If I decide to send it myself, log it " +
                "afterward with update_outreach (or the CLI's log-outreach command for a brand-new entry).",
            ].join("\n"),
          },
        },
      ],
    }),
  );
}
