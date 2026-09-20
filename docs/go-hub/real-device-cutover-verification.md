# GO Hub cutover verification

This is the current owner-facing verification gate for the active GO Hub hard cutover.

## Current release gate

- Online `/` opens GO Hub.
- Disable network, reopen the installed/current GO Hub shell, and verify the GO Hub offline shell still opens.
- NormalPocket online/offline behavior is not evaluated by the current GO Hub release gate because NormalPocket is no longer the active root publication.
- CI GREEN is necessary but not sufficient.
- Do not merge until the current release evidence is green and the owner gate is satisfied.
- Do not deploy a changed cutover contract until the current release evidence is green and the owner gate is satisfied.

## STOP conditions

STOP if `/` does not open GO Hub online, if the offline GO Hub shell cannot reopen after caching, if the service worker does not own the current GO Hub shell, or if current release evidence conflicts with the active publication manifest.
