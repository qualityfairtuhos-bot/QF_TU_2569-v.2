# Implementation Plan: Final Round Evaluation Criteria & Separate Round Management

Add Final Round evaluation criteria for Service-CQI-Primary (7 criteria, 100 points) and Research-Innovation (8 criteria, 100 points), provide Admin tools to assign original reviewers to qualified Final Round works, and deliver separate round management in the Reviewer Portal with previous round feedback inspection.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were clarified and confirmed with the user in Phase 1:
> - **Eligible Works for Final Round**: Targeted specifically for works that passed or were accepted for presentation (`ACCEPTED_ORAL`, `ACCEPTED_POSTER`, `PASS`).
> - **Assigning Original Reviewers**: Admin can assign the same reviewer panel both per-work (in the assignment modal) and via batch action for multiple qualified works at once.
> - **Reviewer Portal Round Separation**: Reviewer sees two independent rounds (Initial Review vs. Final Round) with distinct cards, progress, and rubrics. Scores between rounds are strictly separate (never combined).
> - **Historical Score & Feedback Visibility**: In the Final Round form, reviewers have a dedicated summary card showing the initial round score, decision, and comments to author, with a toggle to inspect itemized sub-criteria.

---

## 1. Overview & Core Concept

This feature enhances the TUH Quality Fair conference management system by introducing official **Final Round (รอบตัดสิน)** evaluation workflows:
- **Seed & Manage Rubrics**: Introduces official 100-point rubrics for Round 2 customized for Service Excellence / CQI / Primary Care (7 items) and Research / Innovation (8 items).
- **Admin Workflow**: Allows academic admins to quickly assign original reviewers to Final Round works individually or in bulk for all qualified presentations.
- **Reviewer Experience**: Provides a clean segmented view separating "รอบประเมินผลงาน" and "รอบตัดสิน" with zero score contamination, plus convenient reference to original reviewer comments while scoring live presentations.

---

## 2. User Experience & Visual Design

### Key User Flows

```
[Admin Portal]
  │
  ├─► Select Works / Filter "ผ่านการคัดเลือก (Oral/Poster)"
  │     └─► Click "⚡ มอบหมายกรรมการชุดเดิมเข้ารอบตัดสิน" (Single or Bulk)
  │           └─► System creates Round 2 assignments for original reviewer panel
  │
[Reviewer Portal]
  │
  ├─► Top Round Selector: [📋 รอบประเมินผลงาน (3)] | [🏆 รอบตัดสิน (2)]
  │     └─► Independent KPI counters, progress bars, and assignment lists
  │
  └─► Open Final Round Assignment:
        ├─► Top Hero: Presentation details & PDF attachments
        ├─► Historical Feedback Card: Initial round score, decision, & author comments
        │     └─► Button: "👁️ แสดงรายละเอียดคะแนนเกณฑ์เดิม" (Collapsible table)
        └─► Final Round Rubric Form:
              ├─► Category-specific 100-point criteria (7 or 8 items with step 0.5 inputs)
              ├─► Overall decision (PASS / REVISION / REJECT) & Recommendation
              └─► Save Draft vs. Confirm Submit
```

### Visual Identity & Styling
- **Color Discipline**: TUH Navy (`#0C385B`) and Medical Teal (`#006D70`) as primary surfaces, amber gold (`#D97706`) for Final Round trophies/badges, and soft slate neutral canvas (`#EEF4F5` / `#F8FAFC`).
- **Typography & Numbers**: Clean tabular numerals (`tabular-nums`) for scores, clean unboxed metadata with bullet separators (`·`), and crisp hierarchy for Thai medical academic terms.
- **No Score Aggregation**: Both rounds display their own independent `X / 100` scorecards and certificates without mathematical blending.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Round-Specific Criteria Isolation**
  - *Approach*: Scoring criteria are explicitly tagged with `ReviewRoundID` (`RR-2026-000001` vs `RR-2026-000002`) and `CategoryID`. When fetching criteria for a work in Round 2, the system strictly matches the Round 2 rubric for that category.
  - *Why*: Ensures reviewers in Round 2 never see Round 1 criteria or vice versa, maintaining strict 100-point integrity.

