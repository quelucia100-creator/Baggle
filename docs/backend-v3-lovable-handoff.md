# Lovable V3 database handoff

Extend the existing capability RPCs. Keep the same SQL function signatures and regenerate types in the Lovable workflow.

| RPC                                    | V3 changes                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| party_plan read                        | Return schemaVersion 3, canonical config, caller-only selfPreferences, the existing lifecycle fields, and allowlisted V3 plan metadata. Keep legacy parties at schemaVersion 2 (unversioned legacy reads are also accepted during rollout).                                                                                                                |
| party_plan configure                   | Accept the canonical object directly as p_payload, including version. Host-only while collecting. Normalize dates in Montreal, lock party row, increment revision and mark legacy or invalidated submissions unsubmitted. Reject unsupported shapes before any write.                                                                                      |
| party_plan save                        | Accept p_payload with preferences (the canonical object below) and expectedRevision (the nonnegative integer from the previous read). Validate revision and current host config under the party row lock. Save only to the capability holder's member row. Require all candidate days confirmed before setting submitted. Make identical saves idempotent. |
| party_plan begin_lock                  | Keep acquired and lease fields. Capture config, lease revision and the full set of eligible submitted members, including the host, under the existing row lock. Require a submitted host and at least two active submitted participants including that host. Reject mixed or stale schemas.                                                                |
| party_plan_snapshot                    | Service-only. Return {schemaVersion:3,revision,config,members:[{id,preferences}]}. Check the existing lease, expiry, status and revision.                                                                                                                                                                                                                  |
| party_plan_complete                    | Service-only; keep existing parameters. Derive version/revision from the active lease. Store at most 20 projected options; SQL must explicitly allowlist nested metadata and force constant compromise. A stale lease cannot publish or reset a later job.                                                                                                 |
| vote / host_reroll / finalize / reopen | Preserve roles, per-revision votes, frozen options and three group rerolls. For V3 lock/vote/host_reroll/finalize/reopen require p_payload.schemaVersion equal to 3 and reject the V3 envelope against V2 state. Require V3 finalize revision. Reopen invalidates old options, lease and votes while retaining still-valid private answers.                |

Store V3 host and member documents additively in private JSONB columns, with explicit versions, bounded arrays, numeric and nested validation. Direct guest RPC calls need the same validation as the server. No new public table grants, views or Realtime publication. Keep capabilities hashed under existing guest identity. Check active membership for every action. Preserve safe legacy fields during rollout and invalidate legacy plans before treating the party as V3. V2 answers require resubmission. For precise ephemeral origins, honor consent represented by the explicit submitting choice, clear coordinates and invalidate readiness after one hour, and purge snapshots at completion, expiry, reopen or deletion. Establish scheduled cleanup and verify with isolated staging. Rollback disables V3 writes and invalidates V3 plans before removing private additive fields.

Example configure payload (illustrative date, server validates against its clock):

```json
{
  "version": 3,
  "dateSelection": {
    "mode": "future_dates",
    "selectionStyle": "single",
    "candidateDates": ["2026-11-23"],
    "range": null
  },
  "duration": { "mode": "fixed", "minMinutes": 60, "maxMinutes": 60 },
  "area": { "mode": "optimize_for_group", "label": null, "point": null, "isStrict": false },
  "travelArrangement": { "mode": "independent", "sharedMeetingPoint": null, "sharedMode": null },
  "rules": {
    "under18Friendly": false,
    "freeOnly": false,
    "alcoholPolicy": "allow",
    "requiredAccessibility": [],
    "dietaryHardRequirements": []
  }
}
```

Example preferences object for the V3 save envelope:

```json
{
  "version": 3,
  "vibes": ["chill_cozy"],
  "likedActivities": ["arts_culture"],
  "excludedActivities": [],
  "budget": {
    "currency": "CAD",
    "preferredMinCad": 0,
    "preferredMaxCad": 20,
    "hardMaxCad": 25,
    "explicitlyUnlimited": false
  },
  "availability": {
    "mode": "calendar",
    "tonight": null,
    "days": [
      {
        "date": "2026-11-23",
        "confirmed": true,
        "busyIntervals": [{ "startAt": "2026-11-23T20:00:00Z", "endAt": "2026-11-23T21:30:00Z" }]
      }
    ]
  },
  "origin": {
    "source": "manual",
    "label": "Montreal",
    "lat": 45.51,
    "lng": -73.57,
    "accuracy": "approximate"
  },
  "travel": {
    "mode": "walk",
    "maxOneWayMinutes": 30,
    "returnMode": null,
    "alreadyAtSharedMeetingPoint": false
  },
  "accessibilityHardRequirements": [],
  "dietaryHardRequirements": [],
  "optionalNote": null
}
```

Keep the existing shared option fields and add `version`, `date`, `durationMinutes`, `timeZone`, `routeVerifiability`, `warnings`, and inside `venue` add `address`, `source`, `sourceTimestamp`, `attribution`, `cost`, `bookingRequired`, `bookingUrl`, and `accessibilityVerified`. Use the allowlist in the V3 backend schema as the projection contract. The plan date is the actual Montreal date of startAt, including a following-day overnight start. Origins, directions, constraints, member scores and provider errors are private. The current app has no SQL acceptance test evidence for this V3 contract.

The existing `reopen` behavior applies to `no_plan` for both versions. Locked and final V2 plans stay in the explicitly versioned legacy view. For V3, create a new collecting room or reopen a legacy no-plan result and configure V3. New collecting rooms also bootstrap through V3 configure, and every participant must resubmit. Retained previous answers may appear only to the owner as drafts after configuration changes, with readiness invalidated until reconfirmed.

V3 frontend calls can use `updatePartyPlanningV3` from `src/lib/planning.functions.ts`. This alias targets the same POST endpoint. Send `schemaVersion: 3` on each action and handle `schemaVersion: 2` on initial reads. V3 configure and save carry the canonical config or preferences inside the server function request. V3 save takes the revision the form was based on, and V3 finalize takes the displayed option revision. Both use the browser field `revision`. Import the public types from `@/lib/planning-v3/contract`. When displaying weather, credit Open-Meteo, link to its license, and label the displayed weather as a slot summary. [Open-Meteo license](https://open-meteo.com/en/license).
