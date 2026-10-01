"""The bundled fictional evaluation set: 8 invented students, 5 quality levels, 3 roles.

Every person, company, college and number here is made up. Regenerate the
PDFs with ``python -m engine.eval make-fictional`` (PyMuPDF, no network).

The brief is for backend interns, so the data/ML and frontend students are
"off-role": strong at something, but a partial fit. ``expected_rank_group``
1 is best; résumés in the same group may come in either order.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

CRITERIA = (
    "Backend software engineering interns. Must have: Python or Go, building HTTP APIs, SQL databases. "
    "Strong plus: deploying to the cloud, testing, real users or measurable impact, open-source work."
)


@dataclass(frozen=True)
class Sample:
    file: str
    expected_bucket: str          # at the default cutoffs (shortlist 60, band 50)
    expected_rank_group: int      # 1 = best
    level: str                    # exceptional · strong · average · weak · very weak
    role: str
    skills: str                   # what the student claimed on the form
    text: str


SAMPLES: tuple[Sample, ...] = (
    Sample("01_exceptional_backend.pdf", "shortlisted", 1, "exceptional", "backend",
           "Python, Go, PostgreSQL, Kubernetes, AWS", """ANIKA VERMA
anika.verma@example.com | +91 90000 22222 | github.com/example-anika

SUMMARY
Final-year CSE student; maintainer of an open-source job queue used in production by other teams.

EXPERIENCE
Software Engineering Intern, Fernhill Logistics (May 2025 - August 2025)
- Designed and shipped a Go gRPC service that schedules 2 million delivery routes a day; on-call for 6 weeks
- Moved order history from a single PostgreSQL table to monthly partitions; p99 query time fell from 2.1 s to 90 ms
- Added property-based tests and a load-test suite in CI; caught 3 race conditions before release
Backend Intern, Tealeaf Health (December 2024 - February 2025)
- Built a FastAPI service for lab-report uploads with S3 presigned URLs, used by 40 clinics

PROJECTS
Taskmill (open source, 1,900 GitHub stars)
- A Python and Redis job queue with retries, rate limits and a web dashboard; 14 outside contributors
- Deployed on AWS ECS with Terraform and blue-green releases; 99.95% uptime over 9 months
Ledger Lite
- A double-entry accounting API in Go and PostgreSQL with full audit history and 92% test coverage

SKILLS
Python, Go, FastAPI, gRPC, PostgreSQL, Redis, Kubernetes, Terraform, AWS, pytest, Linux

ACHIEVEMENTS
ICPC Asia regional finalist 2024; Winner, national inter-college systems design contest 2025
"""),
    Sample("02_strong_backend.pdf", "shortlisted", 2, "strong", "backend",
           "Python, Go, Django, PostgreSQL, Docker", """ROHAN PILLAI
rohan.pillai@example.com | +91 90000 11111 | github.com/example-rohan

SUMMARY
Final-year CSE student who builds and runs backend services.

EXPERIENCE
Backend Engineering Intern, Northwind Payments (May 2025 - August 2025)
- Built a FastAPI service that reconciles 50,000 UPI transactions a day against bank statements
- Cut p95 latency of the settlement API from 800 ms to 140 ms with Redis caching and query indexes
- Wrote integration tests with pytest and Testcontainers; coverage went from 41% to 83%

PROJECTS
Campus Food Queue
- Built a Django and PostgreSQL ordering system used by 1,200 students across 3 canteens
- Deployed on AWS ECS with GitHub Actions CI/CD and zero-downtime migrations
Log Search
- Wrote a Go service that indexes 2 GB of application logs per day into OpenSearch

SKILLS
Python, Go, FastAPI, Django, PostgreSQL, Redis, Docker, AWS, GitHub Actions, Linux

ACHIEVEMENTS
Winner, state-level hackathon 2024 (software edition), team of 6
"""),
    Sample("03_strong_ml.pdf", "cutoff", 3, "strong", "data/ML",
           "Python, PyTorch, SQL, pandas", """MEHUL DESAI
mehul.desai@example.com | +91 90000 33333 | github.com/example-mehul

SUMMARY
Final-year IT student focused on machine learning for medical images.

EXPERIENCE
Machine Learning Intern, Brightpath Imaging (May 2025 - July 2025)
- Trained a PyTorch U-Net that segments lung CT scans; Dice score improved from 0.78 to 0.86
- Wrote data pipelines in Python and pandas over 40,000 anonymised scans

