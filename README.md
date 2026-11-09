# Hindi Bible — React Native Android App

A mobile-first Hindi Bible reader built with React Native + Expo + TypeScript.

## Scripture provider — free, no key required

This app uses the **Free Use Bible API by AO Lab**:

- API base: `https://bible.helloao.org/api`
- No API key, account, or payment is required.
- Discover available translations: `/available_translations.json`
- List books: `/{translation}/books.json`
- Fetch chapter text: `/{translation}/{book}/{chapter}.simple.json`
- Official Hindi documentation: https://bible.helloao.org/docs/hi/
- API code repository: https://github.com/HelloAOLab/bible-api

The app's Settings screen discovers Hindi translations from the live provider list. Select a translation there before opening Scripture. Availability can change; the app does not hardcode an unverified Hindi translation ID.

**Translation licensing:** the API provider and API code are MIT licensed, but each Bible translation has its own licence and attribution. Review the selected translation's `licenseUrl`, `licenseNotice`, and terms before distributing or monetizing the app. Do not assume every translation is public domain or commercially reusable.

## Implemented

- Complete 66-book Protestant Bible catalogue (39 Old Testament + 27 New Testament).
- Navigation for all 1,189 chapter references.
- Live chapter text through the no-key Free Use Bible API.
- Live Hindi translation discovery and selection.
- Exact scripture-reference lookup (examples: `John 3:16`, `JHN.3.16`, `यूहन्ना 3:16`).
- Daily verse (John 3:16) loaded from the selected translation.
- Local bookmarks, reading history, personal notes and font-size preference.
- Responsive dark navy / parchment reader UI.
- EAS internal APK build profile.

## Known MVP limitations

- Full-text keyword search across all verses is not provided by the selected static API; current Search supports exact Bible references. A local full-text index is a planned follow-up.
- Audio playback, offline scripture downloads, verse-level highlights, user accounts/cloud sync, and production backend are planned next phases.
- Scripture text requires an internet connection in this MVP.
- Translation list results depend on what the provider currently publishes.

## Run locally

```bash
npm install
npx expo install --check
npx expo start
```

For Android emulator, press `a` in the Expo terminal.

## Build an installable APK

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview
```

The `preview` profile is configured to produce an installable APK. Download it from the EAS build page after the cloud build completes.

## Security

No API key is used by the current provider integration. Never commit signing credentials or private tokens to this repository.
