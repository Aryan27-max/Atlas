"""Tests for engine/buckets.py — cutoffs, minimum fill, ties, overrides."""

from __future__ import annotations

import unittest

from engine.buckets import compute_buckets


def rows(*scores: int) -> list[dict[str, object]]:
    return [
        {"candidate_id": i, "ra_number": f"RA{i:04d}", "overall_score": s}
        for i, s in enumerate(scores, start=1)
    ]


def buckets_of(result) -> dict[int, tuple[str, str]]:
    return {p.candidate_id: (p.bucket, p.reason) for p in result.placements}


class BucketTests(unittest.TestCase):
    def test_plain_bands(self) -> None:
        r = compute_buckets(rows(90, 60, 59, 50, 49, 0), shortlist_cutoff=60, maybe_cutoff=50)
        self.assertEqual(r.counts, {"shortlisted": 2, "cutoff": 2, "rejected": 2})
        self.assertEqual(r.filled_to_minimum, 0)
        self.assertEqual(r.notes, ())

    def test_minimum_already_met_changes_nothing(self) -> None:
        r = compute_buckets(rows(90, 80, 70), shortlist_cutoff=60, maybe_cutoff=50, min_shortlist=2)
        self.assertEqual(r.counts["shortlisted"], 3)
        self.assertEqual(r.filled_to_minimum, 0)

    def test_fill_to_minimum_is_labelled(self) -> None:
        r = compute_buckets(rows(80, 55, 45, 30, 20), shortlist_cutoff=60, maybe_cutoff=50, min_shortlist=3)
        b = buckets_of(r)
        self.assertEqual(b[1], ("shortlisted", "score"))
        self.assertEqual(b[2], ("shortlisted", "fill"))
        self.assertEqual(b[3], ("shortlisted", "fill"))
        self.assertEqual(b[4], ("rejected", "score"))
        self.assertEqual(r.filled_to_minimum, 2)
        self.assertIn("2 candidates below 60", r.notes[0])

    def test_ties_at_boundary_all_included(self) -> None:
        # minimum 3; 3rd place is 41, shared by three people → 5 shortlisted
        r = compute_buckets(rows(70, 50, 41, 41, 41, 30), shortlist_cutoff=60, maybe_cutoff=45, min_shortlist=3)
        self.assertEqual(r.counts["shortlisted"], 5)
        self.assertEqual(r.tie_extra, 2)
        self.assertTrue(any("5 shortlisted instead of 3" in n and "3 candidates tied" in n for n in r.notes))
        self.assertEqual(buckets_of(r)[6], ("rejected", "score"))

    def test_fewer_scored_than_minimum(self) -> None:
        r = compute_buckets(rows(40, 20), shortlist_cutoff=60, maybe_cutoff=50, min_shortlist=300)
        self.assertEqual(r.counts["shortlisted"], 2)
        self.assertEqual(r.shortfall, 298)
        self.assertTrue(any("fewer than the minimum of 300" in n for n in r.notes))

    def test_nothing_scored(self) -> None:
        r = compute_buckets([], shortlist_cutoff=60, maybe_cutoff=50, min_shortlist=5)
        self.assertEqual(r.shortfall, 5)
        self.assertEqual(r.placements, ())

    def test_competition_ranking(self) -> None:
        r = compute_buckets(rows(90, 80, 80, 70), shortlist_cutoff=60, maybe_cutoff=50)
        self.assertEqual([p.rank for p in r.placements], [1, 2, 2, 4])

    def test_tie_order_is_stable_by_ra_number(self) -> None:
        r = compute_buckets(rows(50, 50, 50), shortlist_cutoff=60, maybe_cutoff=50)
        self.assertEqual([p.ra_number for p in r.placements], ["RA0001", "RA0002", "RA0003"])

    def test_overrides_win_and_keep_auto_bucket(self) -> None:
        r = compute_buckets(
            rows(90, 55, 10), shortlist_cutoff=60, maybe_cutoff=50, overrides={3: "shortlisted", 1: "rejected"}
        )
        b = buckets_of(r)
        self.assertEqual(b[3], ("shortlisted", "override"))
        self.assertEqual(b[1], ("rejected", "override"))
        auto = {p.candidate_id: p.auto_bucket for p in r.placements}
        self.assertEqual(auto[1], "shortlisted")

    def test_override_below_minimum_is_reported(self) -> None:
        r = compute_buckets(
            rows(90, 80), shortlist_cutoff=60, maybe_cutoff=50, min_shortlist=2, overrides={1: "rejected"}
        )
        self.assertTrue(any("below the minimum of 2" in n for n in r.notes))

    def test_cutoff_changes_need_no_rescoring(self) -> None:
        data = rows(75, 65, 55)
        strict = compute_buckets(data, shortlist_cutoff=70, maybe_cutoff=60)
        loose = compute_buckets(data, shortlist_cutoff=50, maybe_cutoff=40)
        self.assertEqual(strict.counts["shortlisted"], 1)
        self.assertEqual(loose.counts["shortlisted"], 3)

    def test_invalid_input(self) -> None:
        with self.assertRaises(ValueError):
            compute_buckets(rows(1), shortlist_cutoff=40, maybe_cutoff=50)
        with self.assertRaises(ValueError):
            compute_buckets(rows(1), shortlist_cutoff=60, maybe_cutoff=50, min_shortlist=-1)
        with self.assertRaises(ValueError):
            compute_buckets(rows(1), shortlist_cutoff=60, maybe_cutoff=50, overrides={1: "maybe"})


if __name__ == "__main__":
    unittest.main()
