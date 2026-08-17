# Custom Discord Presence

A small Electron app for publishing editable Discord Rich Presence from your desktop.

## Run

```bash
npm install
npm start
```

Keep Discord open while using the app. This app does not launch Discord for you.

## Build the macOS app

```bash
npm run package:mac
```

The Finder application is created at:

```text
dist/Discord Presence-darwin-arm64/Discord Presence.app
```

Use the **Discord build** selector for the client you actually run. If you use Discord Canary, leave it set to **Discord Canary**.

## Discord Setup

1. Open the Discord Developer Portal.
2. Create an application.
3. Copy the application's client ID into this app.
4. Add any image assets you want to use under the application's Rich Presence assets.
5. Use those asset names as the large and small image keys.

The app saves its workspace locally in Electron's app data folder. The application client
ID and Discord build form one global connection shared by every preset. Each preset keeps
its own presence type, activity fields, assets, buttons, and elapsed-time timeline.
Switching presets pauses the previous timer and transfers timing to the selected preset,
so only the active application accumulates time. A paused timeline keeps its exact elapsed
value until resumed.

Pausing an active timer republishes the presence without a Discord timestamp. Resuming
backdates a new start timestamp from the saved elapsed value, since Discord RPC does not
support a frozen progress timer.

You can designate any saved preset as the idling preset. Pausing switches Discord and
the editor to that preset and starts its timer from zero. Resuming restores the original
preset and continues its preserved timeline.
