// Creates or updates the triage assistant (and, if needed, the licensed-agent stand-in line).
// Safe to re-run after any change in src/config.ts.
import { config } from "./config";
import { buildStandInAssistant, buildTriageAssistant } from "./assistant";
import { loadState, saveState, upsertAssistant, ensureSipLine } from "./vapi";

async function main() {
  const state = loadState();

  let transferTo = config.licensedAgentPhone;
  if (!transferTo) {
    // No real agent phone given: transfers go to a free Vapi SIP line answered by the stand-in assistant.
    state.standInAssistantId = await upsertAssistant(buildStandInAssistant(), state.standInAssistantId);
    const sipUri = state.agentLineSipUri ?? `sip:jerry-demo-agent-${state.standInAssistantId.slice(0, 8)}@sip.vapi.ai`;
    const line = await ensureSipLine("Jerry Demo - agent line (SIP)", sipUri, state.standInAssistantId, state.agentLineId);
    state.agentLineId = line.id;
    state.agentLineSipUri = line.sipUri;
    transferTo = line.sipUri;
  }

  state.assistantId = await upsertAssistant(buildTriageAssistant(transferTo), state.assistantId);
  saveState(state);
  console.log(`Transfers go to ${transferTo} (${config.transferMode}). Model: ${config.modelProvider}/${config.model}.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
