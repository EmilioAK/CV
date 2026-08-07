# Building a Native Capture System

> Macsights | Independent project | 2026

## Product idea

Macsights is a native macOS gameplay recorder and review tool. It records video together with game events.

The player displays those events as searchable markers on the playback timeline. A player can move directly to a kill, death, assist, or objective.

## Technical direction

The app uses Swift, SwiftUI, ScreenCaptureKit, AVFoundation, and VideoToolbox.

It detects supported games, starts capture automatically, stores recordings locally, and preserves metadata beside the media.

Recording packages remain useful without a central library database. The app can rebuild its index from the package manifests.

## Reliability work

Screen recording creates several hard boundaries. The game can restart, the capture target can disappear, and a recording can end during recovery.

The project uses explicit lifecycle states, reconnect handling, multiple media segments, validation, and storage safeguards.

## Why I am building it

Macsights combines systems engineering with a product that I want to use. It also forces direct testing against real media, timing, storage, and operating-system behavior.
