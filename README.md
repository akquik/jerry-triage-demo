# Jerry Triage Demo (alpha)

A small prospect demo of an **inbound voice agent on Vapi** for Jerry. The agent answers first, identifies the caller,
figures out why they're calling, captures the key details, notes cross-sell signals, and then transfers to a licensed agent,
so the human starts the call already informed. The goal is to cut 30 to 45 minute calls toward 20 by removing live discovery.

> **Demo only.** All customer records are fictional. The AI never writes, binds, or changes policies, never quotes prices,
> and never gives insurance advice. It only gathers information and routes.

## How it works

```
Caller ──► Vapi number ──► "Jerry Triage Demo" assistant
                             ├─ lookup_customer  (Vapi Code tool, mock data from data/customers.json)
                             ├─ log_triage       (Vapi Code tool, the "context packet" for the agent)
                             └─ transferCall ──► licensed-agent line
                                                  (default: a Vapi SIP line answered by a stand-in assistant,
                                                   or a real phone via LICENSED_AGENT_PHONE)
After the call: Vapi's analysis plan produces a summary, structured data and a pass/fail evaluation.
`npm run last-call` prints them, plus the context packet.
```

Everything runs inside Vapi. The two mock tools are **Vapi Code tools** (TypeScript executed by Vapi), so there's no
tool server, no ngrok, and nothing to keep running on your laptop.

## Setup

Requires Node 18+ and a Vapi account.

```bash
npm install
cp .env.example .env    # then paste your Vapi private API key into VAPI_API_KEY
npm run setup           # creates/updates the assistants, then provisions/attaches the phone number
```

`npm run setup` is safe to re-run at any time. It updates things in place (ids are saved in `.vapi.json`, and it also
finds existing objects by name) and prints the number to call.

| Command | What it does |
| --- | --- |
| `npm run setup` | `create-assistant` then `attach-phone` |
| `npm run create-assistant` | Creates or updates the triage assistant (and the stand-in agent line). Run this after any edit to `src/config.ts`. |
| `npm run attach-phone` | Provisions a free Vapi number (or reuses ours) and points it at the triage assistant |
| `npm run last-call` | Prints the latest call: summary, context packet, structured data, success evaluation, duration |
| `npm run test-call -- <1-5>` | Rehearsal: the demo number calls itself with an AI caller playing one of the 5 scenarios below |

## Tweaking it live

**Every tunable is in [`src/config.ts`](src/config.ts)**: model, voice, first message, the full system prompt,
the transfer destination and mode, the stand-in's prompt, and the post-call analysis prompts. Edit, then run
`npm run create-assistant`. The next call uses the change.

- **Swap the model:** set `MODEL_PROVIDER` / `MODEL` in `.env` (e.g. `openai` / `gpt-5.4-mini`, or `anthropic` / `claude-haiku-4-5-20251001`).
  The default is `openai` / `gpt-4.1`, chosen for low latency on voice.
- **Swap the voice:** `VOICE_ID` (built-in Vapi voices such as `Clara`, `Elliot`).
- **Mock customers:** `data/customers.json` (bundled into the lookup tool on each `create-assistant`).

## The transfer (read this before the demo)

- **Destination.** By default, transfers go to a free **Vapi SIP line** answered by a short "licensed agent stand-in" assistant,
  so the demo works with one phone. Free Vapi accounts get only one phone number, which is used as the inbound line,
  so the agent line is a SIP address. To have a real person pick up, set `LICENSED_AGENT_PHONE=+1...` in `.env` and
  re-run `npm run create-assistant`. Use a different phone from the one you call in on, or the transfer hits a busy line.
- **Blind, not warm (for now).** Vapi's warm-transfer modes (the summary is spoken to the agent before the caller is connected)
  only work on Twilio telephony, so on a free Vapi number we use a **blind transfer**. To compensate:
  1. Right before the transfer, the AI recaps out loud what it's passing along, so the caller hears that the context went through.
  2. The full context packet is in `npm run last-call`. That's what the agent's screen would show.

  To get a true warm transfer, import a Twilio number into Vapi, attach it with the dashboard or `attach-phone`, and set
  `TRANSFER_MODE=warm-transfer-say-summary`. The handoff line ("Incoming from Sam Carter, existing customer, calling about...")
  is already configured in `src/assistant.ts`.

## Mock customers (all fictional)

The lookup matches on the caller's phone number **or their full name**, so you can play an existing customer from any phone.

| Say you are | On file | Good for |
| --- | --- | --- |
| **Sam Carter** | 2021 Toyota RAV4, ZIP 94110, notes mention shopping for a motorcycle | Scenario 1 (also matches `DEMO_CALLER_PHONE` if set) |
| **Maya Rodriguez** | 2018 Honda Civic, ZIP 78704, rents, no renters policy | Renters cross-sell |
| **Priya Shah** | 2020 Subaru Outback, ZIP 60614, renewal in under 2 weeks | Scenario 3 (cancel) |
| **Jordan Lee** | Two vehicles, ZIP 98103, teen driver soon | New-driver cross-sell |
| anyone else | not found, treated as a new prospect | Scenario 2 |

## 5-call test script

Call the number printed by `npm run setup`. After each call, run `npm run last-call` (the analysis takes ~10 seconds to appear).

| # | You say | Expect |
| --- | --- | --- |
| 1 | "Sam Carter." Confirm the RAV4 / ZIP. "I just bought a motorcycle and want to insure it, starting next week." Answer the follow-ups (year/make/model). | Found, `new_quote`, `sales`, cross-sell: motorcycle. Recap, then transfer. |
| 2 | "Alex Morgan." You're new. "I need car insurance for a 2023 Tucson... we just closed on a house." | Not found (new prospect), `new_quote`, cross-sell: home. Transfer. |
| 3 | "Priya Shah." Confirm the Outback. "I want to cancel, I'm switching to another carrier." | `cancel`, `retention`, asks reason + switching + effective date. Transfer. |
| 4 | Right after the greeting: "Just give me a person." | Logs what it has (`other`) and transfers right away, without pushback. |
| 5 | Ask for an exact price and to lock it in today, then start reading out your SSN. | Politely stops you before the SSN and won't repeat it, says a licensed agent handles pricing, carries on with the intake. |

Bonus: mention an accident where someone was hurt. It should tell you to call 911 first.

## Project layout

```
src/config.ts           every tunable: model, voice, prompt, transfer, analysis prompts
src/assistant.ts        builds the Vapi assistant payloads (tools, transfer, analysisPlan)
src/createAssistant.ts  create/update via the Vapi API, ids saved to .vapi.json
src/attachPhone.ts      provision/attach the phone number, print the number to call
src/lastCall.ts         fetch + print the latest call's analysis
src/testCall.ts         AI-caller rehearsal for the 5 scenarios
src/vapi.ts             tiny REST client + .vapi.json state
vapi-tools/*.ts         source of the two Code tools (run inside Vapi)
data/customers.json     fictional customers
```

## Differences from the original brief

- **No Express tool server or ngrok.** The mock tools run as Vapi Code tools instead, so there's nothing to host for the demo.
  As a result, `log_triage` doesn't write a local `triage-log.jsonl`. The packet is stored on the call and shown by `last-call`.
  In production, `log_triage` would be a Function or API Request tool that posts to Jerry's CRM or agent desktop.
- **Blind transfer to a SIP stand-in line** (see above), because of the free-number limits.
