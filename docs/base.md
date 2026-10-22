# Base module

Source: [`src/modules/base`](../src/modules/base). This module contains shared interface pieces used by multiple features. Its manifest registers no routes or navigation links.

## Files and responsibilities

| File inside the module | Purpose and usage |
| --- | --- |
| `manifest.ts` | Registers the Shared UI module with an empty route/navigation list. |
| `components/dashboard-shell.tsx` | Wraps account/admin module pages with the workspace sidebar, account details, settings and notification icons, and sign-out action. |
| `components/TextField.tsx` | Renders a labelled input and forwards standard input attributes. |
| `components/confirm-dialog.tsx` | Native modal confirmation dialog used for actions such as deleting stories/taxonomy and changing user access. The caller supplies the action and busy state. |
| `components/theme-select.tsx` | Light/dark switch used in the root layout. Reads the document theme, listens for system/storage changes, and stores an explicit preference in `localStorage`. |
| `components/voice-search-button.tsx` | Reusable microphone button that returns recognized text through `onResult`. Used by the story search form. |

## Workspace flow

`moduleRegistry.tsx` gathers navigation items from manifests and passes them to `DashboardShell`. The shell uses `useAuth()` to wait for session restoration, show restoration errors, redirect guests to `/login?returnTo=...`, and restrict admin workspace paths to administrators. NestJS remains the authority for protected data.

The sidebar places the notification bell and settings link beside the account name. Sign-out calls the existing authentication action. The shell does not fetch or own story, taxonomy, or chat data.

The root page layout, global header/footer, and Redux provider live outside this module, in `src/app/layout.tsx` and `src/lib/ReduxProvider.tsx`.

## Voice button contract

```tsx
<VoiceSearchButton
  language="en-US"
  onResult={(text) => {
    // The caller decides where to put the text and whether to submit a search.
  }}
/>
```

`onResult` is required. `language` defaults to `en-US`; `className` can override the button styling. The component uses `SpeechRecognition` or `webkitSpeechRecognition`, listens for one final result, and returns the trimmed transcript.

The parent search form fills its existing input and submits its normal search handler. The voice button does not know about URLs, blog queries, Redux, or the backend. It handles unsupported browsers, microphone permission failures, missing audio, no speech, cancellation, and cleanup on unmount. Speech recognition support and service behavior depend on the browser.

## State and storage

Theme and microphone state are local component state. The theme preference uses the `bloghub-theme` storage key. Dashboard account state comes from the auth module. This module has no RTK Query service and owns no backend endpoints.

## Manual checks

- Visit a workspace route as a guest, then sign in and confirm the return path is preserved.
- Check sidebar navigation for an author and an administrator.
- Switch theme and reload; confirm the selected appearance remains.
- Open/cancel a confirmation dialog using mouse and keyboard.
- Try voice search in a supported browser and verify that typed search still works when voice recognition is unavailable.

Related: [Authentication](auth.md), [Website](website.md), [Notifications](notifications.md).
