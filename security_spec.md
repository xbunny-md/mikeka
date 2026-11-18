# Security Specification & Payload-First TDD — SportyBet Odds Hunter

## 1. Data Invariants
1. **Strict Ownership & PII Isolation**: All user data (`/users/{userId}` and subcollections `scanHistory`, `bookingCodes`, `presets`, `favorites`, `favoriteTickets`, `notifications`, `transfers`) is readable and writable exclusively by the authenticated owner (`request.auth.uid == userId` with `request.auth.token.email_verified == true`). No cross-user reads or blanket `isSignedIn()` reads are permitted.
2. **Identity Integrity**: Every document's `uid` or `userId` field must match both `request.auth.uid` and the path `{userId}`. It is immutable after creation.
3. **Path Variable Hardening**: Every document ID (`userId`, `scanId`, `codeId`, `presetId`, `favoriteId`, `notificationId`, `transferId`) must match `^[a-zA-Z0-9_-]+$` and be `<= 128` characters.
4. **Temporal Integrity**: `createdAt` must equal `request.time` on creation and remain immutable on updates. `updatedAt` must equal `request.time` on creation and update.
5. **Volumetric & Schema Bounds**: Every string has strict min/max `.size()` limits, every array has strict `.size() <= MAX` limits, and every document enforces `keys().hasAll(...) && keys().hasOnly(...)` on creation plus `affectedKeys().hasOnly(...)` on update.

## 2. The "Dirty Dozen" Attack Payloads (All Must Yield `PERMISSION_DENIED`)
1. **Unauthenticated Write**: Creating `/users/userA/scanHistory/scan1` with `request.auth == null`.
2. **Unverified Email Spoof**: Creating `/users/userA` with `email_verified: false`.
3. **Cross-Tenant Read (PII Leak)**: `userB` calling `get` or `list` on `/users/userA` or `/users/userA/bookingCodes`.
4. **Identity Spoofing**: `userB` creating `/users/userB/presets/p1` with `userId: "userA"`.
5. **Shadow / Ghost Field Injection**: `userA` creating `/users/userA` with extra field `isAdmin: true`.
6. **Path ID Poisoning**: `userA` writing to `/users/userA/favorites/${'a'.repeat(300)}` or invalid characters like `id$bad`.
7. **Timestamp Forgery**: `userA` creating `/users/userA/scanHistory/s1` with backdated `createdAt` instead of `request.time`.
8. **Immutable Field Mutation**: `userA` updating `createdAt` or `uid` on `/users/userA`.
9. **Unbounded Array Exhaustion**: `userA` creating `/users/userA/bookingCodes/c1` with `selections.length = 50` (limit is 30).
10. **Oversized String Poisoning**: `userA` creating `/users/userA/presets/p1` with `name.length = 500` (limit is 80).
11. **Invalid Enum State Injection**: `userA` updating `/users/userA/bookingCodes/c1` with `status: "HACKED"`.
12. **Terminal State Bypass / Missing Validation**: `userA` updating `/users/userA/notifications/n1` with non-boolean `read: "yes"` or mutating `message`.
