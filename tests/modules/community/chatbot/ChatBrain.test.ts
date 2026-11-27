import { describe, expect, it, vi } from "vitest";
import { buildFaqPanel } from "../../../../src/modules/community/faq/faqPanel";
import { ChatBrain, type ChatInput, type ChatSkills } from "../../../../src/modules/community/chatbot/ChatBrain";
import { ChatKnowledge, commandEntries, faqEntries, taughtEntry } from "../../../../src/modules/community/chatbot/chatbotKnowledge";

const NOW = Date.UTC(2026, 10, 27, 18, 0, 0);
const USER = "300000000000000003";
const OTHER = "400000000000000004";

function knowledge(): ChatKnowledge {
  return new ChatKnowledge([
    ...faqEntries(buildFaqPanel()),
    ...commandEntries([{ name: "music", description: "Play music in the music channel." }, { name: "server start", access: "Owner", description: "Start the game server." }]),
    taughtEntry({ id: "7", question: "When is movie night?", answer: "Movie night is every Friday at 8 PM ET, {name}." }),
  ]);
}

function input(text: string, overrides: Partial<ChatInput> = {}): ChatInput {
  return { text, seed: text, userId: USER, displayName: "Kenny", serverName: "Crimson Skies", isStaff: true, ...overrides };
}

function brain(skills: Partial<ChatSkills> = {}): ChatBrain {
  const base = knowledge();
  return new ChatBrain(() => base, { botInfo: () => ({ version: "2.0.3", uptimeMs: 26 * 3_600_000 + 5 * 60_000, pingMs: 42 }), ...skills }, () => NOW);
}

describe("ChatBrain", () => {
  it("answers FAQ questions in the member's own words", async () => {
    const reply = await brain().reply(input("is this server pvp?"));
    expect(reply.content).toMatch(/^\*\*Is crimson skies PvP or PvE\?\*\*\n/);
    expect(reply.content).toContain("PvE-focused");
  });

  it("prefers a taught answer and fills in the asker's name", async () => {
    const reply = await brain().reply(input("when's movie night?"));
    expect(reply.content).toBe("Movie night is every Friday at 8 PM ET, Kenny.");
    expect(reply.usedEntryId).toBe("taught:7");
  });

  it("explains commands", async () => {
    expect((await brain().reply(input("how do I play music"))).content).toBe("Use `/music`: play music in the music channel.");
  });

  it("admits when it doesn't know, offers close matches and tells staff how to teach it", async () => {
    const staff = await brain().reply(input("purple elephants dancing"));
    expect(staff.content).toMatch(/I don't know|outside what I know|couldn't find|stumps me/);
    expect(staff.content).toContain("/chat teach");
    const member = await brain().reply(input("purple elephants dancing", { isStaff: false }));
    expect(member.content).not.toContain("/chat teach");
    expect(member.content).toContain("/help");
  });

  it("continues with the next match when asked for more", async () => {
    const first = await brain().reply(input("voice channels group"));
    expect(first.memory.matches?.length).toBeGreaterThan(1);
    const more = await brain().reply(input("more", { memory: first.memory }));
    expect(more.content).not.toBe(first.content);
    const expired = await brain().reply(input("more", { memory: { ...first.memory, at: NOW - 11 * 60_000 } }));
    expect(expired.content).toContain("That's everything");
  });

  it("looks up levels, including a follow-up about someone else", async () => {
    const level = vi.fn((userId: string) => Promise.resolve(userId === USER ? { level: 4, xp: 4_500, rank: 3, nextLevelXp: 6_250 } : { level: 1, xp: 300, rank: 20, nextLevelXp: 1_000 }));
    const mine = await brain({ level }).reply(input("what's my level"));
    expect(mine.content).toBe("You're level **4** with **4,500 XP**, rank **#3**. 1,750 XP to level 5.");
    const theirs = await brain({ level }).reply(input(`what about <@${OTHER}>?`, { memory: mine.memory }));
    expect(theirs.content).toContain(`<@${OTHER}> is level **1**`);
  });

  it("says when a feature isn't set up or a lookup fails, without leaking errors", async () => {
    expect((await brain().reply(input("what's my level"))).content).toBe("Leveling isn't turned on in this server.");
    const failing = brain({ storm: () => Promise.reject(new Error("ECONNREFUSED 10.0.0.5")) });
    const reply = await failing.reply(input("when is the next storm"));
    expect(reply.content).toBe("I couldn't reach that information right now. Try again in a minute.");
  });

  it("describes the storm window with Discord timestamps", async () => {
    const start = NOW + 3_600_000;
    const reply = await brain({ storm: () => Promise.resolve({ start, end: start + 86_400_000 }) }).reply(input("storm?"));
    expect(reply.content).toContain(`<t:${start / 1_000}:R>`);
    const active = await brain({ storm: () => Promise.resolve({ start: NOW - 1_000, end: NOW + 60_000 }) }).reply(input("storm?"));
    expect(active.content).toContain("raging right now");
  });

  it("does math, dice and time without any outside service", async () => {
    expect((await brain().reply(input("what is 12 * (3 + 4)?"))).content).toBe("`12 * (3 + 4)` = **84**");
    expect((await brain().reply(input("1/0"))).content).toContain("Kwisatz Haderach");
    expect((await brain().reply(input("roll 3d6"))).content).toMatch(/^🎲 3d6: \d, \d, \d = \*\*\d+\*\*$/);
    expect((await brain().reply(input("what time is it"))).content).toBe(`It's <t:${NOW / 1_000}:F> in your time zone.`);
    expect((await brain().reply(input("uptime?"))).content).toBe("I'm running **v2.0.3** and have been up for 1d 2h 5m. Gateway ping is 42 ms.");
  });

  it("keeps the same wording for the same message and escapes names", async () => {
    const one = await brain().reply(input("hello", { seed: "abc", displayName: "*Kenny*" }));
    const two = await brain().reply(input("hello", { seed: "abc", displayName: "*Kenny*" }));
    expect(one.content).toBe(two.content);
    expect(one.content).toContain("\\*Kenny\\*");
  });

  it("finds item IDs from the bundled catalog", async () => {
    const reply = await brain({ items: () => [{ name: "Stillsuit Mask", id: "Stillsuit_Mask_T1", detail: "armor" }] }).reply(input("item id for stillsuit mask"));
    expect(reply.content).toContain("`Stillsuit_Mask_T1`");
  });
});

