// Minimal Vapi REST client plus the local .vapi.json state file (ids of what we created).
import "dotenv/config";
import fs from "node:fs";

const BASE = "https://api.vapi.ai";
const STATE_FILE = ".vapi.json";

export async function vapi<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.VAPI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : (undefined as T);
}

export type State = {
  assistantId?: string;
  standInAssistantId?: string;
  phoneNumberId?: string;
  phoneNumber?: string;
  agentLineId?: string;
  agentLineSipUri?: string;
};

export const loadState = (): State => (fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : {});
export const saveState = (s: State) => fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + "\n");

// Create the assistant, or update it in place if we already have it (by saved id, then by name).
export async function upsertAssistant(payload: { name: string }, savedId?: string): Promise<string> {
  let id = savedId;
  if (!id) {
    const existing = await vapi<any[]>("GET", "/assistant?limit=100");
    id = existing.find((a) => a.name === payload.name)?.id;
  }
  if (id) {
    await vapi("PATCH", `/assistant/${id}`, payload);
    console.log(`Updated assistant "${payload.name}" (${id})`);
    return id;
  }
  const created = await vapi("POST", "/assistant", payload);
  console.log(`Created assistant "${payload.name}" (${created.id})`);
  return created.id;
}

// Find a phone number we created earlier (by saved id, then by name), or provision a free Vapi number.
// Note: free Vapi accounts get a limited number of these (one, at the time of writing).
export async function ensurePhoneNumber(name: string, assistantId: string, areaCodes: string[], savedId?: string) {
  const all = await vapi<any[]>("GET", "/phone-number?limit=100");
  let num = all.find((n) => n.id === savedId) || all.find((n) => n.name === name);

  if (num) {
    num = await vapi("PATCH", `/phone-number/${num.id}`, { assistantId, name });
  } else {
    for (const areaCode of areaCodes) {
      try {
        num = await vapi("POST", "/phone-number", { provider: "vapi", name, assistantId, numberDesiredAreaCode: areaCode.trim() });
        break;
      } catch (err: any) {
        if (String(err.message).includes("maximum")) throw err; // account's free-number limit: no point retrying
        console.log(`  Area code ${areaCode} unavailable, trying the next one...`);
      }
    }
    if (!num) throw new Error("Could not provision a phone number. Try other AREA_CODES in .env.");
  }

  // Free numbers can take a moment to get their actual number assigned.
  for (let i = 0; !num.number && i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    num = await vapi("GET", `/phone-number/${num.id}`);
  }
  return { id: num.id as string, number: num.number as string };
}

// A free Vapi SIP address (not dialable from a phone, but a valid transfer destination).
export async function ensureSipLine(name: string, sipUri: string, assistantId: string, savedId?: string) {
  const all = await vapi<any[]>("GET", "/phone-number?limit=100");
  const existing = all.find((n) => n.id === savedId) || all.find((n) => n.name === name);
  const line = existing
    ? await vapi("PATCH", `/phone-number/${existing.id}`, { assistantId })
    : await vapi("POST", "/phone-number", { provider: "vapi", name, sipUri, assistantId });
  return { id: line.id as string, sipUri: line.sipUri as string };
}
