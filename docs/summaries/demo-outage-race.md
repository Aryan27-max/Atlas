# The demo flake: a student failed during an outage (rule 5)

The demo (`e2e/demo.spec.ts`) sometimes ended with 4 students needing attention instead of 3. That would be a rule-5 violation: a system outage blamed on a student. It was. This is how it was found, and the fix.

## Reproducing it
- **Loops:** a loop script ran the demo (after `cutoffs.spec`, as in the full suite), each run with its own kept data folder. It kept the engine log and database of any run that ended with a failure count other than 3. About 33 loop runs before the fix, plus the earlier full suites:
  - **Normal runs:** the outage paused the run and nobody was failed.
  - **One run (quiet-11)** failed student **#3 (fictional, RA2599000003)** as **retryable: "The download timed out."** The same thing had happened in 2 of 7 full-suite runs earlier in the day.
- **Timeline of quiet-11**, from `engine.log` and the run's events:

  | Time | Event |
  |---|---|
  | 34.690 | candidate 3: downloading |
  | 34.696 | candidate 3: connection error, "probe ok, so it's this candidate" |
  | 34.698 | candidate 3: failed (retryable): The download timed out. |
  | 34.698 | candidate 4: downloading |
  | 38.787 | run paused: No internet connection |
  | 39.828 | resumed; candidate 4 downloads normally |

  The download broke at the very start of the simulated outage. The probe 2 ms later still said "online", so the student was blamed. Only the next student's failure paused the run.

## Why the probe said "online"
- **The stub goes offline in two steps:** `shutdown()` stops answering, then `server_close()` closes the socket. In between, TCP connections still open, but nothing answers HTTP.
- **The probe's rule:** it opens a TCP connection (it worked) and then GETs the check URL (it failed). By design, "TCP connects but the check URL is unreachable" means a firewall that blocks only the check, so the probe says "online".
- **Real networks show the same state** for a moment while Wi-Fi drops, a VPN reconnects, or a proxy stops answering.

## Proving it in the app
For the proof, the stub was temporarily changed (not committed): it kept accepting connections and dropping them without an answer for 1.5 s, then closed. Same demo, 3 runs each:

| | Students failed | What happened |
|---|---|---|
| **Before the fix** | **18** in every run | 15 healthy students failed as "The download timed out." in about 0.6 s, one after another ("probe ok, so it's this candidate"). The private-link and missing-file students got the timeout instead of their real reason. |
| **After the fix** | **3** in every run (the broken links) | "candidate 3: connection error; the probe looked fine, then 5.0 s later: No internet connection (not the student's fault)", then pause, resume, and candidate 3 downloads normally. |

After the fix, 20 more ordinary loop runs all ended with exactly 3. Runs with every core busy were not counted, because the e2e harness itself timed out at that load.

## The fix (`engine/worker.py`)
- **Two healthy answers before blaming a student.** When a download or a chat fails with a transient error and the probe says the system is healthy, the worker asks again after `recheck_delay`: 5 s, the same rhythm as the auto-resume poll. Only two healthy answers fail the student as retryable. Otherwise the student goes back to the queue and the run pauses.
- **The student is never downloaded again during the check.** That would hide the problem.
- **The fetch thread waits during the check,** so a half-down network can't fail a queue of students in a second.
- **The cost** is 5 s, only when a student's own link really fails. That's rare, and those failures already wait for timeouts of up to 30 s.
- **The log now says which happened**, so a real screening can be diagnosed the same way.
- **Limit:** a network that stays half-down (TCP connects, nothing answers) for longer than 5 s still looks online. That comes from the probe's firewall rule, which is unchanged.

## Tests
- `test_an_outage_that_is_just_starting_pauses_instead_of_failing_the_student`: the probe says "fine" at the first look and "No internet connection" at the second. The run pauses, nobody fails, the student is back in the queue, the log says so, and after reconnecting all 12 are scored. Before the fix: `'failed' unexpectedly found`.
- `test_a_student_is_blamed_only_when_the_probe_is_healthy_twice`: the probe is asked twice before a student is failed.
- The demo stays strict: it compares the three failure reasons, not just a count.

## The slow demo runs (a separate thing, not a bug)
Some demo runs took about 55 s instead of 35 s. Their traces show nearly every click taking about 2.0 s. Playwright waits for two animation frames before clicking, and Chromium throttles frames to about one per second when the window is covered or in the background. These runs happened whether or not the race did.
