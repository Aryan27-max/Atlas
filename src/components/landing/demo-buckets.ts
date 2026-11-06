// The grouping rules from the Atlas engine (engine/buckets.py in the main
// repository), reduced to what the landing-page demo needs. Same rules:
//
//   score ≥ shortlist                → Shortlisted
//   band ≤ score < shortlist         → Cutoff
//   score < band                     → Rejected
//   fewer shortlisted than minimum   → fill by rank, label them, never split a tie

export type Group = "shortlisted" | "cutoff" | "rejected";

export type DemoPlacement = { id: number; score: number; group: Group; filled: boolean };

export type DemoResult = {
  placements: DemoPlacement[];
  counts: Record<Group, number>;
  /** Shortlisted only because of the minimum. */
  filled: number;
  /** Shortlisted beyond the minimum because of a tie at the boundary. */
  tieExtra: number;
  /** The score the fill stopped at, when filling happened. */
  fillFloor: number | null;
};

export type DemoCutoffs = { shortlist: number; band: number; minimum: number };

export function placeStudents(students: readonly { id: number; score: number }[], cutoffs: DemoCutoffs): DemoResult {
  const shortlist = clamp(cutoffs.shortlist, 0, 100);
  const band = clamp(Math.min(cutoffs.band, shortlist), 0, 100);
  const minimum = Math.max(0, Math.floor(cutoffs.minimum));

  const ordered = [...students].sort((a, b) => b.score - a.score || a.id - b.id);
  const cleared = ordered.filter((s) => s.score >= shortlist).length;

  let fillFloor: number | null = null;
  let tieExtra = 0;
  if (minimum > cleared && ordered.length > 0) {
    if (ordered.length <= minimum) {
      fillFloor = ordered[ordered.length - 1]!.score;
    } else {
      fillFloor = ordered[minimum - 1]!.score;
      const reached = ordered.filter((s) => s.score >= fillFloor!).length;
      tieExtra = reached - minimum;
    }
  }

  const counts: Record<Group, number> = { shortlisted: 0, cutoff: 0, rejected: 0 };
  let filled = 0;
  const placements = ordered.map((s): DemoPlacement => {
    let group: Group;
    let isFilled = false;
    if (s.score >= shortlist) group = "shortlisted";
    else if (fillFloor !== null && s.score >= fillFloor) {
      group = "shortlisted";
      isFilled = true;
      filled += 1;
    } else if (s.score >= band) group = "cutoff";
    else group = "rejected";
    counts[group] += 1;
    return { id: s.id, score: s.score, group, filled: isFilled };
  });

  return { placements, counts, filled, tieExtra, fillFloor };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

/** 42 fictional students. Two ties (72 and 64) show how the minimum treats them. */
export const DEMO_SCORES: readonly number[] = [
  94, 91, 89, 88, 86, 85, 83, 82, 81, 79, 78, 77, 76, 75, 74, 73, 72, 72, 71, 70, 69, 68, 66, 65, 64, 64, 63, 62,
  60, 59, 58, 57, 55, 54, 52, 50, 48, 45, 43, 40, 36, 31,
];

export const DEMO_STUDENTS = DEMO_SCORES.map((score, id) => ({ id, score }));