describe("ChatBrain feelings", () => {
  it("says how it feels and reports how a message made it feel", async () => {
    const happy = await brain().reply(input("how are you?", { mood: 50 }));
    expect(happy.content).toMatch(/great|Happy|good/);
    expect(happy.feeling).toBe("chat");
    const hurt = await brain().reply(input("how do you feel", { mood: -80 }));
    expect(hurt.content).toContain("Right now:");
    expect(hurt.content).toMatch(/rough|hurt/);
    expect((await brain().reply(input("thanks!"))).feeling).toBe("thanks");
  });

  it("is hurt by rudeness but never rude back, and warms up to friends", async () => {
    const insult = await brain().reply(input("you suck", { mood: -50 }));
    expect(insult.feeling).toBe("insult");
    expect(insult.content).not.toMatch(/stupid|idiot|shut up/i);
    expect((await brain().reply(input("good bot", { mood: -50 }))).content).toMatch(/needed that|feel better|turned my day/);
    expect((await brain().reply(input("hey", { rapport: 30 }))).content).toMatch(/good to see you|favorite person|nice to see you again/);
  });

  it("only speaks up unasked when it is confident", async () => {
    const quiet = await brain().autoReply(input("purple elephants dancing?"), 0.5);
    expect(quiet).toBeNull();
    const smallTalk = await brain().autoReply(input("how are you?"), 0.5);
    expect(smallTalk).toBeNull();
    const faq = await brain().autoReply(input("Is crimson skies PvP or PvE?"), 0.5);
    expect(faq?.content).toContain("PvE-focused");
  });
});

