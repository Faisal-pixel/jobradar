// Every tool handler in src/mcp/tools/ returns one of these — kept as
// tiny shared helpers so every tool formats results/errors the same way,
// rather than each file inventing its own shape.

export function toolResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

export function toolError(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

// Zod's parsed output always includes every optional key, even when not
// provided (as `key: undefined`) — repository/service methods are typed
// as Partial<T> under exactOptionalPropertyTypes, which distinguishes
// "key absent" from "key present with value undefined" and rejects the
// latter. This normalizes a Zod tool-input object into the shape those
// methods actually expect, so every tool handler doesn't have to
// hand-write a conditional spread for the same reason.
type WithoutUndefined<T> = { [K in keyof T]: Exclude<T[K], undefined> };

export function omitUndefined<T extends Record<string, unknown>>(obj: T): WithoutUndefined<T> {
  const result = {} as WithoutUndefined<T>;
  for (const key of Object.keys(obj) as (keyof T)[]) {
    const value = obj[key];
    if (value !== undefined) result[key] = value as WithoutUndefined<T>[typeof key];
  }
  return result;
}
