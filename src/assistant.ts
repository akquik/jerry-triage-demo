// Builds the Vapi assistant payloads from src/config.ts. No API calls here.
import fs from "node:fs";
import { config, systemPrompt, standInPrompt, summaryPrompt, successRubric, callReasons, queues } from "./config";

// Fields shared by log_triage's parameters and the post-call structured data.
const triageFields = {
  customer_found: { type: "boolean", description: "True if lookup_customer found an existing customer." },
  name: { type: "string", description: "Caller's full name." },
  call_reason: { type: "string", enum: callReasons },
  details: { type: "string", description: "Key details captured, in one or two plain sentences." },
  cross_sell_signals: { type: "array", items: { type: "string" }, description: "e.g. 'rents apartment', 'bought a house', 'motorcycle'. Empty if none." },
  urgency: { type: "string", enum: ["low", "normal", "high"] },
  recommended_queue: { type: "string", enum: queues },
};

// Code tools run inside Vapi. We prepend the mock customer data to the tool's source.
function customersForTool() {
  const customers = JSON.parse(fs.readFileSync("data/customers.json", "utf8"));
  if (config.demoCallerPhone) customers[0].phone = config.demoCallerPhone;
  return customers;
}
const toolSource = (file: string, prelude = "") => prelude + fs.readFileSync(`vapi-tools/${file}`, "utf8");

const lookupCustomerTool = {
  type: "code",
  function: {
    name: "lookup_customer",
    description: "Look up a Jerry customer by caller ID (automatic), a phone number they give, or their full name. Call right after you have the caller's name.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Caller's full name." },
        phone: { type: "string", description: "Only if the caller gives a phone number on their account. Caller ID is used automatically otherwise." },
      },
      required: ["name"],
    },
  },
  code: toolSource("lookup_customer.js", `const CUSTOMERS = ${JSON.stringify(customersForTool())};\n`),
  // Vapi fills in the caller's number on phone calls.
  environmentVariables: [{ name: "CALLER_PHONE", value: "{{customer.number}}" }],
  messages: [{ type: "request-start", content: "One moment while I pull that up.", blocking: false }],
};

const logTriageTool = {
  type: "code",
  function: {
    name: "log_triage",
    description: "Log the structured triage summary (the context packet for the licensed agent). Call once, right before transferring.",
    parameters: { type: "object", properties: triageFields, required: Object.keys(triageFields) },
  },
  code: toolSource("log_triage.js"),
};

// `destination` is a phone number (+1...) or a SIP URI (sip:...).
export function buildTransferTool(destination: string) {
  const warm = config.transferMode.startsWith("warm");
  const target = destination.startsWith("sip:") ? { type: "sip", sipUri: destination } : { type: "number", number: destination };
  return {
    type: "transferCall",
    function: { name: "transferCall" },
    destinations: [
      {
        ...target,
        description: "Jerry licensed agent (sales, service, claims and retention all route here in the demo).",
        message: config.transferMessageToCaller,
        transferPlan: warm
          ? {
              mode: config.transferMode,
              summaryPlan: {
                enabled: true,
                messages: [
                  {
                    role: "system",
                    content:
                      "Write ONE short spoken handoff for a licensed insurance agent, under 30 words, in this format: " +
                      "'Incoming from <name>, <existing customer|new prospect>, calling about <reason>. Key details: <details>. Possible cross-sell: <signals or none>.' Return only that sentence.",
                  },
                  { role: "user", content: "Transcript:\n\n{{transcript}}" },
                ],
              },
            }
          : { mode: config.transferMode },
      },
    ],
  };
}

export function buildTriageAssistant(transferTo: string) {
  return {
    name: config.assistantName,
    firstMessage: config.firstMessage,
    firstMessageMode: "assistant-speaks-first",
    model: {
      provider: config.modelProvider,
      model: config.model,
      temperature: config.temperature,
      messages: [{ role: "system", content: systemPrompt }],
      tools: [lookupCustomerTool, logTriageTool, buildTransferTool(transferTo)],
    },
    voice: { provider: config.voiceProvider, voiceId: config.voiceId },
    transcriber: config.transcriber,
    maxDurationSeconds: config.maxCallSeconds,
    analysisPlan: {
      summaryPlan: {
        enabled: true,
        messages: [
          { role: "system", content: summaryPrompt },
          { role: "user", content: "Transcript:\n\n{{transcript}}\n\nEnded reason: {{endedReason}}" },
        ],
      },
      structuredDataPlan: {
        enabled: true,
        schema: {
          type: "object",
          properties: { ...triageFields, transferred: { type: "boolean", description: "True if the call was transferred to a licensed agent." } },
          required: [...Object.keys(triageFields), "transferred"],
        },
      },
      successEvaluationPlan: {
        enabled: true,
        rubric: "PassFail",
        messages: [
          { role: "system", content: `You evaluate an AI insurance intake call.\n\n${successRubric}` },
          { role: "user", content: "Transcript:\n\n{{transcript}}\n\nEnded reason: {{endedReason}}" },
        ],
      },
    },
    metadata: { demo: true, client: "Jerry (prospect demo)" },
  };
}

export function buildStandInAssistant() {
  return {
    name: config.standInName,
    // On a warm transfer the stand-in should listen to the handoff first; on a blind one it greets right away.
    firstMessageMode: config.transferMode.startsWith("warm") ? "assistant-waits-for-user" : "assistant-speaks-first-with-model-generated-message",
    model: {
      provider: config.modelProvider,
      model: config.model,
      temperature: config.temperature,
      messages: [{ role: "system", content: standInPrompt }],
      tools: [{ type: "endCall" }],
    },
    voice: { provider: config.voiceProvider, voiceId: config.standInVoiceId },
    transcriber: config.transcriber,
    maxDurationSeconds: 120,
    metadata: { demo: true, role: "licensed agent stand-in" },
  };
}
