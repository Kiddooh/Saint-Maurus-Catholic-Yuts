import type { Config } from "@netlify/functions";
import { db } from "../../db/index.js";
import { newsletterSubscriptions, submissions } from "../../db/schema.js";

const fieldsByType: Record<string, { required: string[]; optional: string[] }> = {
  ministry: { required: ["name", "phone", "ministry"], optional: ["grade", "message"] },
  volunteer: { required: ["name", "phone"], optional: ["availability", "area", "message"] },
  visitor: { required: ["name", "age", "phone"], optional: ["heardFrom", "notes"] },
  event: { required: ["eventName", "name", "phone"], optional: ["attendees", "grade", "notes"] },
};

function json(message: string, status: number) {
  return Response.json({ message }, { status });
}

export default async (request: Request) => {
  if (request.method !== "POST") return json("Method not allowed", 405);

  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.website) return json("Submission accepted", 201);

    const type = typeof body.type === "string" ? body.type : "";
    if (type === "newsletter") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return json("Enter a valid email address", 400);
      }
      await db.insert(newsletterSubscriptions).values({ email }).onConflictDoNothing();
      return json("Subscription saved", 201);
    }

    const definition = fieldsByType[type];
    if (!definition) return json("Unknown form type", 400);

    const data: Record<string, string> = {};
    for (const field of [...definition.required, ...definition.optional]) {
      const value = typeof body[field] === "string" ? body[field].trim() : "";
      if (value.length > 2000) return json("One or more fields are too long", 400);
      if (definition.required.includes(field) && !value) return json("Complete all required fields", 400);
      if (value) data[field] = value;
    }

    await db.insert(submissions).values({ formType: type, data });
    return json("Submission saved", 201);
  } catch (error) {
    console.error("Unable to save form submission", error instanceof Error ? error.message : "Unknown error");
    return json("Unable to save your submission right now. Please try again.", 500);
  }
};

export const config: Config = { path: "/api/submit" };
