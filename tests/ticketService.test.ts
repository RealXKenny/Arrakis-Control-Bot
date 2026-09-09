import type { GuildMember, Message } from "discord.js";
import { describe, expect, it } from "vitest";

import type { TicketRecord } from "../src/infrastructure/database/TicketRepository";
import { TICKET_CATEGORIES, buildTicketModal, getTicketCategory } from "../src/modules/tickets/ticketCategories";
import { TicketReviewValidationError, parseTicketId, parseTicketReview } from "../src/modules/tickets/ticketReview";
import { buildTicketArchiveContainer, buildTicketJson } from "../src/modules/tickets/ticketArchive";
import { buildTicketCard, buildTicketChannelName, buildTicketTranscript, formatDuneAccount } from "../src/modules/tickets/ticketService";
import { DISCORD_LIMITS, countDisplayableText } from "../src/shared/utils/discordLimits";

describe("ticket channel names", () => {
  it("creates safe, readable Discord channel names", () => {
    expect(buildTicketChannelName(42, "Paul Atreides!!")).toBe("ticket-42-paul-atreides");
  });

  it("uses a fallback and respects Discord's length limit", () => {
    expect(buildTicketChannelName(7, "🌵")).toBe("ticket-7-member");
    expect(buildTicketChannelName(9, "A".repeat(150))).toHaveLength(100);
  });

  it("includes the selected support category", () => {
    expect(buildTicketChannelName(12, "Chani", "Technical Support")).toBe("ticket-12-technical-support-chani");
  });
});

describe("ticket categories", () => {
  it("provides unique category values and a safe general fallback", () => {
    expect(new Set(TICKET_CATEGORIES.map(({ value }) => value)).size).toBe(TICKET_CATEGORIES.length);
    expect(getTicketCategory("unknown").value).toBe("general-other");
  });

  it("locks the chosen category into the modal custom ID", () => {
    expect(buildTicketModal("player-report").toJSON().custom_id).toBe("ticket-create-modal:player-report");
  });
});

describe("ticket Dune account details", () => {
  it("includes linked character identity and status", () => {
    const output = formatDuneAccount(
      createTicketRecord({
        duneLookupStatus: "linked",
        duneAccount: {
          characterName: "Muad'Dib",
          pawnId: "pawn-12",
          controllerId: "controller-34",
          onlineStatus: "Offline",
        },
      }),
    );

    expect(output).toContain("Muad'Dib");
    expect(output).toContain("pawn-12");
    expect(output).toContain("controller-34");
    expect(output).toContain("Offline");
  });

  it("distinguishes an unlinked account from an unavailable lookup", () => {
    expect(formatDuneAccount(createTicketRecord({ duneLookupStatus: "unlinked" }))).toContain("No linked Dune character");
    expect(formatDuneAccount(createTicketRecord({ duneLookupStatus: "unavailable" }))).toContain("lookup was unavailable");
  });
});

describe("ticket transcripts", () => {
  it("captures intake, linked account data, messages, and attachments", () => {
    const ticket = createTicketRecord({
      duneLookupStatus: "linked",
      duneAccount: { characterName: "Chani", pawnId: "p-1", controllerId: "c-2", onlineStatus: "Online" },
    });
    const message = {
      createdAt: new Date("2026-09-09T12:00:00.000Z"),
      createdTimestamp: Date.parse("2026-09-09T12:00:00.000Z"),
      author: { tag: "member#0001", id: "member" },
      content: "The server returns error 500.",
      embeds: [],
      components: [],
      attachments: new Map([["attachment", { name: "error.png", url: "https://cdn.discordapp.com/error.png" }]]),
    } as unknown as Message;
    const closer = { id: "staff", user: { tag: "staff#0001" } } as GuildMember;

    const transcript = buildTicketTranscript(ticket, closer, [message]);

    expect(transcript).toContain("ARRAKIS SUPPORT TICKET #1");
    expect(transcript).toContain("Character: Chani");
    expect(transcript).toContain("The server returns error 500.");
    expect(transcript).toContain("error.png: https://cdn.discordapp.com/error.png");
  });
});

