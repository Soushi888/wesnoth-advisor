# After-action report template

The second of the two workflows. **Planning** happens before a scenario and produces `Briefings/NN-name.md`. **Reporting** happens after it and produces `Reports/NN-name.md`.

Start every report by running the measurement, so the commentary sits on top of facts rather than memory:

```bash
bun run report "<scenario name>"     # losses, level ups, experience, arrivals, item movement
bun run roster                       # the standing count across the whole run
```

Two standing rules, the same as for briefings. **Player voice**: no file paths, no macro names. **Every number measured**: the numbers come out of the diff, and anything the diff cannot see is named as unmeasured rather than estimated.

One honest limit to carry into every report: the diff compares scenario-start saves, so a unit recruited and killed inside the same scenario is invisible, and an item that left the bag may have been equipped rather than lost. Check the roster before calling something a loss.

---

# NN Scenario Name, after action

*One line: the result, the turn it ended on, and what it cost in one clause.*

## What happened

*Four or five sentences of narrative. Not a turn log. The shape of the scenario as it actually played: where the plan held, where it bent, and the moment the outcome was decided.*

## The numbers

*A table straight from `bun run report`: carryover in and out, roster before and after, lost, joined, levelled. Then the standing campaign count from `bun run roster`.*

## What went well

*Bulleted, and each item names the decision, not the outcome. "The truce phase was used fully" is a decision. "We won" is not. Say what to repeat.*

## What went badly

*Same discipline, and be specific about cost. Name the units lost and what they were carrying. A bullet here should be actionable next time, otherwise it is just regret.*

## Where the briefing was wrong

*The section that makes this worth writing. Go back to `Briefings/NN-name.md` and check every prediction against what happened. Which numbers were right, which were wrong, and which advice would have lost the scenario if followed. Silence here means the check was not done.*

## What it cost

*Casualties by name, level and equipment carried. Items gained and lost. Whether the trade was worth it, stated plainly.*

## What carries forward

*The roster and treasury going into the next scenario, and the two or three units now worth protecting. Anything that changes standing doctrine goes here with a pointer to the rule it produced.*

## Rules this produced

*New entries added to `DOCTRINE.md` because of this scenario, one line each. Empty is a legitimate answer.*
