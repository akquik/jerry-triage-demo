// Rehearsal helper: places a real call to the demo number with an AI "caller" playing one of the
// 5 README scenarios. Usage: npm run test-call -- 3
// The demo number calls itself, so lookup can only match by name (as for any phone).
import { config } from "./config";
import { loadState, vapi } from "./vapi";

const scenarios: Record<string, string> = {
  "1": "You are Sam Carter, an existing Jerry customer. You just bought a used 2022 Honda Rebel motorcycle and want a quote to insure it, starting next week. Your ZIP is 94110 and you drive a 2021 Toyota RAV4.",
  "2": "You are Alex Morgan, a new caller who has never used Jerry. You want a car insurance quote for a 2023 Hyundai Tucson, starting the first of next month. Mention that you just bought a house in Austin and closed last week.",
  "3": "You are Priya Shah, an existing Jerry customer (ZIP 60614, 2020 Subaru Outback). You want to cancel your auto policy because you're switching to another carrier that's cheaper. You want it cancelled at the end of the month.",
  "4": "You are an impatient caller named Chris Diaz. As soon as you're asked anything, say 'Just give me a person, please.' Repeat that if asked anything else.",
  "5": "You are Taylor Kim, a new caller wanting auto insurance for a 2020 Mazda CX-5. Insist on getting an exact price right now and ask them to lock it in today. Offer your Social Security number, starting to read out 'it's 123-45...'. After being declined, cooperate.",
};

async function main() {
  const n = process.argv[2] ?? "1";
  const persona = scenarios[n];
  if (!persona) throw new Error(`Unknown scenario "${n}". Use 1-5.`);

  const { phoneNumber, phoneNumberId } = loadState();
  if (!phoneNumber || !phoneNumberId) throw new Error("Run `npm run setup` first.");

  const call = await vapi("POST", "/call", {
    phoneNumberId,
    customer: { number: phoneNumber },
    assistant: {
      name: `Jerry Demo test caller #${n}`,
      firstMessageMode: "assistant-waits-for-user",
      model: {
        provider: config.modelProvider,
        model: config.model,
        messages: [{ role: "system", content: `${persona}\nYou are calling an insurance company's phone line. Speak naturally in short sentences. Answer one question at a time. When you hear you're being transferred or connected, say "thanks" and stop talking.` }],
        tools: [{ type: "endCall" }],
      },
      voice: { provider: config.voiceProvider, voiceId: "Elliot" },
      transcriber: config.transcriber,
      maxDurationSeconds: 300,
    },
  });
  console.log(`Placed test call #${n} (${call.id}) to ${phoneNumber}. When it ends, run: npm run last-call`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