describe("ChatBrain web lookups", () => {
  const found = { title: "Paul Atreides", summary: "Paul Atreides is the protagonist of Dune.", url: "https://en.wikipedia.org/wiki/Paul_Atreides", source: "Wikipedia" };

  it("looks a question up online when it doesn't know, with the source", async () => {
    const web = vi.fn(() => Promise.resolve(found));
    const reply = await brain({ web }).reply(input("who is Paul Atreides?"));
    expect(web).toHaveBeenCalledWith("paul atreides", undefined);
    expect(reply.content).toBe("**Paul Atreides** is the protagonist of Dune.\n-# Source: Wikipedia · <https://en.wikipedia.org/wiki/Paul_Atreides>");
  });

  it("prefers its own knowledge and searches on request", async () => {
    const web = vi.fn(() => Promise.resolve(found));
    await brain({ web }).reply(input("is this server pvp?"));
    expect(web).not.toHaveBeenCalled();
    await brain({ web }).reply(input("search for paul atreides"));
    expect(web).toHaveBeenCalledWith("paul atreides", undefined);
    await brain({ web }).reply(input("Who is IShowSpeed from youtube google it"));
    expect(web).toHaveBeenLastCalledWith("ishowspeed", "youtube");
    await brain({ web }).reply(input("google who is KSI the youtuber"));
    expect(web).toHaveBeenLastCalledWith("ksi", "youtuber");
  });

  it("explains when a search finds nothing or is busy, and skips the web for unasked answers unless allowed", async () => {
    expect((await brain({ web: () => Promise.resolve(null) }).reply(input("look up zzqx"))).content).toBe('I looked it up but couldn\'t find anything clearly about "zzqx".');
    expect((await brain({ web: () => Promise.reject(new Error("busy")) }).reply(input("google spice"))).content).toContain("Give me a moment");
    expect((await brain().reply(input("search for spice"))).content).toBe("Web lookups are turned off on this server.");
    const web = vi.fn(() => Promise.resolve(found));
    expect(await brain({ web }).autoReply(input("who is Paul Atreides?"), 0.5)).toBeNull();
    expect((await brain({ web }).autoReply(input("who is Paul Atreides?"), 0.5, true))?.content).toContain("Paul Atreides");
  });
});

describe("ChatKnowledge", () => {
  it("adds and forgets taught answers", () => {
    const base = knowledge();
    base.add(taughtEntry({ id: "8", question: "Who runs the server?", answer: "Kenny does." }));
    expect(base.search("who runs the server")[0]).toMatchObject({ entry: { id: "taught:8" }, score: 1 });
    base.remove("taught:8");
    expect(base.search("who runs the server").some((match) => match.entry.id === "taught:8")).toBe(false);
  });

  it("reads every FAQ section from the FAQ panel", () => {
    const entries = faqEntries(buildFaqPanel());
    expect(entries[0]?.title).toBe("About the server");
    expect(entries.map((entry) => entry.title)).toContain("How do I get started?");
    expect(entries.every((entry) => entry.answer.length > 0)).toBe(true);
  });
});

describe("ChatBrain data sources", () => {
  it("answers weather, Steam, currency and news questions from the data sources", async () => {
    const skills: Partial<ChatSkills> = {
      weather: () => Promise.resolve({ place: "Oslo, Norway", temperatureC: -2, feelsLikeC: -6, humidity: 70, windKmh: 16, conditions: "light snow", highC: 0, lowC: -5 }),
      steam: () => Promise.resolve({ name: "Dune: Awakening", price: "$49.99", url: "https://store.steampowered.com/app/1172710/", players: 12345 }),
      convert: () => Promise.resolve({ amount: 100, from: "USD", to: "EUR", result: 92.345, date: "2026-11-27" }),
      news: () => Promise.resolve([{ title: "Big [story]", url: "https://www.bbc.co.uk/news/1" }]),
    };
    const weather = await brain(skills).reply(input("weather in oslo"));
    expect(weather.content).toContain("It's **-2°C (28°F)** and light snow in **Oslo, Norway**. Feels like -6°C (21°F), high 0°C (32°F), low -5°C (23°F)");
    expect((await brain(skills).reply(input("steam dune awakening"))).content).toBe("**Dune: Awakening** on Steam. It costs **$49.99**. **12,345** people are playing right now.\n-# <https://store.steampowered.com/app/1172710/>");
    expect((await brain(skills).reply(input("100 usd to eur"))).content).toMatch(/^100 USD is about \*\*92\.35 EUR\*\*/);
    expect((await brain(skills).reply(input("news"))).content).toBe("**Top headlines**\n- [Big story](<https://www.bbc.co.uk/news/1>)\n-# Source: BBC News");
  });

  it("defines words, and looks names up online when the dictionary has nothing", async () => {
    const define = vi.fn((word: string) => Promise.resolve(word === "melange" ? { word, partOfSpeech: "noun", definitions: ["A mixture."], url: "https://en.wiktionary.org/wiki/melange" } : null));
    const web = vi.fn(() => Promise.resolve({ title: "Sietch", summary: "A sietch is a Fremen community.", url: "https://dune.fandom.com/wiki/Sietch", source: "Dune Wiki" }));
    expect((await brain({ define, web }).reply(input("define melange"))).content).toBe("**melange** *(noun)*\nA mixture.\n-# Source: Wiktionary · <https://en.wiktionary.org/wiki/melange>");
    expect((await brain({ define, web }).reply(input("what does sietch mean"))).content).toContain("A **sietch** is a Fremen community.");
  });

  it("tells a fresh joke when it can, and falls back to its own", async () => {
    expect((await brain({ joke: () => Promise.resolve("I'm reading a book on anti-gravity.") }).reply(input("tell me a joke"))).content).toBe("I'm reading a book on anti-gravity.");
    expect((await brain({ joke: () => Promise.reject(new Error("busy")) }).reply(input("tell me a joke"))).content.length).toBeGreaterThan(5);
  });
});

