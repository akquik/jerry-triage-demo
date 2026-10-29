// Runs inside Vapi as a Code tool (plain JavaScript: type annotations make it fail).
// `args` holds the tool-call arguments and `env` the tool's environment variables.
// CUSTOMERS is injected by src/assistant.ts from data/customers.json at deploy time.

const digits = (s) => String(s || "").replace(/\D/g, "").slice(-10);
const words = (s) => String(s || "").toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean);

// A number the caller gave wins; otherwise use caller ID (left as "{{...}}" when there's no phone, e.g. web tests).
const callerId = String(env.CALLER_PHONE || "").includes("{{") ? "" : env.CALLER_PHONE;
const phone = digits(args.phone || callerId);
const nameWords = words(args.name);

// Match on phone first, then on full name (so any phone can play an existing customer).
const byPhone = phone && CUSTOMERS.find((c) => digits(c.phone) === phone);
const customer = byPhone || CUSTOMERS.find((c) => nameWords.length >= 2 && words(c.name).every((w) => nameWords.includes(w)));

if (!customer) {
  return { found: false, note: "No record found. Treat as a new prospect." };
}

return {
  found: true,
  matched_on: byPhone ? "phone" : "name",
  customer_id: customer.id,
  name: customer.name,
  zip_on_file: customer.zip,
  policies: customer.policies,
  household: customer.household,
  notes: customer.notes,
  verify_hint: "Lightly confirm identity using the ZIP or a vehicle on file. Do not read the whole record back.",
};
