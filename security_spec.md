# Security Specification for ClipFlow Firestore

## Data Invariants
1. A workspace belongs to an authenticated owner (`owner_id == request.auth.uid`).
2. Workspace settings, source videos, clip candidates, clips, and render jobs belong to a workspace owned by the user.
3. Only authenticated users can access workspace resources where they are the owner or authorized.

## The Dirty Dozen Payloads
1. Unauthenticated write attempt to create a workspace.
2. Authenticated user attempting to modify another user's workspace owner_id.
3. Creating source_video with excessive string length exceeding limit.
4. Attempting to override system render job status directly without owner match.
5. Injected script tags in clip titles.
6. Spoofed ownerId on workspace settings creation.
7. Negative scores or invalid numbers on clip candidates.
8. Writing to arbitrary subcollections without workspace ownership.
9. Blank workspace_id on source_videos.
10. Unverified or missing auth header on render jobs.
11. Updating immutable fields like createdAt.
12. Attempting to list all workspaces across users without owner filter.

## Access Rules Summary
- All collections require `request.auth != null`.
- Reads and writes validate workspace ownership or owner_id.
