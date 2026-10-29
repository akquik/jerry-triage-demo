// Runs inside Vapi as a Code tool (no server of ours involved).
// `args` holds the tool-call arguments and `env` the tool's environment variables.
// CUSTOMERS is injected by src/assistant.ts from data/customers.json at deploy time.

const digits = (s: string) => String(s || "").replace(/\D/g, "").slice(-10);
const words = (s: string) => String(s || "").toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean);

const phone = digits(args.phone);
const nameWords = words(args.name);

// Match on phone first, then on full name (so any phone can play an existing customer).
const customer =
  CUSTOMERS.find((c) => phone && digits(c.phone) === phone) ||
  CUSTOMERS.find((c) => nameWords.length >= 2 && words(c.name).every((w) => nameWords.includes(w)));

if (!customer) {
  return { found: false, note: "No record found. Treat as a new prospect." };
}

return {
  found: true,
  matched_on: phone && digits(customer.phone) === phone ? "phone" : "name",
  customer_id: customer.id,
  name: customer.name,
  zip_on_file: customer.zip,
  policies: customer.policies,
  household: customer.household,
  notes: customer.notes,
  verify_hint: "Lightly confirm identity using the ZIP or a vehicle on file. Do not read the whole record back.",
};
