import { randomInt } from "node:crypto";

interface CaptchaChallenge {
  code: string;
  expiresAt: number;
}

const challenges = new Map<string, CaptchaChallenge>();
const CAPTCHA_TTL_MS = 5 * 60_000;
const MAX_CHALLENGES = 10_000;
const CAPTCHA_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CAPTCHA_LENGTH = 6;

function createCaptcha(userId: string): string {
  const code = Array.from({ length: CAPTCHA_LENGTH }, () => CAPTCHA_ALPHABET[randomInt(CAPTCHA_ALPHABET.length)]).join("");
  const now = Date.now();

  removeExpired(now);

  if (challenges.size >= MAX_CHALLENGES && !challenges.has(userId)) {
    const oldestUserId = challenges.keys().next().value;

    if (oldestUserId !== undefined) {
      challenges.delete(oldestUserId);
    }
  }

  challenges.set(userId, {
    code,
    expiresAt: now + CAPTCHA_TTL_MS,
  });

  return code;
}

function removeExpired(now: number): void {
  for (const [userId, challenge] of challenges) {
    if (challenge.expiresAt <= now) {
      challenges.delete(userId);
    }
  }
}

function verifyCaptcha(userId: string, answer: string): boolean {
  const challenge = challenges.get(userId);

  challenges.delete(userId);

  return Boolean(challenge && challenge.expiresAt > Date.now() && challenge.code === answer.trim().toUpperCase());
}

export { createCaptcha, verifyCaptcha };

export type { CaptchaChallenge };