- **Decision 2: Original Reviewer Panel Duplication**
  - *Approach*: System reads all active, confirmed assignments for a work in Round 1 and generates matching assignments in Round 2 under `ReviewRoundID: RR-2026-000002`.
  - *Why*: Enables seamless transition to the final committee without manual re-entry, while keeping each round's assignment record, score sheet, and status completely decoupled.

- **Decision 3: Independent Reviewer Dashboard Tabs**
  - *Approach*: Reviewer portal partitions `BOOT.assignments` by `RoundNo` / `ReviewRoundID`. Tab controls allow instant switching without page reloads.
  - *Why*: Reviewers can immediately distinguish between preliminary online paper reviews and final live oral/poster judging.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Database & Schema                             │
├────────────────────────────────────────────────────────────────────────┤
│  ReviewRounds:                                                         │
│    RR-1: รอบประเมินผลงาน (RoundNo: 1, Status: OPEN)                   │
│    RR-2: รอบตัดสินผลงาน (RoundNo: 2, Status: OPEN)                     │
│                                                                        │
│  ScoringCriteria (Round 2 Seed):                                       │
│    - SERVICE_CQI_PRIMARY (7 criteria, 100 pts)                         │
│    - RESEARCH_INNOVATION (8 criteria, 100 pts)                         │
│                                                                        │
│  ReviewAssignments:                                                    │
│    - Assignment 1 (Round 1) ──► TotalScore: 85 (Round 1 only)          │
│    - Assignment 2 (Round 2) ──► TotalScore: 92 (Round 2 only)          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
            ┌───────────────────────┴───────────────────────┐
            ▼                                               ▼
┌───────────────────────────────┐   ┌───────────────────────────────────┐
│     Admin Portal Actions      │   │      Reviewer Portal Actions      │
├───────────────────────────────┤   ├───────────────────────────────────┤
│ • adminAssignReviewersBulk    │   │ • reviewerBootstrap               │
│ • adminAssignOriginalReviewers│   │   └─ Returns partitioned rounds   │
│   (Bulk & Single per work)    │   │ • reviewerGetAssignment           │
│ • adminGetWorkScoreSummary    │   │   └─ Returns Round 2 criteria     │
│   (Optionally grouped by rd)  │   │      + previousRoundEvaluation    │
└───────────────────────────────┘   └───────────────────────────────────┘
```

### Key Implementation Steps
1. **Database Seeding (`gas/Code.gs` & `code.gs.txt`)**:
   - Add seed entries in `ScoringCriteria` for Round 2 (`RR-2026-000002`):
     - 7 items for `SERVICE_CQI_PRIMARY` (10, 10, 25, 20, 20, 5, 10 = 100 pts).
     - 8 items for `RESEARCH_INNOVATION` (5, 15, 10, 20, 15, 15, 10, 10 = 100 pts).
   - Ensure `ReviewRounds` has `RR-2026-000002` (รอบตัดสินผลงาน) in `OPEN` status.
2. **Backend API Actions**:
   - `adminAssignOriginalReviewers`: Endpoint taking work IDs (single or multiple) and creating Round 2 assignments from Round 1 reviewers.
   - Enhance `reviewerGetAssignment`: When `a.ReviewRoundID` is Round 2, fetch Round 1 assignment summaries (score, decision, recommendation, criteria comments) and return as `previousRoundEvaluation`.
3. **Admin UI Updates (`admin.html.txt`)**:
   - Single Assignment Modal: Add button "⚡ ดึงกรรมการชุดเดิมจากรอบแรก" when Round 2 is selected.
   - Batch Toolbar: Add action "🏆 มอบหมายกรรมการรอบตัดสิน (ดึงกรรมการชุดเดิม)" for selected/filtered accepted works.
4. **Reviewer UI Updates (`reviewer.html.txt`)**:
   - Add segmented round tabs at the top of the assignments view: "📋 รอบประเมินผลงาน" vs "🏆 รอบตัดสิน".
   - Isolate metrics, progress bars, and lists so each round is evaluated independently.
   - In Round 2 evaluation view, render historical evaluation card with original scores and feedback.
5. **Build & Verify**:
   - Run `node tools/prepare-legacy.mjs`, linting, tests, and compilation checks.