PROJECTS
Crop Disease Classifier
- Fine-tuned an EfficientNet on 12,000 leaf images; 94% accuracy on a held-out test set
- Served the model with a small Flask endpoint for a demo app
Paper Reproduction
- Reproduced a contrastive-learning paper and published the code and results

SKILLS
Python, PyTorch, scikit-learn, pandas, NumPy, SQL, Jupyter, Flask

ACHIEVEMENTS
Second place, college data science competition 2024; workshop paper at a student ML conference
"""),
    Sample("04_average_backend.pdf", "cutoff", 3, "average", "backend",
           "Python, Flask, MySQL", """KARAN SETHI
karan.sethi@example.com | +91 90000 44444

SUMMARY
Third-year CSE student interested in web backends.

EXPERIENCE
Web Development Intern, Small Biz Solutions (June 2025 - July 2025)
- Added two REST endpoints to an existing Flask app for invoice listing

PROJECTS
Library Manager
- A Flask and MySQL app to issue and return library books, built for a course project
- Basic login with sessions; runs locally
Weather Bot
- A Python script that fetches weather from a public API and posts a daily message

SKILLS
Python, Flask, MySQL, HTML, Git

EDUCATION
B.Tech CSE, Riverbend Institute of Technology, CGPA 7.6
"""),
    Sample("05_average_frontend.pdf", "rejected", 4, "average", "frontend",
           "JavaScript, React, CSS", """SANA QUADRI
sana.quadri@example.com | +91 90000 55555 | github.com/example-sana

SUMMARY
Final-year IT student who enjoys building user interfaces.

PROJECTS
Portfolio Builder
- A React and Tailwind site generator with drag-and-drop sections
Movie Finder
- A React app that searches a public movie API, with favourites saved in local storage
College Fest Website
- Built the event pages for the annual fest with a team of 4

SKILLS
JavaScript, TypeScript, React, HTML, CSS, Tailwind, Figma

ACHIEVEMENTS
Best UI award, college hackathon 2024
"""),
    Sample("06_weak_backend.pdf", "rejected", 4, "weak", "backend",
           "Python, Java, SQL, Docker, AWS", """DEV KAPOOR
dev.kapoor@example.com | +91 90000 66666

OBJECTIVE
To get an internship in a reputed company.

PROJECTS
Calculator
- A command-line calculator in Python
Student Records
- A Java program that stores student marks in a text file (course assignment)

SKILLS
Python, Java, C, SQL, Docker, AWS, Kubernetes, Machine Learning

EDUCATION
B.Tech CSE, Riverbend Institute of Technology, CGPA 6.9
"""),
    Sample("07_weak_generic.pdf", "rejected", 5, "weak", "generic",
           "MS Office, Communication", """PRIYA NAIR
priya.nair@example.com | +91 90000 77777

CAREER OBJECTIVE
Hardworking and dedicated student seeking a challenging role to grow my skills.

EDUCATION
B.Tech ECE, Riverbend Institute of Technology, CGPA 7.1

SKILLS
MS Office, Communication, Teamwork, Leadership, Time management

ACHIEVEMENTS
Participated in the college cultural fest; volunteer at a blood donation camp
"""),
    Sample("08_very_weak.pdf", "rejected", 5, "very weak", "generic",
           "Computer basics", """ARJUN BALAN
arjun.balan@example.com

OBJECTIVE
Looking for a job.

EDUCATION
B.Sc, Riverbend Arts and Science College

HOBBIES
Cricket, music
"""),
)


def write_set(folder: Path) -> list[Path]:
    """Write the 8 PDFs, ``labels.csv`` and ``criteria.txt`` into ``folder``."""
    from engine.tests.fixtures import make_pdf

    folder.mkdir(parents=True, exist_ok=True)
    paths = [make_pdf(folder / s.file, [s.text]) for s in SAMPLES]
    with open(folder / "labels.csv", "w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["file", "expected_bucket", "expected_rank_group", "level", "role", "skills"])
        for s in SAMPLES:
            writer.writerow([s.file, s.expected_bucket, s.expected_rank_group, s.level, s.role, s.skills])
    (folder / "criteria.txt").write_text(CRITERIA + "\n", encoding="utf-8")
    return paths
