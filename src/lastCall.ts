// Prints the latest call to the triage assistant: the "here's what your agent would see" view.
import { loadState, vapi } from "./vapi";

// Pull the arguments of the log_triage tool call out of the call's message history.
function findContextPacket(call: any) {
  const messages = call.artifact?.messages ?? call.messages ?? [];
  for (const m of messages) {
    for (const tc of m.toolCalls ?? []) {
      if (tc.function?.name === "log_triage") {
        const args = tc.function.arguments;
        return typeof args === "string" ? JSON.parse(args) : args;
      }
    }
  }
  return null;
}

const show = (label: string, value: unknown) =>
  console.log(`\n${label}\n${"-".repeat(label.length)}\n${typeof value === "string" ? value : JSON.stringify(value, null, 2)}`);

async function main() {
  const { assistantId } = loadState();
  if (!assistantId) throw new Error("No assistant yet. Run `npm run setup` first.");

  const [call] = await vapi<any[]>("GET", `/call?assistantId=${assistantId}&limit=1`);
  if (!call) return console.log("No calls yet. Call the demo number first.");
  if (call.status !== "ended") return console.log(`Latest call is still ${call.status}. Try again in a few seconds.`);

  const seconds = call.startedAt && call.endedAt ? Math.round((Date.parse(call.endedAt) - Date.parse(call.startedAt)) / 1000) : null;
  const a = call.analysis ?? {};

  console.log(`Call ${call.id}`);
  console.log(`From ${call.customer?.number ?? "unknown"} at ${new Date(call.startedAt ?? call.createdAt).toLocaleString()}`);
  console.log(`Duration: ${seconds === null ? "n/a" : `${Math.floor(seconds / 60)}m ${seconds % 60}s`}   Ended: ${call.endedReason}`);

  show("Summary", a.summary ?? "(not generated yet - re-run in a few seconds)");
  show("Context packet (log_triage)", findContextPacket(call) ?? "(log_triage was not called)");
  show("Structured data (post-call)", a.structuredData ?? "(not generated yet)");
  show("Success evaluation", a.successEvaluation ?? "(not generated yet)");
  console.log("");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
