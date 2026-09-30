import { index, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const submissions = pgTable("submissions", {
  id: serial().primaryKey(),
  formType: text("form_type").notNull(),
  data: jsonb().$type<Record<string, string>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("submissions_form_type_idx").on(table.formType)]);

export const newsletterSubscriptions = pgTable("newsletter_subscriptions", {
  id: serial().primaryKey(),
  email: text().notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
