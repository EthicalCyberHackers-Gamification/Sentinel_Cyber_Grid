# Mission Engine Guide

_Last updated: Milestone 23D — 28 May 2026_

---

## Purpose

The **mission engine** lets new cybersecurity training missions be added to the
Ethical CyberHackers Platform by writing **structured mission data objects**
instead of hardcoding mission-specific logic into the app.

Before the engine existed, every mission required hand-written renderers,
event handlers, terminal logic, quiz handlers, scorecard markup, and reset
plumbing. After the engine, authoring a new mission is mostly a matter of:

1. Filling in a mission data object that follows the template,
2. Validating it,
3. Registering it,
4. Wiring it into the engine's per-mission dispatchers (until the engine
   becomes fully table-driven in a later phase).

The engine itself is **frontend-only**. There is no backend, no database, no
authentication, no AI. All state lives in memory and in `localStorage` under
the key `ech.progress.v1`.

---

## Where things live

| File                                  | What it owns                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| `missions.js`                         | Mission data, `MISSION_TEMPLATE`, `MISSIONS_REGISTRY`, helpers, validation         |
| `script.js`                           | Engine dispatchers (`window.MissionEngine`), per-mission renderers, state, save    |
| `index.html`                          | Static DOM the engine renders into                                                 |
| `style.css`                           | Visual chrome shared by all missions (`.completion-screen`, `.scorecard`, …)       |
| `docs/MISSION_ENGINE_GUIDE.md`        | This file                                                                          |

---

## Mission Object Structure

Every mission is a plain JavaScript object. The canonical shape is defined in
`MISSION_TEMPLATE` (see `missions.js`). Each field's purpose:

### Identity

| Field         | Type     | Required | Description                                                                |
| ------------- | -------- | -------- | -------------------------------------------------------------------------- |
| `missionId`   | `string` | ✓        | Stable unique id used by `loadMission()` and the registry. e.g. `"mission-003"` |
| `title`       | `string` | ✓        | Human-readable mission name shown in headings and the Course Progress card |

### Story / Framing

| Field               | Type       | Required | Description                                                                              |
| ------------------- | ---------- | -------- | ---------------------------------------------------------------------------------------- |
| `roleContext`       | `string`   |          | One-sentence in-world role the student is playing this mission                           |
| `briefing`          | `string`   | ✓        | 1–3 sentence mission briefing shown on the overview screen                               |
| `learningObjective` | `string`   |          | Single-sentence pedagogical goal — "by the end of this mission you will…"                |
| `skillsPracticed`   | `string[]` |          | Bulleted list of skills practiced (rendered in the SKILLS PRACTICED section of scorecard)|

### Lifecycle

| Field            | Type     | Required | Description                                                          |
| ---------------- | -------- | -------- | -------------------------------------------------------------------- |
| `startingStatus` | `string` |          | Status-checklist label that ticks as soon as the student begins      |

### Interaction

| Field                | Type             | Required | Description                                                                            |
| -------------------- | ---------------- | -------- | -------------------------------------------------------------------------------------- |
| `commands`           | `array \| object`| ✓        | Command buttons the student can click — array (M1 shape) or keyed object (M2 shape)    |
| `commandUnlockRules` | `object[]`       |          | Declarative `{ key, unlockedAtStart, unlocksAfterRun }` array used by the engine       |
| `hints`              | `object`         |          | `{ triggerKey → "hint text" }` map; engine forwards to `updateHintPanel()`             |
| `managerMessages`    | `object`         |          | `{ triggerKey → "message text" }` map; engine forwards to `updateManagerMessage()`     |

### Assessment