describe("ticket assignment and archive", () => {
  it("shows claim controls and the assigned handler", () => {
    const unclaimed = buildTicketCard(createTicketRecord()).toJSON();
    expect(JSON.stringify(unclaimed)).toContain("ticket-claim:1");

    const claimed = buildTicketCard(createTicketRecord({ claimedBy: "staff", claimedAt: new Date("2026-09-09T12:30:00.000Z") })).toJSON();
    expect(JSON.stringify(claimed)).toContain("ticket-unclaim:1");
    expect(JSON.stringify(claimed)).toContain("<@staff>");
  });

  it("creates one structured archive with transcript and review data", () => {
    const ticket = createTicketRecord({
      status: "closed",
      claimedBy: "staff",
      claimedAt: new Date("2026-09-09T12:30:00.000Z"),
      closedBy: "staff",
      closedAt: new Date("2026-09-09T13:00:00.000Z"),
      transcript: "complete transcript",
      transcriptMessageCount: 4,
      reviewRating: 5,
      reviewResolved: true,
      reviewComment: "Fast and helpful",
      reviewedAt: new Date("2026-09-09T14:00:00.000Z"),
    });
    const archive = JSON.stringify(buildTicketArchiveContainer(ticket).toJSON());
    const record = JSON.parse(buildTicketJson(ticket));

    expect(archive).toContain("Handled by");
    expect(archive).toContain("Fast and helpful");
    expect(archive).toContain("ticket-1-transcript.txt");
    expect(archive).toContain("ticket-1.json");
    expect(record.ticket.claimedBy).toBe("staff");
    expect(record.ticket.review.rating).toBe(5);
    expect(record.ticket.transcript).toEqual({
      filename: "ticket-1-transcript.txt",
      messageCount: 4,
      createdAt: null,
      storedInPostgreSQL: true,
    });
    expect(buildTicketJson(ticket)).not.toContain("complete transcript");
  });

  it("keeps escaped intake and review text within Discord's container limit", () => {
    const oversized = "@*_`>|\\".repeat(1_000);
    const ticket = createTicketRecord({
      subject: oversized,
      category: oversized,
      description: oversized,
      stepsTried: oversized,
      impact: oversized,
      reviewRating: 1,
      reviewResolved: false,
      reviewComment: oversized,
      reviewedAt: new Date("2026-09-09T14:00:00.000Z"),
    });

    expect(countDisplayableText(buildTicketCard(ticket).toJSON())).toBeLessThanOrEqual(DISCORD_LIMITS.componentDisplayableText);
    expect(countDisplayableText(buildTicketArchiveContainer(ticket).toJSON())).toBeLessThanOrEqual(DISCORD_LIMITS.componentDisplayableText);
  });
});

describe("ticket reviews", () => {
  it("parses valid ratings and resolution feedback", () => {
    expect(parseTicketReview("5", "Yes", "Fast and helpful")).toEqual({
      rating: 5,
      resolved: true,
      comment: "Fast and helpful",
    });
    expect(parseTicketId("ticket-review-modal:42")).toBe(42);
  });

  it("rejects malformed or out-of-range review values", () => {
    expect(() => parseTicketReview("6", "yes", "")).toThrow(TicketReviewValidationError);
    expect(() => parseTicketReview("4", "maybe", "")).toThrow('Enter "Yes" or "No"');
    expect(parseTicketId("ticket-review:invalid")).toBeNull();
  });
});

function createTicketRecord(overrides: Partial<TicketRecord> = {}): TicketRecord {
  return {
    id: 1,
    guildId: "guild",
    channelId: "channel",
    ticketMessageId: "message",
    openerId: "member",
    subject: "Help",
    category: "Technical issue",
    description: "Something happened",
    stepsTried: "Restarted",
    impact: "Cannot play",
    duneLookupStatus: "unlinked",
    duneAccount: null,
    status: "open",
    createdAt: new Date(0),
    closedAt: null,
    closedBy: null,
    claimedBy: null,
    claimedAt: null,
    transcript: null,
    transcriptCreatedAt: null,
    transcriptMessageCount: 0,
    reviewRating: null,
    reviewResolved: null,
    reviewComment: null,
    reviewedAt: null,
    archiveChannelId: null,
    archiveMessageId: null,
    ...overrides,
  };
}
