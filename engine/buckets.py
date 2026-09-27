"""Shortlisted / Cutoff / Rejected, computed at view time.

Nothing here touches the database. Decisions are a pure function of
(scores, cutoffs, minimum shortlist, recruiter overrides), which is what lets
the recruiter drag a cutoff on the Results screen and see the effect instantly
without re-running the LLM.

Rules (agreed with the firm):

1. ``score >= shortlist_cutoff``            → shortlisted (reason ``score``)
2. ``maybe_cutoff <= score < shortlist``    → cutoff
3. ``score < maybe_cutoff``                 → rejected
4. If fewer than ``min_shortlist`` are shortlisted, fill by rank. Filled
   candidates are labelled (reason ``fill``) so nobody mistakes them for
   candidates who cleared the bar.
5. Ties at the fill boundary are **all** included, and the extra count is
   reported ("303 shortlisted due to ties").
6. If fewer candidates were scored than the minimum, everyone scored is
   shortlisted and a shortfall is reported.
7. Recruiter overrides are applied last and always win (reason ``override``).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Literal, Mapping

Bucket = Literal["shortlisted", "cutoff", "rejected"]
Reason = Literal["score", "fill", "override"]


@dataclass(frozen=True)
class Placement:
    candidate_id: int
    ra_number: str
    score: int
    rank: int          # competition ranking: 1, 2, 2, 4 …
    bucket: Bucket
    reason: Reason
    auto_bucket: Bucket  # what the rules said before any override


@dataclass(frozen=True)
class BucketResult:
    placements: tuple[Placement, ...]
    counts: dict[str, int]
    filled_to_minimum: int          # candidates shortlisted only because of the minimum
    tie_extra: int                  # shortlisted beyond the minimum because of ties
    shortfall: int                  # minimum not reachable: fewer scored than required
    notes: tuple[str, ...] = field(default_factory=tuple)

    def in_bucket(self, bucket: Bucket) -> list[Placement]:
        return [p for p in self.placements if p.bucket == bucket]


def compute_buckets(
    rows: Iterable[Mapping[str, object]],
    *,
    shortlist_cutoff: int,
    maybe_cutoff: int,
    min_shortlist: int = 0,
    overrides: Mapping[int, str] | None = None,
) -> BucketResult:
    """Place every scored candidate in a bucket.

    ``rows`` need ``candidate_id``, ``ra_number`` and ``overall_score``
    (``Database.scored_rows`` returns exactly that).
    """
    if not 0 <= maybe_cutoff <= shortlist_cutoff <= 100:
        raise ValueError("Cutoffs must satisfy 0 <= cutoff band start <= shortlist score <= 100.")
    if min_shortlist < 0:
        raise ValueError("Minimum shortlist cannot be negative.")
    overrides = dict(overrides or {})

    ordered = sorted(
        (
            (int(r["candidate_id"]), str(r["ra_number"]), int(r["overall_score"]))  # type: ignore[arg-type]
            for r in rows
        ),
        key=lambda item: (-item[2], item[1]),
    )

    # Competition ranking: equal scores share a rank.
    ranks: list[int] = []
    for index, (_, _, score) in enumerate(ordered):
        if index > 0 and score == ordered[index - 1][2]:
            ranks.append(ranks[-1])
        else:
            ranks.append(index + 1)

    cleared = sum(1 for _, _, score in ordered if score >= shortlist_cutoff)
    notes: list[str] = []
    fill_floor: int | None = None   # lowest score that gets shortlisted by filling
    tie_extra = shortfall = 0

    if min_shortlist > cleared and ordered:
        if len(ordered) <= min_shortlist:
            fill_floor = ordered[-1][2]
            shortfall = min_shortlist - len(ordered)
            if shortfall:
                notes.append(
                    f"Only {len(ordered)} candidates were scored, fewer than the minimum of "
                    f"{min_shortlist}. All of them are shortlisted."
                )
        else:
            fill_floor = ordered[min_shortlist - 1][2]
            reached = sum(1 for _, _, score in ordered if score >= fill_floor)
            tie_extra = reached - min_shortlist
            if tie_extra:
                tied = sum(1 for _, _, score in ordered if score == fill_floor)
                notes.append(
                    f"{reached} shortlisted instead of {min_shortlist}: "
                    f"{tied} candidates tied at score {fill_floor}."
                )
    elif min_shortlist > 0 and not ordered:
        shortfall = min_shortlist

    placements: list[Placement] = []
    filled = 0
    for (candidate_id, ra, score), rank in zip(ordered, ranks):
        auto: Bucket
        reason: Reason
        if score >= shortlist_cutoff:
            auto, reason = "shortlisted", "score"
        elif fill_floor is not None and score >= fill_floor:
            auto, reason = "shortlisted", "fill"
            filled += 1
        elif score >= maybe_cutoff:
            auto, reason = "cutoff", "score"
        else:
            auto, reason = "rejected", "score"

        bucket: Bucket = auto
        if candidate_id in overrides:
            target = overrides[candidate_id]
            if target not in ("shortlisted", "cutoff", "rejected"):
                raise ValueError(f"Override for candidate {candidate_id} has unknown bucket {target!r}.")
            bucket, reason = target, "override"  # type: ignore[assignment]
        placements.append(Placement(candidate_id, ra, score, rank, bucket, reason, auto))

    if filled:
        notes.insert(0, f"{filled} candidates below {shortlist_cutoff} were shortlisted to reach the minimum.")

    counts = {"shortlisted": 0, "cutoff": 0, "rejected": 0}
    for p in placements:
        counts[p.bucket] += 1
    final_short = counts["shortlisted"]
    if overrides and min_shortlist and final_short < min_shortlist and not shortfall:
        notes.append(
            f"Recruiter changes leave {final_short} shortlisted, below the minimum of {min_shortlist}."
        )

    return BucketResult(
        placements=tuple(placements),
        counts=counts,
        filled_to_minimum=filled,
        tie_extra=tie_extra,
        shortfall=shortfall,
        notes=tuple(notes),
    )
