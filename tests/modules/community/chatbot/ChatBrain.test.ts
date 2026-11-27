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
