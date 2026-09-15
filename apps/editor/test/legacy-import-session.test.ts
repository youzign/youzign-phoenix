import { describe, expect, it } from "vitest";
import {
  LEGACY_IMPORT_BATCH_SIZE,
  commitLegacyImportItem,
  createLegacyImportSession,
  legacyDocumentId,
  legacyImportBatch,
  legacyImportSummary,
  retryLegacyImportItems,
} from "../src/library/legacyImportSession.js";

const user = { user_id: 42, username: "dujuana", email_masked: "d***@example.com" };
const designs = Array.from({ length: 1701 }, (_, index) => ({
  generation: 3 as const,
  design_id: index + 1,
  title: `Design ${index + 1}`,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  thumb_url: null,
}));

describe("legacy import sessions", () => {
  it("imports a 1,701-design library in batches of 100, resumes after an interruption near 817, and never re-runs committed designs", () => {
    let session = createLegacyImportSession("dujuana@example.com", user, designs, 1);
    const imported = new Set<string>();
    let calls = 0;

    const runBatch = (interruptAfter?: number) => {
      for (const item of legacyImportBatch(session)) {
        if (interruptAfter !== undefined && calls === interruptAfter) throw new Error("simulated app close");
        expect(imported.has(item.key)).toBe(false);
        imported.add(item.key);
        calls++;
        session = commitLegacyImportItem(session, item.key, "imported");
      }
    };

    for (let batch = 0; batch < 8; batch++) runBatch();
    expect(calls).toBe(800);
    expect(legacyImportBatch(session)).toHaveLength(LEGACY_IMPORT_BATCH_SIZE);
    expect(() => runBatch(817)).toThrow("simulated app close");
    expect(calls).toBe(817);
    expect(legacyImportSummary(session)).toMatchObject({ imported: 817, pending: 884 });

    while (legacyImportBatch(session).length) runBatch();
    expect(calls).toBe(1701);
    expect(imported).toHaveLength(1701);
    expect(legacyImportSummary(session)).toMatchObject({ imported: 1701, pending: 0 });
  });

  it("uses a stable document id and retries only the requested failed design", () => {
    let session = createLegacyImportSession("dujuana@example.com", user, designs.slice(0, 2));
    session = commitLegacyImportItem(session, "3:1", "failed", "network");
    const retried = retryLegacyImportItems(session, ["3:1"]);

    expect(legacyDocumentId(user.user_id, designs[0])).toBe("legacy:42:3:1");
    expect(legacyImportBatch(retried).map((item) => item.key)).toEqual(["3:1", "3:2"]);
  });
});
