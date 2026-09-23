import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import type { McpServer } from "@modelcontextprotocol/server";
import { PeopleRepository } from "../../database/repositories/people-repository.js";
import { PERSON_CATEGORIES } from "../../domain/people/person.js";
import { toolResult, toolError, omitUndefined } from "../tool-helpers.js";
import { NotFoundError, ValidationError } from "../../shared/errors.js";

const personFieldsSchema = {
  company_id: z.number().nullable().optional(),
  name: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  category: z.enum(PERSON_CATEGORIES).nullable().optional(),
  linkedin_url: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  source_url: z.string().nullable().optional(),
  confidence: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
};

export function registerPeopleTools(server: McpServer, db: DatabaseSync): void {
  const people = new PeopleRepository(db);

  server.registerTool(
    "get_person",
    {
      title: "Get Person",
      description: "Fetch a single person by ID.",
      inputSchema: z.object({ id: z.number() }),
    },
    async ({ id }) => {
      const person = people.findById(id);
      return person ? toolResult(person) : toolError(`Person ${id} not found.`);
    },
  );

  server.registerTool(
    "save_person",
    {
      title: "Save Person",
      description:
        "Save a new person record. Per CLAUDE.md's hard rule: never fabricate a name, email, or LinkedIn URL — " +
        "leave any unknown field unset rather than guessing.",
      inputSchema: z.object(personFieldsSchema),
    },
    async (input) => toolResult(people.create(omitUndefined(input))),
  );

  server.registerTool(
    "update_person",
    {
      title: "Update Person",
      description: "Update fields on an existing person record.",
      inputSchema: z.object({ id: z.number(), ...personFieldsSchema }),
    },
    async ({ id, ...patch }) => {
      try {
        return toolResult(people.update(id, omitUndefined(patch)));
      } catch (cause) {
        if (cause instanceof NotFoundError || cause instanceof ValidationError) return toolError(cause.message);
        throw cause;
      }
    },
  );

  server.registerTool(
    "find_people",
    {
      title: "Find People",
      description: "Search people by partial (case-insensitive) name match and/or exact category (e.g. all founders).",
      inputSchema: z.object({
        name: z.string().optional(),
        category: z.enum(PERSON_CATEGORIES).optional(),
      }),
    },
    async (filters) => toolResult(people.findByFilters(omitUndefined(filters))),
  );
}
