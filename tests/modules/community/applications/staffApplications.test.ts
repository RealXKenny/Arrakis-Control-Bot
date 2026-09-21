import { describe, expect, it } from "vitest";
import type { StaffApplicationRecord } from "../../../../src/infrastructure/database/applications/StaffApplicationRepository";
import { applicationBlockReason, buildReviewCard } from "../../../../src/modules/community/applications/StaffApplicationService";
import { buildStaffApplicationModal } from "../../../../src/modules/community/applications/staffApplicationForm";
import { buildStaffApplicationPanel } from "../../../../src/modules/community/applications/staffApplicationPanel";

const record: StaffApplicationRecord = {
  id: "00000000-0000-4000-8000-000000000001",
  guildId: "123456789012345678",
  userId: "223456789012345678",
  answers: { identity: "UTC, adult", experience: "Moderator", motivation: "Help people", scenario: "De-escalate privately", availability: "Evenings" },
  status: "pending",
  reviewChannelId: null,
  reviewMessageId: null,
  reviewerId: null,
  reviewReason: null,
  createdAt: new Date("2026-09-20T12:00:00Z"),
  decidedAt: null,
};

describe("staff applications", () => {
  it("builds a five-question modal and public apply control", () => {
    expect(buildStaffApplicationModal().toJSON().components).toHaveLength(5);
    expect(JSON.stringify(buildStaffApplicationPanel().toJSON())).toContain("staff-application:open");
  });

  it("blocks pending and cooling-down applicants", () => {
    expect(applicationBlockReason(record, 7)).toContain("pending");
    expect(applicationBlockReason({ ...record, status: "denied" }, 7, record.createdAt.getTime() + 1_000)).toContain("<t:");
    expect(applicationBlockReason({ ...record, status: "denied" }, 0)).toBeNull();
  });

  it("removes decision buttons after review", () => {
    expect(JSON.stringify(buildReviewCard(record, "Applicant").toJSON())).toContain("staff-application:accept:");
    expect(JSON.stringify(buildReviewCard({ ...record, status: "accepted", reviewerId: "323456789012345678", reviewReason: "Strong answers" }, undefined, "Reviewer").toJSON())).not.toContain("staff-application:accept:");
  });
});
