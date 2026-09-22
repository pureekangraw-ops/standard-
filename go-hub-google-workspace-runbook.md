# GO Hub Google Workspace Bridge

## Purpose
Extend the existing server-side Google OAuth bridge without replacing the Drive integration.

## APIs
Enable these APIs in the same Google Cloud project used by the existing OAuth client:
- Gmail API
- Google Calendar API

## OAuth scopes
Request only the capabilities exposed by GO Hub:
- https://www.googleapis.com/auth/gmail.readonly
- https://www.googleapis.com/auth/gmail.send
- https://www.googleapis.com/auth/calendar.readonly
- https://www.googleapis.com/auth/calendar.events

Keep the existing Drive scope already used by the deployment.

## Runtime credentials
The bridge prefers GOOGLE_WORKSPACE_* variables and can fall back to the existing generic Google OAuth/Drive refresh credentials. Never commit or paste client secrets, refresh tokens, or access tokens into source, tickets, logs, or chat.

After adding scopes, perform Google OAuth authorization again so the stored refresh token is granted the new scopes. A refresh token minted only for Drive cannot acquire Gmail or Calendar permissions by itself.

## Governance
Gmail reads and Calendar reads are read-only MCP operations.
Gmail send requires workContext destination://gmail.
Calendar event creation requires workContext destination://calendar.
No Gmail delete or Calendar delete operation is exposed.

## Verification
Before live use:
1. Confirm Gmail API and Google Calendar API are enabled.
2. Reauthorize the OAuth client with the required scopes.
3. Inspect sanitized diagnostics; credentials must never be returned.
4. Read Gmail profile and list calendars.
5. Perform mutation tests only with an explicit governed WorkContext.