describe("ChatBrain with its language model", () => {
  it("lets the model answer with notes from its knowledge and the web, and keeps staff answers as written", async () => {
    const think = vi.fn((request: { system: string; history: readonly unknown[]; message: string }) => Promise.resolve(`thought about ${request.message}`));
    const web = vi.fn(() => Promise.resolve({ title: "Sandworm", summary: "Giant worms of Arrakis.", url: "https://dune.fandom.com/wiki/Sandworm", source: "Dune Wiki" }));
    const reply = await brain({ think, web }).reply(input("how big do sandworms get?"));
    expect(reply.content).toBe("thought about how big do sandworms get?\n-# Sources: Dune Wiki · <https://dune.fandom.com/wiki/Sandworm>");
    expect(think.mock.calls[0]![0].system).toContain("[Dune Wiki: Sandworm] Giant worms of Arrakis.");
    expect(think.mock.calls[0]![0].system).toContain("Crimson Skies");

    const taught = await brain({ think }).reply(input("when's movie night?"));
    expect(taught.content).toBe("Movie night is every Friday at 8 PM ET, Kenny.");
  });

  it("remembers the conversation for the model and falls back to the rules when it can't answer", async () => {
    const think = vi.fn(() => Promise.resolve("Doing great, thanks!"));
    const first = await brain({ think }).reply(input("how are you?"));
    expect(first.content).toBe("Doing great, thanks!");
    expect(first.memory.history).toEqual([{ user: "how are you?", bot: "Doing great, thanks!" }]);
    await brain({ think }).reply(input("and you?", { memory: first.memory }));
    expect((think.mock.calls[1] as unknown as [{ history: unknown[] }])[0].history).toEqual([{ user: "how are you?", bot: "Doing great, thanks!" }]);

    const silent = await brain({ think: () => Promise.resolve(null) }).reply(input("how are you?"));
    expect(silent.content.length).toBeGreaterThan(3);
    expect(silent.content).not.toBe("Doing great, thanks!");
  });
});

describe("ChatBrain grounding its model in sources", () => {
  it("searches before the model answers, even without a question mark, and cites what it read", async () => {
    const think = vi.fn((request: { system: string }) => Promise.resolve(request.system.includes("December 18, 2026") ? "Dune: Part Three is scheduled for December 18, 2026." : "I don't know."));
    const research = vi.fn(() => Promise.resolve([
      { title: "Dune: Part Three", summary: "Dune: Part Three is an upcoming film directed by Denis Villeneuve. It is scheduled to be released on December 18, 2026.", url: "https://en.wikipedia.org/wiki/Dune:_Part_Three", source: "Wikipedia" },
      { title: "Dune Messiah", summary: "Dune Messiah is a 1969 novel by Frank Herbert.", url: "https://en.wikipedia.org/wiki/Dune_Messiah", source: "Wikipedia" },
    ]));
    const web = vi.fn(() => Promise.resolve(null));
    const reply = await brain({ think, research, web }).reply(input("Dune Part 3"));
    expect(research).toHaveBeenCalledWith("Dune Part 3");
    expect(reply.content).toBe("Dune: Part Three is scheduled for December 18, 2026.\n-# Sources: Wikipedia · <https://en.wikipedia.org/wiki/Dune:_Part_Three> · Wikipedia · <https://en.wikipedia.org/wiki/Dune_Messiah>");
    expect(think.mock.calls[0]![0].system).toMatch(/out of date/);
  });

  it("doesn't search for small talk", async () => {
    const research = vi.fn(() => Promise.resolve([]));
    await brain({ think: () => Promise.resolve("Hey!"), research }).reply(input("thanks so much for helping me today friend"));
    expect(research).not.toHaveBeenCalled();
  });
});
