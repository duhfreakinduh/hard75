# AI / Contributor Guide

Keep this tracker fast, private, and usable offline. If AI coaching is added or expanded, it must remain optional and clearly separated from the user's actual completion history.

## Priorities
1. Preserve local progress/history and backward compatibility with saved data.
2. Never send journal entries, photos, or health/fitness data to remote AI without explicit user action and disclosure.
3. AI failures must not block logging, streaks, plans, or navigation.
4. Avoid medical diagnosis or injury-treatment claims; use conservative wording for fitness guidance.
5. Keep photo storage bounded and handle storage quota failures.
6. Maintain accessible controls and strong mobile usability.
7. Do not commit secrets or provider tokens.
8. Document storage/schema changes and migration behavior.

## Before merging
- Test with existing saved history.
- Test offline.
- Test storage-full or corrupted-data behavior where practical.
- Verify core completion tracking without AI/network access.
- Check mobile layout and console errors.