| Field             | Type             | Required | Description                                                                                |
| ----------------- | ---------------- | -------- | ------------------------------------------------------------------------------------------ |
| `findingQuestion` | `object \| null` |          | The "what did you find?" submission step. `{ question, answers[], correctMsg, wrongMsg }`  |
| `quiz`            | `object \| null` |          | Multiple-choice quiz. `{ question, answers[], correctFeedback, incorrectFeedback }`        |
| `reflection`      | `object \| null` |          | Optional reflection question shown after the quiz. Set to `null` to skip (Mission 2 does)  |

### Rewards

| Field      | Type     | Required | Description                                                |
| ---------- | -------- | -------- | ---------------------------------------------------------- |
| `xpReward` | `number` | ✓        | XP awarded when the mission is completed                   |
| `newRank`  | `string` |          | New rank string awarded on completion (e.g. `"Cyber Intern Level 3"`) |

### Completion screen

| Field                | Type     | Required | Description                                                                                  |
| -------------------- | -------- | -------- | -------------------------------------------------------------------------------------------- |
| `scorecard`          | `object` |          | `{ missionLabel, threatIdentified, whatYouLearned, certSkills[] }` shown on completion       |
| `nextMissionPreview` | `object` |          | `{ title, description }` teaser shown on the completion screen for the next mission          |

> **Required-field rule:** `validateMissionData(mission)` enforces exactly five
> required fields: `missionId`, `title`, `briefing`, `commands`, `xpReward`.
> Everything else is recommended but falls back to a safe default when omitted —
> as long as the mission was built through `createMissionFromTemplate()`.

---

## Command Structure

Each individual command (whether stored in an array or an object) should
include the following fields. The exact key names follow the engine's
convention; the M1 (`COMMAND_BUTTONS`) and M2 (`M2_COMMANDS`) implementations
use slightly different field names internally — both are supported.

| Field                  | Type       | Description                                                                            |
| ---------------------- | ---------- | -------------------------------------------------------------------------------------- |
| `commandId`            | `string`   | Stable id used by `handleCommandClick(id)` and unlock rules (M1: `key`, M2: object key) |
| `label`                | `string`   | Button text shown to the student (e.g. `"Where am I?"`, `"Scan host"`)                 |
| `commandText`          | `string`   | The literal command string printed in the terminal (e.g. `"nmap 10.0.0.5"`)            |
| `outputText`           | `string \| string[]` | The output line(s) printed below the command line in the terminal               |
| `unlocks`              | `string[]` | Other `commandId`s revealed when THIS command is clicked                               |
| `statusUpdate`         | `string`   | Status-checklist entry id to mark complete (e.g. `"ip-addr"`, `"step-cat"`)            |
| `hintUpdate`           | `string`   | New hint-panel text to show after this command runs                                    |
| `managerMessageUpdate` | `string`   | New supervisor / manager message to show after this command runs                       |

> The legacy Mission 1 schema (`COMMAND_BUTTONS`) names these fields
> `key / label / command / desc / unlocksAfterRun` and uses `MISSION_STEPS`
> for the status-checklist mapping. The legacy Mission 2 schema
> (`M2_COMMANDS`) uses `cmd / output / nextHint / unlocks / managerMsg`.
> New missions should follow the table above; the engine will adapt.

---

## Adding a New Mission

Step-by-step recipe for authoring `mission-003` (or any future mission):

### 1. Copy the mission template

```js
import {
  MISSION_TEMPLATE,
  createMissionFromTemplate,
  validateMissionData,
} from "./missions.js";

const draft = { ...MISSION_TEMPLATE };
```

### 2. Create a new `missionId`

Use the `mission-NNN` convention so the id sorts correctly:

```js
draft.missionId = "mission-003";
```

### 3. Add the briefing and learning objective

```js
draft.title             = "Reconnaissance & Discovery";
draft.roleContext       = "You are a junior analyst doing pre-engagement recon on a public-facing host.";
draft.briefing          = "Use passive and active recon techniques to map the target's exposed surface before any exploitation.";
draft.learningObjective = "Practice gathering target information without aggressive scanning.";
draft.skillsPracticed   = ["whois lookups", "DNS enumeration", "Subdomain discovery", "Banner grabbing"];
draft.startingStatus    = "Mission 3 Started";
```

