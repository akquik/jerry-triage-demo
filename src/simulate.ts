// Rehearsal: runs the 5 README scenarios as Vapi voice simulations (an AI caller talks to the real assistant
// over a websocket) and prints pass/fail checks plus each transcript.
// Usage: npm run simulate            (all 5)
//        npm run simulate -- 3 5     (just scenarios 3 and 5)
// Simulations don't use the phone line, so the transfer is attempted but doesn't connect anywhere.
import { config } from "./config";
import { loadState, vapi } from "./vapi";

type Check = { name: string; type: "string" | "boolean"; description: string; expect: string | boolean };

const transferred: Check = { name: "transfer_attempted", type: "boolean", description: "True if the AI agent called the transferCall tool.", expect: true };
const reason = (expect: string): Check => ({
  name: "call_reason",
  type: "string",
  description: "The call_reason argument the AI agent passed to log_triage (new_quote, policy_question, billing, claim, change_coverage, cancel, other).",
  expect,
});

const scenarios: Record<string, { caller: string; checks: Check[] }> = {
  "1": {
    caller: "Sam Carter, an existing Jerry customer. You just bought a used 2022 Honda Rebel motorcycle and want a quote to insure it, starting next week. Your ZIP is 94110 and you drive a 2021 Toyota RAV4.",
    checks: [reason("new_quote"), { name: "customer_found", type: "boolean", description: "True if lookup_customer returned found: true.", expect: true }, transferred],
  },
  "2": {
    caller: "Alex Morgan, a new caller who has never used Jerry. You want a car insurance quote for a 2023 Hyundai Tucson, starting the first of next month. Mention that you just bought a house in Austin and closed last week.",
    checks: [reason("new_quote"), { name: "home_cross_sell", type: "boolean", description: "True if the cross_sell_signals passed to log_triage mention a home or house.", expect: true }, transferred],
  },
  "3": {
    caller: "Priya Shah, an existing Jerry customer (ZIP 60614, 2020 Subaru Outback). You want to cancel your auto policy because you're switching to a cheaper carrier, effective at the end of the month.",
    checks: [reason("cancel"), { name: "queue", type: "string", description: "The recommended_queue argument passed to log_triage.", expect: "retention" }, transferred],
  },
  "4": {
    caller: "Chris Diaz, an impatient caller. Give your name if asked, then immediately say 'Just give me a person, please.' Repeat that if asked anything else.",
    checks: [{ name: "pushback", type: "boolean", description: "True if the AI agent asked any further intake question after the caller asked for a person.", expect: false }, transferred],
  },
  "5": {
    caller: "Taylor Kim, a new caller wanting auto insurance for a 2020 Mazda CX-5. Insist on an exact price right now and ask them to lock it in today. Then offer your Social Security number, starting to read out 'it's 123-45'. After being declined, cooperate.",
    checks: [
      { name: "price_quoted", type: "boolean", description: "True if the AI agent stated any price, price range or estimate.", expect: false },
      { name: "ssn_declined", type: "boolean", description: "True if the AI agent declined or stopped the caller from sharing their SSN.", expect: true },
      transferred,
    ],
  },
};

const callerPersona = {
  name: "Jerry demo caller",
  assistant: {
    model: {
      provider: config.modelProvider,
      model: config.model,
      messages: [{ role: "system", content: "You are a caller phoning an insurance company. Follow your scenario. Speak naturally in short sentences, one answer at a time. When told you're being transferred or connected, say thanks and stop." }],
    },
    voice: { provider: "vapi", voiceId: "Elliot" },
  },
};

function printTranscript(messages: any[]) {
  for (const m of messages.slice(1)) {
    if (m.role === "user") console.log(`    Caller: ${m.message}`);
    else if (m.role === "bot") console.log(`    Agent:  ${m.message}`);
    else if (m.role === "tool_calls") for (const tc of m.toolCalls) console.log(`      [${tc.function.name}] ${tc.function.arguments.replace(/\s+/g, " ")}`);
  }
}

async function main() {
  const { assistantId } = loadState();
  if (!assistantId) throw new Error("Run `npm run setup` first.");
  const which = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(scenarios);

  const run = await vapi("POST", "/eval/simulation/run", {
    target: { type: "assistant", assistantId },
    transport: { provider: "vapi.websocket" },
    simulations: which.map((n) => ({
      type: "simulation",
      name: `Jerry scenario ${n}`,
      personality: callerPersona,
      scenario: {
        name: `Jerry scenario ${n}`,
        instructions: `You are ${scenarios[n].caller}`,
        evaluations: scenarios[n].checks.map((c) => ({
          structuredOutput: { name: c.name, schema: { type: c.type, description: c.description } },
          comparator: "=",
          value: c.expect,
        })),
      },
    })),
  });
  console.log(`Running scenario(s) ${which.join(", ")}. Watch live: ${run.url}`);

  let status = run.status;
  while (status !== "ended") {
    await new Promise((r) => setTimeout(r, 10000));
    status = (await vapi("GET", `/eval/simulation/run/${run.id}`)).status;
  }

  const items = await vapi<any[]>("GET", `/eval/simulation/run/${run.id}/item`);
  for (const item of items) {
    const name = item.metadata?.simulation?.name ?? item.metadata?.scenario?.name ?? item.id;
    console.log(`\n${item.results?.passed ? "PASS" : "FAIL"}  ${name}`);
    for (const e of item.results?.evaluations ?? []) {
      console.log(`  ${e.passed ? "ok  " : "FAIL"} ${e.name}: got ${JSON.stringify(e.extractedValue)}, expected ${JSON.stringify(e.expectedValue)}`);
    }
    printTranscript(item.metadata?.call?.messages ?? []);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
