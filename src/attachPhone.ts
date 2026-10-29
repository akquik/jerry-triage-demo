// Provisions a free Vapi number (or reuses ours) and points it at the triage assistant.
import { config } from "./config";
import { loadState, saveState, ensurePhoneNumber } from "./vapi";

async function main() {
  const state = loadState();
  if (!state.assistantId) throw new Error("No assistant yet. Run `npm run create-assistant` first.");

  const inbound = await ensurePhoneNumber("Jerry Triage Demo - inbound", state.assistantId, config.areaCodes, state.phoneNumberId);
  state.phoneNumberId = inbound.id;
  state.phoneNumber = inbound.number;
  saveState(state);

  console.log("");
  console.log(`  Call the demo:  ${inbound.number}`);
  console.log(`  How to demo:    call, say you're "Sam Carter" (any phone works) and ask about a motorcycle quote; after the transfer, run \`npm run last-call\`.`);
  console.log("");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
