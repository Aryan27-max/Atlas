import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEMO_STUDENTS, placeStudents } from "../components/landing/demo-buckets.ts";
import { formatBytes, formatDate } from "../lib/format.ts";

// The landing-page demo must behave like the app's engine/buckets.py.
describe("demo grouping", () => {
  it("groups by the two lines", () => {
    const r = placeStudents(DEMO_STUDENTS, { shortlist: 75, band: 60, minimum: 0 });
    assert.deepEqual(r.counts, { shortlisted: 14, cutoff: 15, rejected: 13 });
    assert.equal(r.filled, 0);
  });

  it("fills to the minimum by rank, labels them, and never splits a tie", () => {
    // 14 clear 75; the 17th-ranked score is 72, shared by two students.
    const r = placeStudents(DEMO_STUDENTS, { shortlist: 75, band: 60, minimum: 17 });
    assert.equal(r.counts.shortlisted, 18);
    assert.equal(r.filled, 4);
    assert.equal(r.tieExtra, 1);
    assert.equal(r.fillFloor, 72);
    assert.ok(r.placements.filter((p) => p.filled).every((p) => p.score < 75 && p.score >= 72));
  });

  it("doesn't fill when the minimum is already met", () => {
    const r = placeStudents(DEMO_STUDENTS, { shortlist: 75, band: 60, minimum: 10 });
    assert.equal(r.filled, 0);
    assert.equal(r.counts.shortlisted, 14);
  });

  it("shortlists everyone when the minimum exceeds the list", () => {
    const r = placeStudents(DEMO_STUDENTS, { shortlist: 90, band: 50, minimum: 100 });
    assert.equal(r.counts.shortlisted, DEMO_STUDENTS.length);
  });

  it("keeps the band at or below the shortlist line", () => {
    const r = placeStudents(DEMO_STUDENTS, { shortlist: 60, band: 80, minimum: 0 });
    assert.equal(r.counts.cutoff, 0);
  });

  it("counts every student exactly once", () => {
    for (const shortlist of [20, 50, 75, 100]) {
      for (const minimum of [0, 5, 30]) {
        const r = placeStudents(DEMO_STUDENTS, { shortlist, band: 40, minimum });
        const total = r.counts.shortlisted + r.counts.cutoff + r.counts.rejected;
        assert.equal(total, DEMO_STUDENTS.length);
      }
    }
  });
});

describe("formatting", () => {
  it("formats file sizes like Finder", () => {
    assert.equal(formatBytes(512), "512 bytes");
    assert.equal(formatBytes(1_500), "1.5 KB");
    assert.equal(formatBytes(150_000_000), "150 MB");
    assert.equal(formatBytes(98_400_000), "98.4 MB");
    assert.equal(formatBytes(2_000_000_000), "2 GB");
  });

  it("formats dates in British English and ignores bad input", () => {
    assert.equal(formatDate("2026-11-06T10:00:00Z"), "6 November 2026");
    assert.equal(formatDate(null), null);
    assert.equal(formatDate("not a date"), null);
  });
});
