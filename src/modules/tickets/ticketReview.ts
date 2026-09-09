import type { Client } from "discord.js";

import type { TicketRecord, TicketReviewInput } from "../../infrastructure/database/TicketRepository";
import { updateTicketArchive } from "./ticketArchive";

class TicketReviewValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TicketReviewValidationError";
  }
}

function parseTicketId(customId: string): number | null {
  const value = customId.split(":", 2)[1];

  if (!value || !/^\d+$/.test(value)) return null;

  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseTicketReview(ratingValue: string, resolvedValue: string, commentValue: string): TicketReviewInput {
  const normalizedRating = ratingValue.trim();

  if (!/^[1-5]$/.test(normalizedRating)) {
    throw new TicketReviewValidationError("Rating must be a number from 1 to 5.");
  }

  const normalizedResolved = resolvedValue.trim().toLowerCase();
  let resolved: boolean;

  if (["yes", "y"].includes(normalizedResolved)) {
    resolved = true;
  } else if (["no", "n"].includes(normalizedResolved)) {
    resolved = false;
  } else {
    throw new TicketReviewValidationError('Enter "Yes" or "No" for whether the issue was resolved.');
  }

  return {
    rating: Number(normalizedRating),
    resolved,
    comment: commentValue.trim(),
  };
}

async function publishTicketReview(client: Client, ticket: TicketRecord): Promise<void> {
  await updateTicketArchive(client, ticket);
}

export { TicketReviewValidationError, parseTicketId, parseTicketReview, publishTicketReview };
