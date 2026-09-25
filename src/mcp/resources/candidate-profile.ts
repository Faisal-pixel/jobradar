import type { DatabaseSync } from "node:sqlite";
import type { McpServer } from "@modelcontextprotocol/server";
import { CandidateProfileRepository } from "../../database/repositories/candidate-profile-repository.js";

// Phase 11's one real resource (Decisions Log): unlike the other
// get_* tools, the candidate profile is singular and changes rarely —
// the natural usage pattern is "attach it once at the start of a
// session as background context," which a resource fits and a repeated
// tool call doesn't. get_candidate_profile / get_job_search_preferences
// stay exactly as they are (both explicitly kept, Decisions Log) — this
// is an addition, not a replacement.
export function registerCandidateProfileResource(server: McpServer, db: DatabaseSync): void {
  const candidateProfile = new CandidateProfileRepository(db);

  server.registerResource(
    "candidate_profile",
    "candidate://profile",
    {
      title: "Candidate Profile",
      description:
        "Faisal's job search profile — location, target titles, stack interest, and company-size preferences. " +
        "Same underlying data as the get_candidate_profile / get_job_search_preferences tools.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(candidateProfile.get(), null, 2),
        },
      ],
    }),
  );
}
