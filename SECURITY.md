# Security Notes

## Compromised Secrets (action required)

### ElevenLabs API Key
- **Status:** The ElevenLabs API key previously hardcoded in `.env.example` files was committed to
  Git history and must be considered compromised.
- **Action:** Rotate the key at https://elevenlabs.io → Profile → API Keys.
- **Placeholder:** Search for `PASTE_YOUR_NEW_ELEVENLABS_KEY_HERE` in the repo to find all places
  that need the new key.

## Git History
Sensitive values may exist in Git history prior to the remediation commit. If this repo is or
becomes public, consider running `git filter-repo` or BFG Repo Cleaner to purge the history.
For a private repo, rotating the keys is sufficient.

## Reporting
To report a security issue, contact the repo owner directly.
