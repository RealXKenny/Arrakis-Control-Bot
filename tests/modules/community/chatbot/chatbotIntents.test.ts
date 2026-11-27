import { describe, expect, it } from "vitest";
import { detectIntent, extractMath } from "../../../../src/modules/community/chatbot/chatbotIntents";
import { evaluateExpression, formatNumber } from "../../../../src/modules/community/chatbot/chatbotMath";

const BOT = "100000000000000001";
const MEMBER = "200000000000000002";

describe("chatbot intents", () => {
  it("routes live questions to the bot's own lookups", () => {
    expect(detectIntent(`<@${BOT}> what's my level?`, BOT)).toEqual({ kind: "level" });
    expect(detectIntent(`<@${BOT}> what level is <@${MEMBER}>`, BOT)).toEqual({ kind: "level", userId: MEMBER });
    expect(detectIntent("show the level leaderboard", BOT).kind).toBe("levelTop");
    expect(detectIntent("who is the richest player", BOT).kind).toBe("solariTop");
    expect(detectIntent("when is the next coriolis storm?", BOT).kind).toBe("storm");
    expect(detectIntent("is the server up", BOT).kind).toBe("serverStatus");
    expect(detectIntent("how many players are online", BOT).kind).toBe("serverStatus");
    expect(detectIntent("what's new in the latest update", BOT).kind).toBe("whatsNew");
    expect(detectIntent("what's your uptime", BOT).kind).toBe("botInfo");
    expect(detectIntent("item id for stillsuit", BOT)).toEqual({ kind: "item", query: "stillsuit" });
  });

  it("handles the fun stuff", () => {
    expect(detectIntent("roll 2d20", BOT)).toEqual({ kind: "dice", count: 2, sides: 20 });
    expect(detectIntent("roll a dice", BOT)).toEqual({ kind: "dice", count: 1, sides: 6 });
    expect(detectIntent("roll 99d99999", BOT)).toEqual({ kind: "dice", count: 20, sides: 1_000 });
    expect(detectIntent("flip a coin", BOT).kind).toBe("coin");
    expect(detectIntent("pick pizza, tacos or sushi", BOT)).toEqual({ kind: "choose", options: ["pizza", "tacos", "sushi"] });
    expect(detectIntent("8ball will I find spice", BOT).kind).toBe("eightBall");
    expect(detectIntent("what time is it", BOT).kind).toBe("time");
    expect(detectIntent(`<@${BOT}> what is 12 * (3 + 4)?`, BOT)).toEqual({ kind: "math", expression: "12 * (3 + 4)" });
  });

  it("recognizes small talk only in short messages", () => {
    expect(detectIntent(`<@${BOT}>`, BOT).kind).toBe("greeting");
    expect(detectIntent("hey!", BOT).kind).toBe("greeting");
    expect(detectIntent("how are you?", BOT).kind).toBe("howAreYou");
    expect(detectIntent("who are you", BOT).kind).toBe("identity");
    expect(detectIntent("what can you do", BOT).kind).toBe("capabilities");
    expect(detectIntent("tell me a joke", BOT).kind).toBe("joke");
    expect(detectIntent("thanks!", BOT).kind).toBe("thanks");
    expect(detectIntent("good bot", BOT).kind).toBe("compliment");
    expect(detectIntent("bye", BOT).kind).toBe("farewell");
    expect(detectIntent("hey how do I link my game account to discord please", BOT).kind).toBe("unknown");
  });

  it("understands follow-ups", () => {
    expect(detectIntent("tell me more", BOT).kind).toBe("more");
    expect(detectIntent(`what about <@${MEMBER}>?`, BOT)).toEqual({ kind: "followUp", userId: MEMBER });
  });
});

describe("chatbot math", () => {
  it("only treats bare arithmetic as math", () => {
    expect(extractMath("what is 2+2")).toBe("2+2");
    expect(extractMath("3 x 4")).toBe("3 * 4");
    expect(extractMath("what is 2025")).toBeNull();
    expect(extractMath("is the server up 24/7")).toBeNull();
  });

  it("evaluates with precedence and refuses anything else", () => {
    expect(evaluateExpression("2 + 3 * 4")).toEqual({ ok: true, value: 14 });
    expect(evaluateExpression("(2 + 3) * 4")).toEqual({ ok: true, value: 20 });
    expect(evaluateExpression("2 ^ 3 ^ 2")).toEqual({ ok: true, value: 512 });
    expect(evaluateExpression("-3 + 10 % 4")).toEqual({ ok: true, value: -1 });
    expect(evaluateExpression("1 / 0")).toEqual({ ok: false, reason: "divideByZero" });
    expect(evaluateExpression("9 ^ 99")).toEqual({ ok: false, reason: "tooLarge" });
    expect(evaluateExpression("2 + process")).toEqual({ ok: false, reason: "invalid" });
    expect(evaluateExpression("(1 + 2")).toEqual({ ok: false, reason: "invalid" });
    expect(formatNumber(0.1 + 0.2)).toBe("0.3");
  });
});
