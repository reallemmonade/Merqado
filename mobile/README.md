# Merqado for iPhone

Expo (React Native) app that talks to the same API as merqado.ai.

- Screens: `src/app` (Expo Router). Inbox, Chats, case GPT, Tasks, chat room, GPT chat, case picker.
- Sign-in: opens `merqado.ai/login` in a secure sheet; the site hands back a one-time code
  (`/api/mobile/auth/finish`) that the app trades, with a PKCE verifier, for a 30-day token
  (`/api/mobile/auth/token`). The token lives in the iOS Keychain and is sent as `Authorization: Bearer`.
- Notifications: the app registers its Apple device token at `/api/mobile/devices`; the server sends
  @mentions and task assignments straight to Apple (`src/lib/push` in the web app). Server env:
  `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY_P8`.
- TestFlight: `.github/workflows/ios-testflight.yml` builds on GitHub's Macs with fastlane and uploads.
  Repository secrets: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`, `APPLE_TEAM_ID`, `MATCH_PASSWORD`.
  Runs on every push to `main` that touches `mobile/`, or by hand from the Actions tab.

```bash
npm ci
npx tsc --noEmit
npx expo start   # needs a development build on a device for native modules
```
