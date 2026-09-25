import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";

// Named company_deep_dive, not research_company, specifically to avoid
// colliding with the existing research_company *tool* (Decisions Log) —
// different MCP namespaces so there's no technical conflict, but the
// same name in both lists would be confusing for a human reading them.
export function registerCompanyDeepDivePrompt(server: McpServer): void {
  server.registerPrompt(
    "company_deep_dive",
    {
      title: "Company Deep Dive",
      description: "Full research brief on one company: profile, people, tech/hiring signal, and its open jobs.",
      argsSchema: z.object({
        company: z.string().describe("Company name or numeric ID. If a name, resolve it to an ID first."),
      }),
    },
    ({ company }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Give me a full research brief on "${company}".`,
              "",
              `If "${company}" isn't a plain number, it's a name, not an ID — first find its numeric company ID ` +
                "(e.g. via search_jobs or list_applications results, which include company_id) before calling " +
                "anything that requires one. There's no direct company-name-search tool, so this resolution step " +
                "is necessary.",
              "",
              "Once you have the ID, call:",
              "1. get_company — core profile (stage signals, description, location).",
              "2. get_company_people — founders/contacts already known to JobRadar.",
              "3. research_company — self-declared tech stack, hiring blurb, and Y Combinator/GitHub signal (tagged by source — funding is not researched, see CLAUDE.md).",
              "4. research_company_people — cross-referenced founder data from Y Combinator's own page, flagging anyone not already in get_company_people's results.",
              "5. get_company_jobs — every job discovered at this company.",
              "",
              "Synthesize all of it into one readable brief, not five separate dumps — and keep every fact attributed " +
                "to where it came from (never state something as certain that a tool returned as null/unavailable).",
            ].join("\n"),
          },
        },
      ],
    }),
  );
}
