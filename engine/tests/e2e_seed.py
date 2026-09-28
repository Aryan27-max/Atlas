"""Seed a data folder with one finished screening of fictional students, for
the app's performance test (PLAN 2.9: 2,000 scored rows).

Every candidate goes through the real state machine (``Database`` methods
only, rule 2): queued → downloading → downloaded → extracted → scoring →
scored, or → failed. Names, RA numbers and scores are generated; nothing
comes from real data.

    python -m engine.tests.e2e_seed <data-dir> [--count 2000]
"""

from __future__ import annotations

import argparse
import random
import sys
from pathlib import Path

from engine.db import Database
from engine.errors import Reason

FIRST = ["Aarav", "Diya", "Kabir", "Meera", "Rohan", "Ananya", "Vikram", "Isha", "Arjun", "Nila",
         "Karthik", "Priya", "Sanjay", "Lakshmi", "Farhan", "Tara", "Dev", "Kavya", "Omar", "Sneha"]
LAST = ["Sharma", "Iyer", "Menon", "Rao", "Gupta", "Nair", "Singh", "Das", "Pillai", "Reddy",
        "Khan", "Joshi", "Bose", "Varma", "Qureshi", "Sen", "Mehta", "Kapoor", "Ghosh", "Patel"]
DEPARTMENTS = ["CSE", "IT", "ECE", "EEE", "Mech", "Civil"]
SUB_SCORES = ("technical", "projects", "experience", "achievements", "communication", "criteria_fit")


def seed(data_dir: Path, count: int = 2000, *, seed_value: int = 7) -> int:
    """Create the run and return its id."""
    rng = random.Random(seed_value)
    db = Database(data_dir / "atlas.db")
    try:
        run_id = db.create_run(f"Campus drive ({count:,} fictional students)", csv_filename="fictional.csv")
        db.configure_run(run_id, model_name="qwen3:8b", criteria_prompt="Python, SQL and one real project.",
                         shortlist_cutoff=70, maybe_cutoff=55, min_shortlist=0)
        rows = [{
            "ra_number": f"RA24{i:08d}",
            "name": f"{FIRST[i % len(FIRST)]} {LAST[(i // len(FIRST)) % len(LAST)]}",
            "email": f"student{i}@example.com",
            "phone": "9000000000",
            "cgpa": round(rng.uniform(6.0, 9.9), 2),
            "department": DEPARTMENTS[i % len(DEPARTMENTS)],
            "skills": "Python, SQL",
            "resume_link": f"https://drive.google.com/file/d/FICTIONAL{i:06d}/view",
        } for i in range(count)]
        db.add_candidates(run_id, rows)
        db.set_run_status(run_id, "running")
        for candidate in db.list_candidates(run_id):
            cid = candidate["id"]
            db.start_download(cid)
            if rng.random() < 0.02:
                db.mark_failed(cid, kind="permanent", reason=Reason.PRIVATE)
                continue
            db.finish_download(cid, data_dir / "downloads" / f"{cid}.pdf")
            db.commit_extraction(cid, text="Fictional résumé text.", page_count=1, ocr_used=False,
                                 pdf_sha256=f"{cid:064x}")
            db.start_scoring(cid)
            score = max(0, min(100, int(rng.gauss(62, 15))))
            db.save_evaluation(
                cid, overall_score=score,
                sub_scores={key: max(0, min(100, score + rng.randint(-8, 8))) for key in SUB_SCORES},
                summary="Fictional evaluation.", reasons=["Seeded for the performance test."],
                evidence=[], claim_mismatches=[], model_name="qwen3:8b", prompt_hash="seed",
                duration_seconds=round(rng.uniform(20, 60), 1),
            )
        db.set_run_status(run_id, "completed")
        return run_id
    finally:
        db.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("data_dir", type=Path)
    parser.add_argument("--count", type=int, default=2000)
    args = parser.parse_args(argv)
    run_id = seed(args.data_dir, args.count)
    print(f"seeded run {run_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
