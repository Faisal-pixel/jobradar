import type { DatabaseSync } from "node:sqlite";
import { CANDIDATE_PROFILE_CREATE_TABLE_SQL } from "../schema/candidate-profile.js";
import type { Migration } from "./migrator.js";

// Seeded with the profile CLAUDE.md's "Candidate Profile (Faisal)"
// section already states as true today, so scoring works immediately
// without Faisal configuring anything first. Editable later — this is
// exactly what `update_job_search_preferences` (named in CLAUDE.md's
// MCP surface, Phase 7) will update.
export const migration004CandidateProfile: Migration = {
  id: "004_candidate_profile",
  up(db: DatabaseSync) {
    db.exec(CANDIDATE_PROFILE_CREATE_TABLE_SQL);
    db.prepare(
      `INSERT INTO candidate_profile
         (id, location, location_code, target_titles, stack_interest, company_size_sweet_spot,
          company_size_secondary, company_size_opportunistic, prefer_recent_yc_batch)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, 1)`,
    ).run(
      "Nigeria",
      "NG",
      JSON.stringify([
        "Software Engineer",
        "Full-Stack Engineer",
        "Backend Engineer",
        "Product Engineer",
        "Founding Engineer",
        "Early Engineer",
        "Infrastructure Engineer",
        "Distributed Systems Engineer",
        "AI Engineer",
      ]),
      JSON.stringify([
        "TypeScript",
        "Node.js",
        "React",
        "Next.js",
        "APIs",
        "distributed systems",
        "infra",
        "fintech",
        "identity",
        "security",
        "dev tools",
        "IoT",
      ]),
      JSON.stringify([5, 30]),
      JSON.stringify([31, 50]),
      JSON.stringify([2, 4]),
    );
  },
};
