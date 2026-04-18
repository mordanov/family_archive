# Family Archive — Business Overview

## What it is
**Family Archive** is a small private cloud for one family. It lets two trusted
people (the parents) store, organise, view and share the family's digital
memorabilia — photos, home videos, voice recordings, scanned documents, ZIPs
of old projects — in one place that **they own and control**.

It looks and feels like a familiar file manager (similar to macOS Finder), runs
in any modern browser, and works on phones via the same web UI.

## Who it is for
- **Two users**, both with full access. No invites, no roles, no permissions
  to manage. The system is intentionally tiny in scope.
- **Anyone they explicitly share a file with**, via a link that can optionally
  be password-protected and time-limited.

## What problem it solves
Today the family's files are scattered across:
- Phone camera rolls (eventually deleted to free space).
- Various cloud providers (Google Drive, iCloud, Dropbox) with surprise bills,
  tracking, and lock-in.
- USB drives in a shoebox.

Family Archive replaces these with a **single private space** that:
1. Costs **predictable, low money** (object storage is billed by the GB/month).
2. **Doesn't lock anything in** — every file is a normal object in an
   S3-compatible bucket; can be migrated to any other S3 provider in hours.
3. **Doesn't sell or scan** the data.
4. **Survives device changes** — there is no app to install; any browser works.
5. Can be **shared with grandparents** in one click, without making them sign up
   for anything.

## What you can do with it

### Browse
- A folder tree on the left, contents on the right. Standard "double-click to
  enter" navigation. Breadcrumbs show where you are.
- Tags can be added to files (e.g. `2024-summer`, `passports`) and searched.

### Upload
- Drag and drop any number of files anywhere in the page.
- Uploads are **chunked**: each file is sent in 8 MB pieces. If the network
  hiccups or the laptop closes, the upload **resumes** where it left off.
- Up to ~20 GB per file is supported (configurable).

### Preview without downloading
- **Photos** (any common format) — instantly, with thumbnails in lists.
- **Videos** — play in browser, including scrubbing forwards/backwards.
- **Audio** — play with title/artist/album/duration shown.
- **ZIP archives** — see what's inside and download individual files without
  extracting the whole thing.

### Organise
- Create / rename / move folders.
- Rename / move / delete files.
- Tag files for cross-folder discovery.

### Trash safety net
- Deleting moves to **Trash**, kept for **30 days**, then automatically purged.
- Restore is one click. No more "I deleted the wedding photos by accident".

### Share
- Generate a public link to any file (or, in v1, any folder listing).
- Optional password.
- Optional expiration date.
- Optional download counter cap.
- Revocable at any moment.

## What it deliberately does **not** do (v1)
- No public registration, no third user, no permissions matrix.
- No mobile app — the website is mobile-friendly, that is enough.
- No server-side full-text search inside file contents (only filename / tag).
- No file versioning (the trash already protects against accidents).
- No additional encryption beyond what Hetzner provides at rest (the storage
  account itself is encrypted by the provider; access requires our credentials).

These are explicit decisions to keep the system **simple, cheap, maintainable
and obviously correct**. Any of them can be revisited later.

## How the family pays for it
Costs scale linearly with what they actually store:

| Item | Cost (Hetzner, 2026 EU pricing) | Notes |
|---|---|---|
| Object storage | ~€5 / TB / month | Pay only for used GB |
| Egress (downloads) | ~€1 / TB | Negligible for normal household use |
| VPS (CPU/RAM/disk for the app) | from €4 / month | Shared with the family's other small sites |
| Domain | ~€10 / year | One-off per year |

**Typical family of 4 with ~500 GB of photos & videos: < €5/month total.**
Compare with Google One 2 TB (€10/month) or iCloud 2 TB (€10/month) — and that
data lives on your own bucket.

## Risk picture (plain language)
- **Hetzner outage** — files are temporarily unreachable until the provider
  recovers. No data loss, because Hetzner replicates every object internally.
- **Forgotten password** — there is no "forgot password" flow (there are only
  two known accounts). The other family member can reset it on the VPS in 5
  minutes by editing one environment variable and restarting one container.
- **Bug deletes a file** — soft-delete + 30-day trash + audit log mitigate this.
  Hard data loss requires the bug to also affect the trash purge worker, which
  is a separate code path with its own tests.
- **VPS goes down** — files are still safe in object storage. Bring up a new
  VPS, point DNS at it, run one deploy script, the application is back. ~30
  minutes recovery.
- **Object-storage credentials leak** — rotate the keys in the provider
  console, update one `.env` file on the VPS, restart one container. The keys
  are never sent to the browser, so the leak surface is the VPS only.

## Success criteria for v1
- Both users can log in from a phone or laptop and find any file in < 10 s.
- Uploading a 5 GB home video over flaky Wi-Fi finishes successfully (resume
  works).
- Sharing a folder with grandparents takes < 30 s and they can download
  without signing up.
- Total monthly cost remains predictable and aligned with actual storage used.
- No support ticket from the spouse in the first month.

