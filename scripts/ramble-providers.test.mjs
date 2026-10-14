/**
 * Ramble's two AIs: which one a ramble runs on, what each failure says, and
 * how the client copes with what a provider sends back. `fetch` is replaced,
 * so nothing here calls Groq or publik or spends a cent.
 *
 * Wrong here is silent until a user is stuck: a provider that does not take
 * strict JSON schemas would fail every ramble with no way out, a publik 402
 * without its link leaves no way to add credit, and an unchosen provider
 * that defaulted to publik would spend someone's money without asking.
 */

import { AiError, chatJson, checkGroqKey, transcribe } from "@/lib/ai";
import { GROQ, describeFailure, keyHint, looksLikeGroqKey, publikSpec, resolveProvider } from "@/lib/ramble/providers";
import { balanceLine, formatBalance } from "@/lib/publik";
import { readRambleReply } from "@/lib/ramble/request";

const failures = [];
let passed = 0;
function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n  expected ${JSON.stringify(expected)}\n  got      ${JSON.stringify(actual)}`);
}

// ─── Which provider ───
const none = { provider: null, groqKey: null, publikKey: null, publikBaseUrl: null };
check("nothing chosen asks for a choice, never picks one", resolveProvider({ ...none, groqKey: "gsk_x", publikKey: "pk_x" }).ok ? "picked" : resolveProvider(none).code, "choose");
check("Groq chosen with no key asks for the key", resolveProvider({ ...none, provider: "groq" }).code, "groq_key");
check("Groq chosen with a key runs on Groq", resolveProvider({ ...none, provider: "groq", groqKey: "gsk_abc" }).spec?.name, "groq");
check("publik chosen but not set up asks to set it up", resolveProvider({ ...none, provider: "publik", groqKey: "gsk_abc" }).code, "publik_setup");
check("publik set up runs on publik, at its own base URL", resolveProvider({ ...none, provider: "publik", publikKey: "pk_live_x", publikBaseUrl: "https://example.test/v1" }).spec?.baseUrl, "https://example.test/v1");
check("publik without a base URL uses publik's own", publikSpec(null).baseUrl, "https://publikhq.com/api/v1");
check("publik asks for a tier, never a vendor model", publikSpec(null).chatModel.startsWith("publik-"), true);

// Made up, and put together here so the source holds nothing shaped like a key.
const fakeGroqKey = `${"gsk"}_abcdefghijklmnopqrstuvwxyz0123`;
const fakePublikKey = `${"pk"}_live_abcdefghijklmnopqrstuv`;
check("a Groq key looks like Groq's", looksLikeGroqKey(fakeGroqKey), true);
check("a publik key is not a Groq key", looksLikeGroqKey(fakePublikKey), false);
check("a key with a space pasted after it still counts", looksLikeGroqKey(`${fakeGroqKey}  `), true);
check("only the last four are shown", keyHint(fakeGroqKey), "ends 0123");
check("no key, no hint", keyHint(null), null);

// ─── What a failure says ───
const groq = { name: "groq", label: "Groq" };
const publik = { name: "publik", label: "publik" };
check("Groq refusing the key says to check it in Settings", describeFailure(groq, 401, null, null, "read that").message.includes("Settings"), true);
check("and carries the code that puts Settings on the card", [describeFailure(groq, 401, null, null, "read that").code, describeFailure(publik, 403, null, null, "read that").code], ["groq_key", "publik_setup"]);
check("publik refusing the key says to set publik up again", describeFailure(publik, 403, null, null, "read that").message.includes("publik"), true);
check("a publik 402 keeps its message and its one link",
  describeFailure(publik, 402, { error: { message: "Add credit to keep going.", top_up_url: "https://publikhq.com/top-up" } }, null, "read that"),
  { status: 402, message: "Add credit to keep going.", topUpUrl: "https://publikhq.com/top-up" });
check("a rate limit with a short wait says seconds", describeFailure(groq, 429, null, 30, "read that").message.endsWith("Try again in 30 seconds."), true);
check("a rate limit with a long wait says minutes", describeFailure(groq, 429, null, 300, "read that").message.endsWith("Try again in 5 minutes."), true);
check("a rate limit with no wait given", describeFailure(groq, 429, null, null, "read that").message.endsWith("Try again shortly."), true);
check("too long a recording", describeFailure(groq, 413, null, null, "write that down").status, 413);
check("anything else names the step and the provider's own words",
  describeFailure(groq, 500, { error: { message: "upstream broke" } }, null, "read that").message, "Groq could not read that: upstream broke.");

// ─── The client, against a fake provider ───
const calls = [];
let script = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init });
  const next = script.shift();
  if (!next) throw new Error("no scripted response");
  if (next instanceof Error) throw next;
  return new Response(next.body === undefined ? "" : JSON.stringify(next.body), {
    status: next.status ?? 200,
    headers: { "content-type": "application/json", ...(next.headers ?? {}) },
  });
};
const reply = (content) => ({ body: { choices: [{ message: { content } }] } });
const caller = { spec: GROQ, apiKey: "gsk_test" };
const schema = { type: "object", properties: { tasks: { type: "array" } }, required: ["tasks"], additionalProperties: false };
const body = (i) => JSON.parse(calls[i].init.body);

calls.length = 0;
script = [reply('{"tasks":[]}')];
check("a strict schema answer is read", await chatJson(caller, "system", "user", schema), { tasks: [] });
check("the first ask uses the provider's strict schema", body(0).response_format.type, "json_schema");
check("Groq is asked with its own model", body(0).model, "openai/gpt-oss-120b");

calls.length = 0;
script = [{ status: 400, body: { error: { message: "response_format json_schema is not supported for this model" } } }, reply('{"tasks":[1]}')];
check("a provider that refuses strict schemas is asked again in JSON mode", await chatJson(caller, "system", "user", schema), { tasks: [1] });
check("and the second ask is plain JSON mode", body(1).response_format.type, "json_object");
check("with the schema written into the instructions", body(1).messages[0].content.includes('"required":["tasks"]'), true);

calls.length = 0;
script = [reply('```json\n{"tasks":[2]}\n```')];
check("an answer wrapped in a code fence is still read", await chatJson(caller, "system", "user", schema), { tasks: [2] });

calls.length = 0;
script = [reply(""), reply('{"tasks":[3]}')];
check("an empty answer is asked once more", await chatJson(caller, "system", "user", schema), { tasks: [3] });

script = [reply("not json"), reply("still not json")];
let thrown = null;
try { await chatJson(caller, "system", "user", schema); } catch (error) { thrown = error; }
check("two unreadable answers fail with words, not a crash", thrown instanceof AiError && thrown.status === 502, true);

script = [{ status: 402, body: { error: { message: "Out of credit.", top_up_url: "https://publikhq.com/add" } } }];
thrown = null;
try { await chatJson({ spec: publikSpec(null), apiKey: "pk_live_x" }, "s", "u", schema); } catch (error) { thrown = error; }
check("a publik 402 reaches the route with its link", [thrown?.status, thrown?.topUpUrl], [402, "https://publikhq.com/add"]);

script = [{ status: 429, headers: { "retry-after": "12" }, body: {} }];
thrown = null;
try { await chatJson(caller, "s", "u", schema); } catch (error) { thrown = error; }
check("a 429 says when to try again", thrown?.message, "Groq's free limit is used up for now. Try again in 12 seconds.");

script = [new TypeError("fetch failed")];
thrown = null;
try { await chatJson(caller, "s", "u", schema); } catch (error) { thrown = error; }
check("no network is a 504 that names the provider", [thrown?.status, thrown?.message], [504, "Groq could not be reached."]);

calls.length = 0;
script = [{ body: { text: "Buy milk." } }];
const heard = await transcribe(caller, new Blob(["x"], { type: "audio/webm" }), "ramble.webm", "My tasks.");
const sent = calls[0].init.body;
check("speech to text returns what was heard", heard, "Buy milk.");
check("it sends the provider's speech model and the prompt", [sent.get("model"), sent.get("prompt")], ["whisper-large-v3-turbo", "My tasks."]);
check("it goes to the provider's own address", calls[0].url, "https://api.groq.com/openai/v1/audio/transcriptions");

script = [{ status: 401, body: {} }];
thrown = null;
try { await transcribe(caller, new Blob(["x"]), "r.webm", ""); } catch (error) { thrown = error; }
check("a refused key while writing down says so", thrown?.message.startsWith("Groq refused your key"), true);

script = [{ status: 200, body: { data: [] } }];
check("checking a good Groq key", await checkGroqKey(GROQ.baseUrl, "gsk_x"), "ok");
script = [{ status: 401, body: {} }];
check("checking a refused Groq key", await checkGroqKey(GROQ.baseUrl, "gsk_x"), "refused");
script = [new TypeError("fetch failed")];
check("checking with no network", await checkGroqKey(GROQ.baseUrl, "gsk_x"), "unreachable");

// ─── What the card does with the route's answer ───
const answer = (status, body) => readRambleReply(status, status < 400, body);
check("tasks come through with what was said", answer(200, { transcript: "buy milk", tasks: [{ title: "Buy milk" }] }).ok, true);
for (const code of ["choose", "groq_key", "publik_setup"]) {
  check(`nothing set up (${code}) offers Settings`, answer(409, { error: "Add your Groq key in Settings.", code }).action, { kind: "settings" });
}
check("a balance run out offers publik's one link",
  answer(402, { error: "Your publik balance has run out.", code: "publik_balance", topUpUrl: "https://publikhq.com/dashboard/api/add", transcript: "buy milk" }),
  { ok: false, message: "Your publik balance has run out.", transcript: "buy milk", action: { kind: "link", label: "Add credit", href: "https://publikhq.com/dashboard/api/add" } });
check("a link that is not https is never offered", answer(402, { error: "x", topUpUrl: "javascript:alert(1)" }).action, undefined);
check("any other failure says what happened and offers nothing else", answer(502, { error: "Groq could not read that." }), { ok: false, message: "Groq could not read that.", transcript: null, action: undefined });
check("an answer that is not JSON still has words", answer(500, null).message, "Ramble could not read that (500).");
check("a 200 without tasks is not a success", answer(200, { transcript: "x" }).ok, false);

// ─── publik's balance, as Settings shows it ───
check("a balance is never rounded up", formatBalance(47_794), "$0.047");
check("the free $0.05 reads as itself", formatBalance(50_000), "$0.050");
check("under a tenth of a cent is nothing left to spend", formatBalance(900), "$0.000");
check("from a dollar, whole cents, still not rounded up", [formatBalance(1_000_000), formatBalance(12_349_999)], ["$1.00", "$12.34"]);
check("a negative balance is shown as none", formatBalance(-5), "$0.000");
check("an unlinked computer with nothing is told how to get the free use",
  balanceLine(0, "anonymous"), "$0.00 · link this computer for $0.05 of free use");
check("a linked one that has spent it all is not", balanceLine(0, "claimed"), "$0.00 of publik balance");
check("no balance known is no line", balanceLine(null), "");
check("a balance after a ramble", balanceLine(47_794, "claimed"), "$0.047 of publik balance");

if (failures.length > 0) {
  console.error(failures.join("\n"));
  console.error(`ramble-providers: ${failures.length} failed, ${passed} passed`);
  process.exit(1);
}
console.log(`ramble-providers: ${passed} passed`);
