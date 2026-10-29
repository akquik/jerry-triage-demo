// Runs inside Vapi as a Code tool (plain JavaScript; no server of ours involved).
// In production this would push the "context packet" to the licensed agent's screen.
// Here it just acknowledges; the arguments are stored on the call, and
// `npm run last-call` prints them as the context packet.

const triageId = "TRG-" + Math.random().toString(36).slice(2, 8).toUpperCase();

return {
  logged: true,
  triage_id: triageId,
  next_step: "Tell the caller what happens next, then transfer to the licensed agent.",
};
