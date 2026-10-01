"""The scoring rubric and the overall score (ARCHITECTURE §13; Phase 3, step 3.2a).

Smoke test 1: one real résumé scored 95 ten times, and the strong fictional
sample 95 too. An open-ended "0–100, 90+ is exceptional" scale lets a model
park every good résumé near the top. So:

* each sub-score is **anchored**: what 90+, 70, 50, 30 and 10 look like, in
  concrete terms tied to the recruiter's criteria, and 90+ is said to be rare
  (about 1 résumé in 10);
* ``overall_score`` is **computed by code** as a weighted mean of the
  sub-scores. The model is never asked for it. ``criteria_fit`` weighs most,
  because fit to *this* recruiter's needs is what the ranking is for.

Change the weights here (they must add up to 1); nothing else needs to know.
"""

from __future__ import annotations

from typing import Mapping

WEIGHTS: dict[str, float] = {
    "criteria_fit": 0.30,
    "technical": 0.20,
    "projects": 0.20,
    "experience": 0.15,
    "achievements": 0.10,
    "communication": 0.05,
}

RUBRIC = """\
Score each sub-score from 0 to 100 (whole numbers) against these anchors. Use the numbers in between when a résumé falls between two anchors. 90 or above is rare: expect it for about 1 résumé in 10. Most solid students land between 55 and 80.

- criteria_fit (fit to the recruiter's criteria):
  90+ meets every must-have in the criteria with evidence AND shows 2 or more of the strong-plus items · 70 meets most must-haves with evidence · 50 meets the must-haves only partly · 30 meets few of them · 10 unrelated to the criteria.
- technical (depth in the skills the criteria need, shown in real work, not in a skills list):
  90+ uses several required technologies in depth in real systems (performance, scale, testing) · 70 uses most required technologies competently in projects or internships · 50 some required technologies, mostly at coursework or tutorial level · 30 required technologies are only listed · 10 none of them.
- projects (substance):
  90+ 2 or more relevant projects with real users or measured results, deployed, clearly the student's own engineering · 70 one or two solid, complete, relevant projects · 50 small or course projects, partly relevant · 30 toy projects (a calculator, a to-do list) or vague descriptions · 10 no projects.
- experience (internships and work):
  90+ 2 or more relevant internships with concrete, measured contributions · 70 one relevant internship with concrete work · 50 a short or partly relevant internship · 30 unrelated work or a very short exposure · 10 none.
- achievements (awards, hackathons, competitions, open source):
  90+ national or international results, or a widely used open-source project · 70 a win or strong placing at a state or college event relevant to the criteria · 50 taking part in relevant hackathons or competitions · 30 unrelated activities only · 10 none.
- communication (clarity of the résumé itself):
  90+ concise, specific, quantified and well organised · 70 clear, with some specifics · 50 understandable but generic · 30 vague, padded or disorganised · 10 hard to understand.

Do not give an overall score: Atlas computes it from your sub-scores."""


def overall_from(sub_scores: Mapping[str, int] | object) -> int:
    """The overall score: the weighted mean of the sub-scores, rounded to a whole number."""
    values = sub_scores if isinstance(sub_scores, Mapping) else getattr(sub_scores, "__dict__", {})
    total = sum(WEIGHTS[name] * int(values[name]) for name in WEIGHTS)
    return max(0, min(100, int(round(total))))