### 4. Add the commands

```js
draft.commands = [
  {
    commandId:            "whois",
    label:                "Run whois",
    commandText:          "whois target.example.com",
    outputText:           ["Registrar: …", "Created: …"],
    unlocks:              ["dns"],
    statusUpdate:         "whois-done",
    hintUpdate:           "Now enumerate DNS records.",
    managerMessageUpdate: "Good start — pull the DNS records next.",
  },
  // … more commands
];
```

### 5. Add unlock rules

```js
draft.commandUnlockRules = [
  { key: "whois", unlockedAtStart: true,  unlocksAfterRun: ["dns"] },
  { key: "dns",   unlockedAtStart: false, unlocksAfterRun: ["subs"] },
  { key: "subs",  unlockedAtStart: false, unlocksAfterRun: [] },
];
```

### 6. Add the quiz

```js
draft.quiz = {
  question: "Which of the following is PASSIVE reconnaissance?",
  answers: [
    { id: "A", text: "Port scanning the target",                   correct: false },
    { id: "B", text: "Looking up whois records",                   correct: true  },
    { id: "C", text: "Brute-forcing the login form",               correct: false },
    { id: "D", text: "Exploiting a vulnerable service",            correct: false },
  ],
  correctFeedback:   "Correct. Whois is public registry data — no packets touch the target.",
  incorrectFeedback: "Not quite. Passive recon does not send traffic to the target.",
  xpReward: 150,
  newRank:  "Cyber Intern Level 3",
};
```

### 7. Add the scorecard and next-mission preview

```js
draft.xpReward = 150;
draft.newRank  = "Cyber Intern Level 3";

draft.scorecard = {
  missionLabel:     "Reconnaissance & Discovery",
  threatIdentified: "Externally-exposed subdomains and stale DNS records",
  whatYouLearned:   "You learned how analysts build a picture of a target using public data sources before any active scanning.",
  certSkills: [
    "Public-source intelligence",
    "DNS enumeration",
    "Banner interpretation",
    "Responsible disclosure mindset",
  ],
};

draft.nextMissionPreview = {
  title:       "Vulnerability Assessment",
  description: "Move from mapping the target to identifying exploitable weaknesses.",
};
```

### 8. Validate the mission data

```js
const mission3 = createMissionFromTemplate(draft);
const { valid, missing } = validateMissionData(mission3);

if (!valid) {
  console.warn("Mission 3 is missing:", missing);
}
```

Then register it:

```js
MISSIONS_REGISTRY["mission-003"] = mission3;
```

And add a `"mission-003"` branch to each engine dispatcher in `script.js`
(`renderMissionBriefing`, `renderCommandButtons`, `handleCommandClick`, etc.)
— until the engine becomes fully table-driven.

### 9. Test the mission from start to finish

Use the testing checklist below.

---

## Testing Checklist

Before merging a new mission, manually verify every item:

- [ ] **Mission loads** — `loadMission("mission-NNN")` switches the engine without errors
- [ ] **Commands appear** — every unlocked-at-start command is visible and clickable on the dashboard
- [ ] **Terminal output displays** — clicking a command prints both the command line and its `outputText`
- [ ] **Hints update** — each command's `hintUpdate` text appears in the hint panel after the click
- [ ] **Manager messages update** — each command's `managerMessageUpdate` appears in the supervisor panel
- [ ] **Unlock chain works** — clicking a command reveals its declared `unlocks` entries (nothing more, nothing less)
- [ ] **Status checklist advances** — each `statusUpdate` ticks the matching entry in the Mission Status panel
- [ ] **Finding submission appears** (if used) and accepts the correct answer
- [ ] **Quiz appears** at the end of the command chain
- [ ] **XP awards correctly** — the XP bar animates by exactly `quiz.xpReward` (or mission `xpReward`)
- [ ] **Rank updates** — the rank pill shows the new rank if one was set
- [ ] **Scorecard appears** — all sections render: header, MISSION SCORECARD, SKILLS PRACTICED, WHAT YOU LEARNED, NEXT MISSION PREVIEW, Certificate of Completion Preview
- [ ] **Restart works** — `Restart Mission` resets ONLY the current mission and does not touch others
- [ ] **Local progress save still works** — after completion, hard-reloading the page restores XP, rank, and mission-complete state from `localStorage`
- [ ] **Course Progress card** shows the new mission as Completed and any subsequent mission as Locked/Unlocked appropriately
- [ ] **No JavaScript errors** in the browser console during the full playthrough

