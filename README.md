# Hindi Bible — React Native Android App

A mobile-first Hindi Bible reader built with React Native + Expo + TypeScript.

## Current implementation

- Complete 66-book Protestant Bible catalogue (39 Old Testament + 27 New Testament).
- All 1,189 chapter references and chapter navigation.
- Live passage text through the official YouVersion Platform API.
- Hindi Bible version discovery and version selection.
- Scripture search through YouVersion verse search.
- Daily verse (John 3:16) loaded from the selected translation.
- Local bookmarks, reading history, personal notes and font-size preference.
- Responsive dark navy / parchment reader UI.
- EAS internal APK build profile.

## Scripture data and licensing

The app does not fabricate Bible verses or bundle copyrighted translations. A licensed Bible version and an approved YouVersion Platform App Key are required to retrieve complete scripture text.

1. Register the app at https://platform.youversion.com/
2. Obtain an App Key and confirm that the desired Hindi Bible version is available to the app.
3. Start the app, open Settings, paste the App Key, tap **हिंदी Bible Versions खोजें**, select a version, and save.
4. The reader loads passages using the official endpoint:
   `GET /v1/bibles/{bible_id}/passages/{passage_id}?format=text`
5. Display the copyright / attribution supplied by the selected publisher in production. Review the current YouVersion Platform terms before public distribution.

API documentation: https://developers.youversion.com/api/bibles
Search documentation: https://developers.youversion.com/api/search
Platform overview: https://developers.youversion.com/overview

## Run locally

```bash
npm install
npx expo install --check
npx expo start
```

For Android emulator, press `a` in the Expo terminal.

## Build an installable APK

Install and sign in to EAS CLI:

```bash
npm install -g eas-cli
eas login
```

Build:

```bash
eas build --platform android --profile preview
```

The `preview` profile is configured to produce an installable APK. Download it from the EAS build page after the cloud build completes.

## Important MVP boundaries

- Scripture text requires a licensed API key/version; the catalogue works without it.
- Bookmarks, notes, font size and reading history are stored locally on the device.
- Audio playback, offline scripture downloads, user accounts/cloud sync, verse-level highlights, and a production backend are planned next phases, not claimed as completed.
- Never commit real API keys or signing credentials to this repository.