---

## Current Missions

| #   | `missionId`    | Title                          | XP   | Rank on completion          |
| --- | -------------- | ------------------------------ | ---- | --------------------------- |
| 1   | `mission-001`  | New Cybersecurity Intern       | +100 | Cyber Intern Level 1        |
| 2   | `mission-002`  | Network Basics                 | +100 | Cyber Intern Level 2        |

### Mission 1 — New Cybersecurity Intern

The student inspects a workstation flagged for suspicious activity. They use
basic Linux-style command buttons (`pwd`, `ls`, `cd`, `cat`) to navigate the
file system, discover `suspicious_file.txt`, submit a finding identifying a
phishing attempt, pass a multiple-choice quiz, answer a reflection, and earn
the **Cyber Intern Level 1** rank.

Source: `COMMAND_BUTTONS`, `MISSION_STEPS`, `FINDING`, `QUIZ`, `REFLECTION`,
`MANAGER_MESSAGES`, `HINTS`, `MISSION_1` in `missions.js`.

### Mission 2 — Network Basics

The student runs a short network-reconnaissance sequence (`ip addr` → `ping` →
`nmap` → `review`) against a simulated host, completes an Analyst Review
multiple-choice question, then passes a final assessment quiz to earn the
**Cyber Intern Level 2** rank.

Source: `M2_COMMANDS`, `M2_STATUS`, `M2_ANALYST_REVIEW`, `M2_QUIZ`,
`M2_SCORECARD`, `MISSION_2` in `missions.js`.

---

## Quick reference — the `window.MissionEngine` API

For console debugging and future modules. All functions live on
`window.MissionEngine` (set up in `script.js`):

```text
loadMission(missionId)              switch the active mission
getActiveMission()                  return the structured mission data
renderMissionBriefing()             show the overview screen
renderCommandButtons()              re-render the command panel
handleCommandClick(commandId)       execute a single command by id
appendTerminalOutput(cmd, out)      write to the active mission's terminal
updateMissionStatus(statusId)       tick a status-checklist entry
updateHintPanel(text)               set the hint-panel text
updateManagerMessage(text)          set the supervisor-panel text
unlockCommand(commandId)            reveal a previously hidden command
showFindingSubmission()             reveal the finding step
showQuiz()                          reveal the multiple-choice quiz
showReflection()                    reveal the reflection question (M1 only)
awardXP(amount)                     animate the XP bar
completeMission(newRank?)           finalize the active mission
showScorecard()                     render the completion screen
resetMission(missionId?)            reset a specific mission (defaults to active)

MISSION_TEMPLATE                    canonical empty mission shape
createMissionFromTemplate(custom)   merge partial data onto the template
validateMissionData(mission)        check required fields → { valid, missing }
```

---

## Phase A scope reminder

Phase A (Milestones 23A–23D) intentionally stopped at the **foundation**:
the engine, the registry, the template, the validation helpers, and this
guide. Phase B will turn the engine fully table-driven so future missions
no longer need new `"mission-003"` branches inside dispatcher functions.

Until then: when adding a new mission, also add its dispatch branches
alongside the M1 and M2 ones in `script.js`.
