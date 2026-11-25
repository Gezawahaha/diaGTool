# AXS Diagnostic Lab

## Project Specification & Master Prompt

**Document:** `PROJECT.md`\
**Project:** AXS Diagnostic Lab\
**Version:** 1.0\
**Status:** Product and technical specification --- initial development\
**Primary platform:** Android\
**Primary target:** SRAM AXS electronic drivetrain diagnostics\
**Initial test hardware:** SRAM Force eTap AXS 2x12 Front Derailleur
(FD), with one faulty unit and one known-working replacement unit\
**Backend:** Cloudflare Workers + Cloudflare D1 (Free plan target)\
**Mobile stack:** React Native + TypeScript

------------------------------------------------------------------------

# 1. Project Mission

Build **AXS Diagnostic Lab**, an Android-first diagnostic and research
application for SRAM AXS electronic drivetrain components.

The application must:

1.  Discover and identify SRAM AXS components over Bluetooth Low Energy
    (BLE), where the hardware exposes BLE advertising or GATT services.
2.  Connect to supported devices where connection is permitted.
3.  Inspect available GATT services, characteristics, descriptors,
    properties, notifications, and readable values.
4.  Record real device observations and diagnostic events.
5.  Investigate abnormal Front Derailleur sleep/wake or communication
    behavior.
6.  Compare a faulty FD with a known-working FD of the same or verified
    compatible model.
7.  Store hardware catalog data, device profiles, diagnostic sessions,
    events, and comparison reports in Cloudflare D1 through Cloudflare
    Workers.
8.  Work offline during physical diagnostics and synchronize records to
    the cloud when internet connectivity returns.
9.  Research safe, model-specific firmware recovery options. Firmware
    flashing must remain disabled until the protocol, firmware image,
    compatibility, and recovery procedure are verified.

**Core principle:** observe first, record evidence, compare devices,
form hypotheses, and only then consider any recovery operation. Never
invent protocol details or send undocumented commands.

The application is a diagnostic research tool. It must not claim that it
can repair firmware unless a verified, supported recovery process has
actually been implemented and tested.

------------------------------------------------------------------------

# 2. Background: Initial Hardware and Fault

## 2.1 Initial setup

The user has a SRAM Force eTap AXS 2x12 groupset and two Front
Derailleur units:

-   **FD A --- Faulty unit:** original FD that exhibits intermittent
    unresponsive behavior.
-   **FD B --- Reference unit:** replacement FD that works normally on
    the same bicycle.

The faulty unit is still detected by the official SRAM AXS application.

The label photograph supplied during the conversation appears to show
these markings:

-   `FCC ID: C90-FODB1`
-   `IC: 10161A-FODB1`
-   `MADE IN TAIWAN`
-   A lower physical marking that is only partially legible and must be
    re-photographed or verified.
-   The exact SRAM model/part number is **not yet confirmed**.

Do not infer the exact SRAM product generation or part number from the
FCC ID alone. Store label observations as unverified until cross-checked
against an official SRAM source or a clearly readable physical marking.

## 2.2 Fault symptoms

The faulty FD exhibits this sequence:

1.  Immediately after installing its battery, the FD can move up and
    down.
2.  After being left idle for some time, it becomes unresponsive.
3.  It may also stop responding while the bicycle is being ridden.
4.  Shifter commands no longer cause the FD to move.
5.  Pressing the physical AXS button on the FD appears to wake it; it
    can then move again temporarily.
6.  The issue repeats after another idle period or during use.

## 2.3 Troubleshooting already performed

-   Tested the original battery.
-   Replaced it with a new battery.
-   Swapped the battery with a battery known to work in the RD.
-   Reinstalled the battery.
-   Tried system reset and/or re-pairing procedures.
-   Confirmed the old FD is detected by the official SRAM AXS app.
-   Installed a new FD; the new FD works normally on the same bicycle.

Battery replacement did not resolve the faulty FD.

## 2.4 Initial hypotheses --- not confirmed diagnoses

Investigate these possibilities without prematurely selecting one:

-   Abnormal sleep/wake behavior.
-   Power-management or wake interrupt issue.
-   BLE advertising or wireless communication issue.
-   Internal AXS communication issue.
-   Firmware malfunction.
-   Microcontroller or radio subsystem fault.
-   Battery contact, power delivery, or internal electrical fault.
-   Other hardware failure.

A BLE disconnect does not prove the FD entered sleep mode. The app must
distinguish observed facts from inferred states.

Use terms such as `SUSPECTED_IDLE`, `UNRESPONSIVE_OBSERVED`, and
`MANUAL_WAKE_OBSERVED` unless the hardware provides a direct, verifiable
sleep-state signal.

------------------------------------------------------------------------

# 3. Product Scope and Non-Goals

## 3.1 In scope

-   Android application.
-   BLE scanning and connection lifecycle.
-   GATT discovery and safe inspection.
-   Device identification and model catalog.
-   Manual model/serial/part/FCC/IC input.
-   Photo-based label OCR as a later feature.
-   Local diagnostic storage.
-   Cloud synchronization.
-   Diagnostic timeline and export.
-   Faulty-versus-reference device comparison.
-   Hardware-specific diagnostic profiles.
-   Firmware recovery feasibility research.
-   Future expansion to additional SRAM AXS groupsets and components.

## 3.2 Not in scope for the first release

-   Arbitrary BLE command transmission.
-   Guessing proprietary SRAM command formats.
-   Firmware dumping or flashing without a verified, authorized method.
-   Modifying bootloaders.
-   Bypassing authentication or device security.
-   Claiming access to internal motor, battery, or firmware telemetry
    that the device does not expose.
-   Replacing the official SRAM AXS application.
-   Cloud-dependent BLE monitoring.
-   Treating all SRAM AXS generations as protocol-identical.

------------------------------------------------------------------------

# 4. Universal SRAM Hardware Catalog

AXS Diagnostic Lab must not be hardcoded for SRAM Force only. Build a
universal, extensible catalog for SRAM electronic drivetrain and
AXS-related products.

## 4.1 Product families to accommodate

The catalog should be able to represent, where applicable:

### Road / Gravel

-   SRAM RED eTap AXS
-   SRAM RED AXS
-   SRAM Force eTap AXS
-   SRAM Force AXS
-   SRAM Rival eTap AXS
-   SRAM Rival AXS
-   SRAM Apex AXS
-   SRAM XPLR AXS
-   SRAM RED XPLR AXS
-   SRAM Force XPLR AXS
-   SRAM Rival XPLR AXS

### MTB / Other AXS ecosystems

-   SRAM XX1 Eagle AXS
-   SRAM X01 Eagle AXS
-   SRAM GX Eagle AXS
-   SRAM XX Eagle AXS
-   SRAM Eagle Transmission AXS
-   Other SRAM AXS-compatible components as verified.

Do not assume every listed product has the same BLE capabilities, GATT
profile, update procedure, or diagnostic support. The catalog is a
product taxonomy, not proof of protocol compatibility.

## 4.2 Generation and revision selection

Allow selection of:

-   Product family / groupset.
-   Generation or product revision.
-   Component type.
-   Model number.
-   Part number.
-   Hardware revision.
-   Firmware version.

Examples of generation labels may include first-generation and
later-generation product variants, but exact dates and model
relationships must be backed by reliable sources.

Do not infer generation from purchase date alone.

## 4.3 Component types

Support catalog entries for:

-   Front Derailleur (FD).
-   Rear Derailleur (RD).
-   Left shifter.
-   Right shifter.
-   AXS controller.
-   Power meter.
-   Other supported AXS components.

Each component must have its own capability profile and diagnostic
support status.

## 4.4 Manual identification

Provide a manual identification form with optional fields:

-   Brand.
-   Product family / groupset.
-   Generation.
-   Component type.
-   Model number.
-   Part number.
-   Serial number.
-   FCC ID.
-   IC ID.
-   Hardware revision.
-   Firmware version.
-   Manufacturing information.
-   Notes.
-   Evidence source.
-   Verification status.

Do not require users to know every field. Unknown values must remain
null/unknown, not be guessed.

## 4.5 Photo label identification

Later, add camera/gallery upload and OCR to read:

-   Model number.
-   Serial number.
-   FCC ID.
-   IC ID.
-   Hardware revision.
-   Manufacturing code.

OCR results must be shown to the user for confirmation before saving.
Preserve the original OCR text and confidence where practical. Mark
uncertain characters and allow manual correction.

Do not silently convert an uncertain OCR result into a confirmed model.

## 4.6 BLE automatic identification

Use only data actually observed from the device:

-   Advertising name.
-   Manufacturer data.
-   Service UUIDs.
-   Device identifier.
-   GATT services.
-   GATT characteristics and properties.
-   Firmware and hardware information, if exposed.

Identification confidence levels:

-   `CONFIRMED`: verified against an authoritative source or validated
    identifier.
-   `HIGH`: multiple independent identifiers agree.
-   `MEDIUM`: partial but meaningful match.
-   `LOW`: weak match, such as a name-only match.
-   `UNKNOWN`: insufficient evidence.

A Bluetooth device name alone must never establish an exact SRAM model.

## 4.7 Hardware profile structure

A hardware profile should contain:

``` json
{
  "brand": "SRAM",
  "product_family": "Force AXS",
  "generation": null,
  "component_type": "FRONT_DERAILLEUR",
  "model_number": null,
  "part_number": null,
  "serial_number": null,
  "fcc_id": "C90-FODB1",
  "ic_id": "10161A-FODB1",
  "hardware_revision": null,
  "firmware_version": null,
  "protocol_profile_id": null,
  "ble_capabilities_status": "UNVERIFIED",
  "gatt_profile_status": "NOT_DISCOVERED",
  "firmware_recovery_status": "UNVERIFIED",
  "identification_confidence": "LOW",
  "verification_status": "UNVERIFIED"
}
```

This is an example record, not a claim that the FCC/IC values
conclusively identify the exact SRAM model.

------------------------------------------------------------------------

# 5. Technology Stack

## 5.1 Android application

Preferred stack:

-   React Native.
-   TypeScript.
-   Android-first.
-   BLE library: evaluate `react-native-ble-plx` or a maintained
    alternative.
-   Kotlin native module when native Android BLE functionality is
    required.
-   React Navigation.
-   Zustand or React Context for state management.
-   SQLite for local persistence.
-   A maintained SQLite library compatible with the selected React
    Native architecture.
-   Local secure storage for credentials/tokens.
-   JSON and CSV export.

Select package versions that are compatible with the chosen React Native
version. Pin versions and document the reason for selecting the BLE
library.

Do not assume an emulator can reproduce real BLE behavior. Physical
Android testing is mandatory.

## 5.2 Cloud backend

Use:

-   Cloudflare Workers for REST API.
-   Cloudflare D1 for relational metadata and diagnostic records.
-   Wrangler for local development, migrations, and deployment.
-   TypeScript for Worker implementation.
-   D1 binding from Worker environment.

Do not connect the mobile application directly to D1. All remote
database access must go through the Worker API.

## 5.3 Optional future Cloudflare services

Do not add these unless justified:

-   Cloudflare R2: for larger binary attachments or files, if needed and
    if its free allowance/price is verified.
-   Cloudflare Queues: for asynchronous processing if required and
    plan-compatible.
-   Cloudflare Turnstile: only if a public web-facing form requires
    abuse protection.
-   Cloudflare Analytics/Logs: optional operational observability.

D1 should store structured records and compact diagnostic payloads, not
large firmware binaries or large media files.

------------------------------------------------------------------------

# 6. Cloudflare Free-Tier Requirements

The initial deployment target is Cloudflare Workers Free + D1 Free.

The implementation must be cost-aware and must handle quota exhaustion
gracefully.

The following figures were checked against Cloudflare documentation on
25 November 2026. They may change; re-check official documentation
before deployment.

## 6.1 Workers Free reference limits

-   100,000 requests per day.
-   10 ms CPU time per HTTP request.
-   128 MB memory.
-   50 subrequests per request.
-   6 simultaneous outgoing connections per request.
-   Worker bundle size limit and other platform constraints apply.

Source: https://developers.cloudflare.com/workers/platform/limits/

## 6.2 D1 Free reference limits

-   Up to 10 databases per account.
-   500 MB maximum size per database.
-   5 GB maximum storage per account.
-   5 million rows read per day.
-   100,000 rows written per day.
-   7 days of Time Travel retention.
-   50 read subrequests per Worker invocation.
-   Maximum row/string/BLOB size: 2 MB.
-   Maximum bound parameters per query: 100.

Source: - https://developers.cloudflare.com/d1/platform/limits/ -
https://developers.cloudflare.com/d1/platform/pricing/

Cloudflare documents that free-tier daily read/write limits are
enforced; when limits are exceeded, D1 queries can fail until the daily
reset. Stored data is not thereby deleted.

Source:
https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/

## 6.3 Free-tier engineering rules

1.  Do not upload every BLE scan result continuously.
2.  Keep raw BLE events locally first.
3.  Sync in batches.
4.  Deduplicate events before upload.
5.  Use cursor-based pagination.
6.  Add indexes for common filters.
7.  Avoid unbounded table scans.
8.  Avoid N+1 query patterns.
9.  Batch D1 writes where appropriate.
10. Use prepared statements and bound parameters.
11. Limit payload sizes.
12. Do not store firmware images in D1.
13. Provide a visible sync state and quota/error state.
14. If cloud quota is exceeded, preserve local records and retry later.
15. Never delete local logs just because cloud synchronization succeeded
    unless the user explicitly enables a retention policy.

Do not promise that the system will remain free under all future usage.
Make the app functional within the documented Free limits and easy to
upgrade later.

------------------------------------------------------------------------

# 7. High-Level Architecture

``` text
┌─────────────────────────────────────────────┐
│              Android Application            │
│                                             │
│  React Native + TypeScript                   │
│                                             │
│  ┌──────────────┐  ┌──────────────────────┐  │
│  │ BLE Scanner  │  │ GATT Explorer        │  │
│  └──────────────┘  └──────────────────────┘  │
│                                             │
│  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Diagnostics  │  │ Sleep/Wake Monitor   │  │
│  └──────────────┘  └──────────────────────┘  │
│                                             │
│  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Local SQLite │  │ Sync Queue           │  │
│  └──────────────┘  └──────────────────────┘  │
└──────────────────────┬──────────────────────┘
                       │ HTTPS REST API
                       ▼
┌─────────────────────────────────────────────┐
│             Cloudflare Workers              │
│                                             │
│  Authentication / Validation / API          │
│  Rate limiting / Batch ingestion / Sync     │
└──────────────────────┬──────────────────────┘
                       │ D1 Binding
                       ▼
┌─────────────────────────────────────────────┐
│               Cloudflare D1                 │
│                                             │
│  Hardware Catalog                           │
│  Hardware Profiles                          │
│  Devices                                    │
│  Diagnostic Sessions                        │
│  Diagnostic Events                           │
│  GATT Profiles                               │
│  Comparison Reports                         │
│  Sync Metadata                               │
└─────────────────────────────────────────────┘
```

## 7.1 Offline-first rule

BLE operations must never depend on Cloudflare connectivity.

The Android application must:

-   Scan and connect locally.
-   Perform GATT discovery locally.
-   Monitor device behavior locally.
-   Save diagnostic events in local SQLite.
-   Queue records for synchronization.
-   Synchronize when connectivity is available.
-   Preserve records after failed sync.
-   Prevent duplicate cloud records on retry.

Cloudflare is for backup, catalog distribution, multi-device access, and
report storage --- not for real-time BLE control.

## 7.2 Data ownership

The phone is the source of raw diagnostic observations.

The Worker validates and stores uploaded records.

The cloud must not fabricate BLE events or device telemetry.

Server-generated timestamps may be stored separately from
device-observation timestamps.

------------------------------------------------------------------------

# 8. Application Modules

## Module 1 --- Dashboard

Show:

-   Selected hardware profile.
-   Last connected device.
-   Current connection state.
-   Latest diagnostic session.
-   Sync status.
-   Number of pending local events.
-   Latest diagnostic findings.
-   Shortcuts to scan, diagnose, compare, and view logs.

Use clear states: normal, warning, error, unknown, offline, pending
sync.

## Module 2 --- Device Scanner

Features:

-   Start/stop BLE scan.
-   Discovered device list.
-   Device name.
-   Platform device identifier.
-   RSSI.
-   Manufacturer data when available.
-   Advertising service UUIDs.
-   Scan timestamp.
-   Filter/search.
-   Select device.
-   Save device to local inventory.

Do not infer a device model from its name alone.

## Module 3 --- Device Connection Manager

Features:

-   Connect/disconnect.
-   Connection state.
-   Connection timeout.
-   Reconnect policy.
-   RSSI monitoring.
-   Service discovery.
-   Characteristic discovery.
-   Descriptor discovery.
-   Read supported characteristics.
-   Subscribe to supported notifications/indications.
-   Connection event logging.
-   Error handling and cleanup.

Do not write to unknown characteristics.

Do not continuously reconnect in a way that drains the device battery or
interferes with the official app.

## Module 4 --- GATT Explorer

Display:

-   Service UUID.
-   Characteristic UUID.
-   Properties.
-   Read/write/write-without-response support.
-   Notify/indicate support.
-   Descriptors.
-   Read result.
-   Notification stream.
-   Observation timestamp.

Actions:

-   Refresh services.
-   Read characteristic only if readable.
-   Subscribe/unsubscribe only when supported.
-   Export GATT profile as JSON.
-   Compare profiles.

Default behavior must be read-only.

No undocumented writes or command fuzzing in the initial release.

## Module 5 --- Device Diagnostics

Display information only when available:

-   Device name.
-   Device identifier.
-   Manufacturer information.
-   Hardware revision.
-   Firmware version.
-   Battery level.
-   RSSI.
-   Connection state.
-   Last communication timestamp.
-   GATT services.
-   Notification activity.
-   Disconnect history.

If a field is not exposed, show `Not Available`. Do not imply that the
app can read internal SRAM telemetry if it cannot.

## Module 6 --- Sleep/Wake Monitor

This is the most important diagnostic feature.

### Scenario A: Initial power

1.  Remove the FD battery.
2.  Wait for a user-configurable interval.
3.  Reinstall the battery.
4.  Start observation.
5.  Record BLE advertising if observed.
6.  Record discovery time.
7.  Record connection attempts and outcomes.
8.  Record available GATT notifications.

### Scenario B: Idle monitoring

1.  Connect to the FD if possible.
2.  Start an idle observation session.
3.  Record RSSI samples at a configurable, conservative interval.
4.  Record connection changes.
5.  Record notification events.
6.  Record the time when the FD becomes unresponsive, based on a user
    observation or a clearly defined test.

Do not equate absence of BLE packets with sleep unless verified.

### Scenario C: Manual wake

1.  Wait until the FD is reported unresponsive.
2.  User presses the physical AXS button.
3.  Record the user's action timestamp.
4.  Observe advertising changes.
5.  Observe reconnection behavior.
6.  Record available notifications.
7.  Compare before/after behavior.

The app cannot physically detect a button press unless the device
exposes a corresponding event. Provide a manual "I pressed AXS button"
marker.

### Scenario D: Normal reference operation

Repeat the same test on the new, working FD under similar conditions.

### Event types

-   `DEVICE_DISCOVERED`
-   `CONNECTION_ATTEMPTED`
-   `CONNECTION_ESTABLISHED`
-   `CONNECTION_LOST`
-   `GATT_DISCOVERED`
-   `CHARACTERISTIC_READ`
-   `NOTIFICATION_RECEIVED`
-   `RSSI_SAMPLE`
-   `MANUAL_WAKE_MARKER`
-   `USER_REPORTED_UNRESPONSIVE`
-   `RECONNECTION_ATTEMPT`
-   `SYNC_QUEUED`
-   `SYNC_SUCCEEDED`
-   `SYNC_FAILED`

Each event should include:

-   Event ID.
-   Device ID.
-   Session ID.
-   Event type.
-   Observation timestamp.
-   App-recorded timestamp.
-   Event description.
-   RSSI if available.
-   Connection state if available.
-   Service UUID if relevant.
-   Characteristic UUID if relevant.
-   Raw payload in hex only when safely observable and useful.
-   Source: automatic observation or user marker.

## Module 7 --- Old FD vs New FD Comparison

Allow the user to assign device roles:

-   FD A: faulty/original.
-   FD B: known-working reference.

Compare:

-   Advertising information.
-   Manufacturer data.
-   GATT service list.
-   Characteristic list.
-   Characteristic properties.
-   Notification availability.
-   Firmware/hardware information when exposed.
-   RSSI observations.
-   Connection stability.
-   Idle observation.
-   Manual wake observation.

Comparison labels:

-   `IDENTICAL`
-   `DIFFERENT`
-   `A_ONLY`
-   `B_ONLY`
-   `NOT_OBSERVABLE`

Do not label a difference as a fault automatically. It may be caused by
hardware revision, firmware version, configuration, or normal product
variation.

Export comparison reports as JSON and CSV.

## Module 8 --- Diagnostic Analyzer

Analyze recorded evidence and generate hypotheses.

Examples:

**Case A:** Device continues advertising but connection fails. Potential
areas to investigate: - BLE connection behavior. - GATT discovery. -
Connection parameter or compatibility issue.

**Case B:** Device is not observed advertising until the user presses
the AXS button. Potential areas: - Radio inactivity. - Power
management. - Wake behavior. - Hardware fault.

**Case C:** Device is connected over BLE but shifting does not work.
Potential areas: - AXS wireless communication. - Internal command
processing. - Firmware behavior. - Mechanical or electrical fault.

**Case D:** New FD is stable while old FD repeatedly becomes
unresponsive. Potential areas: - FD-specific hardware or firmware
issue. - Revision or configuration difference.

Every result must show:

-   Observed facts.
-   Hypotheses.
-   Confidence: low / medium / high.
-   Supporting events.
-   Missing evidence.
-   Suggested next safe test.

Never present an inference as a confirmed diagnosis.

## Module 9 --- Firmware Recovery Research

Create a Firmware Recovery screen, but keep actual flashing disabled by
default.

Research steps:

1.  Identify exact hardware model and revision.
2.  Identify firmware version if exposed.
3.  Investigate official SRAM firmware update procedure.
4.  Determine whether an official recovery procedure exists for that
    exact FD model.
5.  Verify firmware image source and compatibility.
6.  Document recovery preconditions and failure modes.
7.  Only then evaluate implementation.

Safety requirements:

-   No guessed UUIDs or write commands.
-   No arbitrary firmware files.
-   No firmware for another component or generation.
-   No bootloader modification.
-   No bypass of security controls.
-   No flashing on unstable power.
-   No flashing unless compatibility is verified.
-   No success message without post-update verification.

If unsupported, display:

`Firmware recovery not yet supported — verified protocol or official procedure required.`

The app may link to official SRAM documentation and direct users to the
official SRAM AXS app/service process.

------------------------------------------------------------------------

# 9. Backend API --- Cloudflare Workers

Use a versioned REST API under `/api/v1`.

Suggested endpoints:

## Health

-   `GET /api/v1/health`

Return service status and API version. Do not expose secrets or database
credentials.

## Hardware catalog

-   `GET /api/v1/catalog/groupsets`
-   `GET /api/v1/catalog/components`
-   `GET /api/v1/catalog/models`
-   `GET /api/v1/catalog/models/:id`
-   `GET /api/v1/catalog/profiles/:id`

Catalog endpoints should support pagination and optional filters.

## User devices

-   `GET /api/v1/devices`
-   `POST /api/v1/devices`
-   `GET /api/v1/devices/:id`
-   `PATCH /api/v1/devices/:id`
-   `DELETE /api/v1/devices/:id`

Deletion should be soft-delete or require explicit confirmation if
diagnostic history depends on the device.

## Diagnostic sessions

-   `GET /api/v1/sessions`
-   `POST /api/v1/sessions`
-   `GET /api/v1/sessions/:id`
-   `PATCH /api/v1/sessions/:id`
-   `POST /api/v1/sessions/:id/complete`

## Diagnostic events

-   `POST /api/v1/sessions/:id/events/batch`
-   `GET /api/v1/sessions/:id/events`

Batch ingestion must:

-   Validate payload schema.
-   Enforce maximum batch size.
-   Use idempotent event IDs.
-   Reject malformed records.
-   Avoid duplicate writes.
-   Return accepted, rejected, and duplicate counts.
-   Use D1 batch operations where appropriate.

## GATT profiles

-   `POST /api/v1/devices/:id/gatt-profile`
-   `GET /api/v1/devices/:id/gatt-profile`
-   `GET /api/v1/gatt-profiles/:id`

## Comparison reports

-   `POST /api/v1/comparisons`
-   `GET /api/v1/comparisons`
-   `GET /api/v1/comparisons/:id`

## Sync

-   `POST /api/v1/sync/batch`
-   `GET /api/v1/sync/status`

The sync API must be idempotent and safe to retry.

Do not create a public unauthenticated write endpoint.

------------------------------------------------------------------------

# 10. Authentication and Security

The application may initially be used by one owner, but authentication
must be designed properly.

Requirements:

-   Do not embed a permanent API secret in the mobile application.
-   Use a secure authentication strategy suitable for a native app.
-   Store access/refresh tokens in Android secure storage.
-   Hash passwords if implementing password authentication.
-   Use short-lived access tokens.
-   Validate token issuer, audience, expiry, and signature.
-   Keep signing secrets in Cloudflare Worker secrets, never in source
    control.
-   Validate all incoming payloads.
-   Apply rate limiting and request-size limits.
-   Protect administrative catalog editing.
-   Restrict CORS to actual web clients if a browser client is added;
    native Android API requests are not protected by CORS.
-   Do not log access tokens, passwords, or other secrets.
-   Use TLS/HTTPS for remote API traffic.

For a private prototype, a simple owner account may be sufficient, but
it must not rely on a hardcoded shared API key shipped inside the APK.

Catalog reads may be public only if the project owner explicitly chooses
that policy. Device data, diagnostic sessions, and logs must be private
to the authenticated owner.

------------------------------------------------------------------------

# 11. Cloudflare D1 Data Model

Use SQLite-compatible SQL and versioned migrations.

Suggested tables:

## `users`

-   `id TEXT PRIMARY KEY`
-   `email TEXT UNIQUE`
-   `password_hash TEXT` (only if password auth is used)
-   `created_at TEXT`
-   `updated_at TEXT`

## `groupsets`

-   `id TEXT PRIMARY KEY`
-   `brand TEXT NOT NULL`
-   `name TEXT NOT NULL`
-   `discipline TEXT`
-   `generation_label TEXT`
-   `release_year INTEGER`
-   `verification_status TEXT`
-   `source_url TEXT`
-   `created_at TEXT`
-   `updated_at TEXT`

## `component_types`

-   `id TEXT PRIMARY KEY`
-   `name TEXT NOT NULL`
-   `description TEXT`

## `hardware_models`

-   `id TEXT PRIMARY KEY`
-   `groupset_id TEXT`
-   `component_type_id TEXT`
-   `model_number TEXT`
-   `part_number TEXT`
-   `generation TEXT`
-   `hardware_revision TEXT`
-   `fcc_id TEXT`
-   `ic_id TEXT`
-   `known_firmware TEXT`
-   `verification_status TEXT`
-   `source_url TEXT`
-   `notes TEXT`
-   `created_at TEXT`
-   `updated_at TEXT`

## `hardware_profiles`

-   `id TEXT PRIMARY KEY`
-   `hardware_model_id TEXT`
-   `profile_version INTEGER`
-   `ble_capabilities_json TEXT`
-   `gatt_profile_json TEXT`
-   `diagnostic_capabilities_json TEXT`
-   `recovery_capabilities_json TEXT`
-   `verification_status TEXT`
-   `source_notes TEXT`
-   `created_at TEXT`
-   `updated_at TEXT`

## `user_devices`

-   `id TEXT PRIMARY KEY`
-   `user_id TEXT NOT NULL`
-   `hardware_model_id TEXT`
-   `hardware_profile_id TEXT`
-   `display_name TEXT`
-   `device_role TEXT`
-   `ble_identifier TEXT`
-   `serial_number TEXT`
-   `model_number TEXT`
-   `part_number TEXT`
-   `fcc_id TEXT`
-   `ic_id TEXT`
-   `hardware_revision TEXT`
-   `firmware_version TEXT`
-   `identification_confidence TEXT`
-   `identification_notes TEXT`
-   `created_at TEXT`
-   `updated_at TEXT`
-   `deleted_at TEXT`

## `diagnostic_sessions`

-   `id TEXT PRIMARY KEY`
-   `user_id TEXT NOT NULL`
-   `device_id TEXT NOT NULL`
-   `session_type TEXT`
-   `started_at TEXT`
-   `ended_at TEXT`
-   `status TEXT`
-   `app_version TEXT`
-   `notes TEXT`
-   `created_at TEXT`

## `diagnostic_events`

-   `id TEXT PRIMARY KEY`
-   `session_id TEXT NOT NULL`
-   `device_id TEXT NOT NULL`
-   `event_type TEXT NOT NULL`
-   `observed_at TEXT`
-   `recorded_at TEXT`
-   `source TEXT`
-   `description TEXT`
-   `rssi INTEGER`
-   `connection_state TEXT`
-   `service_uuid TEXT`
-   `characteristic_uuid TEXT`
-   `raw_payload_hex TEXT`
-   `metadata_json TEXT`
-   `created_at TEXT`

## `gatt_profiles`

-   `id TEXT PRIMARY KEY`
-   `device_id TEXT NOT NULL`
-   `profile_hash TEXT`
-   `profile_json TEXT NOT NULL`
-   `discovered_at TEXT`
-   `verification_status TEXT`
-   `created_at TEXT`

## `comparison_reports`

-   `id TEXT PRIMARY KEY`
-   `user_id TEXT NOT NULL`
-   `device_a_id TEXT NOT NULL`
-   `device_b_id TEXT NOT NULL`
-   `report_json TEXT NOT NULL`
-   `created_at TEXT`

## `sync_receipts`

-   `id TEXT PRIMARY KEY`
-   `user_id TEXT NOT NULL`
-   `batch_id TEXT NOT NULL`
-   `accepted_count INTEGER`
-   `duplicate_count INTEGER`
-   `rejected_count INTEGER`
-   `received_at TEXT`
-   `UNIQUE(user_id, batch_id)`

Use foreign keys where appropriate and indexes for:

-   `user_devices.user_id`
-   `diagnostic_sessions.device_id`
-   `diagnostic_sessions.started_at`
-   `diagnostic_events.session_id`
-   `diagnostic_events.device_id`
-   `diagnostic_events.observed_at`
-   `hardware_models.model_number`
-   `hardware_models.part_number`
-   `hardware_models.fcc_id`
-   `hardware_models.ic_id`

Do not create duplicate indexes. Review query plans and actual usage.

Use SQL migrations in a `migrations/` directory. Never rely on manually
editing production D1 schema.

------------------------------------------------------------------------

# 12. Local SQLite and Offline Sync

The Android app must have local tables corresponding to the operational
records:

-   Local devices.
-   Local diagnostic sessions.
-   Local diagnostic events.
-   Local GATT profiles.
-   Local comparison reports.
-   Sync queue / outbox.
-   Sync receipts.

## Sync design

Use an offline-first outbox pattern.

1.  Create the diagnostic event locally.
2.  Assign a stable UUID.
3.  Mark it `PENDING`.
4.  Batch pending events.
5.  Upload to Worker API.
6.  Worker validates and stores the records.
7.  Worker returns per-record status.
8.  Mark accepted/duplicate records as synced.
9.  Keep rejected records with a visible reason.
10. Retry temporary failures with exponential backoff and jitter.

Never generate a new event ID for a retry.

Do not sync every RSSI sample individually. Apply configurable sampling,
local aggregation, or batch compression where useful.

Suggested sync triggers:

-   User presses Sync.
-   Internet becomes available.
-   App returns to foreground.
-   A diagnostic session completes.
-   A conservative periodic background task, if Android permits and it
    is necessary.

Do not promise uninterrupted background BLE monitoring. Android
background execution and BLE behavior vary by device and OS version.
Explain permissions, battery optimization, and foreground-service
requirements when applicable.

------------------------------------------------------------------------

# 13. Data Retention and Privacy

-   Diagnostic records belong to the user.
-   Do not upload BLE data without user consent.
-   Make cloud sync visible and configurable.
-   Provide export and delete options.
-   Do not upload contact lists, location, or unrelated phone data.
-   Do not collect precise location unless a clearly defined feature
    requires it and the user opts in.
-   Keep raw BLE payload capture optional where possible.
-   Avoid collecting serial numbers unless needed for device inventory;
    explain their use.
-   Do not use user diagnostic data for public research without explicit
    opt-in.
-   Provide a clear privacy notice.

------------------------------------------------------------------------

# 14. User Interface and UX

Design direction:

-   Minimal, polished, Apple-inspired interface.
-   Dark mode by default.
-   Charcoal/black backgrounds.
-   Neutral dark cards.
-   Green = normal.
-   Yellow = warning.
-   Red = error.
-   Gray = unknown.
-   Clear typography and generous spacing.
-   Technical but understandable labels.
-   No decorative clutter.

Main navigation:

1.  Dashboard.
2.  Devices.
3.  Diagnostics.
4.  Compare.
5.  Firmware Recovery.
6.  Logs.
7.  Hardware Catalog.
8.  Settings.

Key screens:

### Dashboard

-   Selected device.
-   Connection state.
-   Last diagnostic.
-   Pending sync count.
-   Latest findings.
-   Quick actions.

### Hardware selection wizard

-   Brand.
-   Product family.
-   Generation.
-   Component.
-   Model/part/serial/FCC/IC input.
-   Photo label capture (future).
-   Confirmation and confidence.

### Scanner

-   Scan controls.
-   Discovered devices.
-   RSSI.
-   Device details.
-   Save as device.

### Device detail

-   Hardware identity.
-   Identification confidence.
-   BLE status.
-   GATT profile.
-   Firmware/hardware info when available.
-   Diagnostic history.

### Sleep/Wake Monitor

-   Start/stop session.
-   Timeline.
-   Manual event markers.
-   RSSI and connection chart.
-   Notes.
-   Export.

### Comparison

-   Select FD A and FD B.
-   Run comparison.
-   Display differences.
-   Explain missing/unknown data.
-   Export report.

### Firmware Recovery

-   Hardware compatibility status.
-   Official documentation links.
-   Recovery feasibility.
-   Disabled state until verified.
-   Safety checklist.

### Logs

-   Filter by device, session, event type, date.
-   Search.
-   Export JSON/CSV/TXT.
-   Sync status.

------------------------------------------------------------------------

# 15. Suggested Project Structure

``` text
axs-diagnostic-lab/
├── apps/
│   └── mobile/
│       ├── android/
│       ├── src/
│       │   ├── app/
│       │   ├── navigation/
│       │   ├── bluetooth/
│       │   │   ├── BLEManager.ts
│       │   │   ├── BLEScanner.ts
│       │   │   ├── BLEConnection.ts
│       │   │   ├── GATTExplorer.ts
│       │   │   └── BLELogger.ts
│       │   ├── hardware/
│       │   │   ├── HardwareCatalog.ts
│       │   │   ├── DeviceIdentifier.ts
│       │   │   └── ProfileResolver.ts
│       │   ├── diagnostics/
│       │   │   ├── DeviceDiagnostics.ts
│       │   │   ├── SleepWakeMonitor.ts
│       │   │   ├── ConnectionMonitor.ts
│       │   │   └── DiagnosticAnalyzer.ts
│       │   ├── recovery/
│       │   │   ├── RecoveryManager.ts
│       │   │   ├── FirmwareValidator.ts
│       │   │   └── RecoverySafety.ts
│       │   ├── storage/
│       │   │   ├── LocalDatabase.ts
│       │   │   ├── DiagnosticRepository.ts
│       │   │   └── SyncOutbox.ts
│       │   ├── sync/
│       │   │   ├── SyncManager.ts
│       │   │   └── APIClient.ts
│       │   ├── screens/
│       │   ├── components/
│       │   ├── hooks/
│       │   ├── types/
│       │   └── utils/
│       └── package.json
│
├── services/
│   └── api/
│       ├── src/
│       │   ├── index.ts
│       │   ├── routes/
│       │   ├── middleware/
│       │   ├── services/
│       │   ├── repositories/
│       │   ├── validators/
│       │   └── types/
│       ├── migrations/
│       ├── test/
│       ├── wrangler.toml
│       └── package.json
│
├── packages/
│   └── shared/
│       ├── types/
│       ├── schemas/
│       └── constants/
│
├── docs/
│   ├── architecture.md
│   ├── ble-research.md
│   ├── hardware-catalog.md
│   ├── firmware-recovery-research.md
│   └── testing-protocol.md
│
├── PROJECT.md
├── README.md
└── .gitignore
```

This is a suggested monorepo layout. Adjust tooling as needed, but keep
mobile, Worker API, shared types, and documentation clearly separated.

------------------------------------------------------------------------

# 16. Development Roadmap

## Version 0.1 --- Working BLE Diagnostic Foundation

Build:

-   React Native TypeScript project.
-   Android permissions.
-   BLE scanner.
-   Device discovery.
-   Device connection.
-   GATT service/characteristic discovery.
-   Safe characteristic reads.
-   Notification subscription where supported.
-   Local SQLite storage.
-   Diagnostic event timeline.
-   JSON/CSV export.
-   Cloudflare Worker health endpoint.
-   D1 initial schema and migrations.
-   Authenticated API connection.
-   Basic batch sync.

Acceptance criteria:

-   Installs on a physical Android phone.
-   Scans for BLE devices.
-   Shows actual discovered devices.
-   Connects when permitted by the device.
-   Displays actual GATT services and characteristics.
-   Stores events locally.
-   Works without internet during a diagnostic session.
-   Syncs queued data when internet returns.
-   Exports diagnostic logs.
-   Does not send undocumented BLE writes.

## Version 0.2 --- Sleep/Wake Monitoring

Build:

-   Initial power test workflow.
-   Idle monitoring.
-   Manual wake marker.
-   User-reported unresponsive marker.
-   Connection stability monitoring.
-   Conservative RSSI sampling.
-   FD A versus FD B comparison.
-   Diagnostic report export.

Acceptance criteria:

-   Can record a full faulty FD test.
-   Can record a reference FD test.
-   Can compare both sessions.
-   Can show exactly what was observed and what was user-reported.
-   Does not claim to detect internal sleep state without evidence.

## Version 0.3 --- Universal Hardware Identification

Build:

-   SRAM groupset catalog.
-   Generation selection.
-   Component selection.
-   Manual model/part/serial/FCC/IC input.
-   Custom hardware profile.
-   BLE identification confidence.
-   Catalog sync from Worker/D1.
-   OCR label capture as a separate optional feature.

Acceptance criteria:

-   Can store multiple SRAM device families.
-   Can register unknown devices.
-   Can distinguish verified and unverified profiles.
-   Generic BLE diagnostics still work when exact model is unknown.

## Version 0.4 --- Protocol Research

Build research tooling for:

-   Advertising data comparison.
-   GATT profile comparison.
-   Notification observation.
-   Firmware/hardware metadata discovery.
-   Reproducible diagnostic sessions.
-   Research documentation and evidence links.

Acceptance criteria:

-   Every discovered UUID is sourced from actual observation or a
    reliable reference.
-   Every payload has capture context.
-   No undocumented command is sent.
-   Findings distinguish fact from hypothesis.

## Version 0.5 --- Firmware Recovery Feasibility

Research:

-   Official SRAM update workflow.
-   Exact model compatibility.
-   Official recovery documentation.
-   Firmware package provenance.
-   Bootloader/recovery behavior, if publicly documented.
-   Safe failure handling.

Only implement recovery if the procedure is verified and appropriate for
the exact hardware.

------------------------------------------------------------------------

# 17. Testing Strategy

## 17.1 Software tests

-   Unit tests for event models.
-   Unit tests for hardware identification.
-   API validation tests.
-   Worker route tests.
-   D1 repository tests.
-   Migration tests.
-   Sync idempotency tests.
-   Offline retry tests.
-   Duplicate event tests.
-   Invalid payload tests.
-   Authentication tests.

## 17.2 Physical device tests

Use:

-   Android physical phone.
-   Faulty original SRAM Force FD.
-   Known-working replacement SRAM Force FD.
-   Known-good battery.
-   Same bicycle and drivetrain setup where practical.

Test both FDs under comparable conditions.

Record:

-   Phone model and Android version.
-   App version.
-   Device identity and confidence.
-   Battery used.
-   Test start/end time.
-   Whether official SRAM AXS app is connected.
-   Whether the FD is connected to the custom app.
-   Environmental notes.
-   Exact user actions.

Avoid simultaneous connections from multiple apps if they interfere with
BLE behavior. Document whether the official SRAM app is running during
each test.

## 17.3 Safety

-   Keep the bicycle stationary and securely supported for controlled
    shifting tests.
-   Keep fingers, clothing, and tools clear of the chain and derailleur.
-   Do not conduct diagnostic experiments while riding in traffic.
-   Do not perform firmware operations while riding.
-   Do not use the working replacement FD as a firmware experiment
    target.
-   Do not flash unverified firmware.

------------------------------------------------------------------------

# 18. First Development Sprint --- Exact Tasks

Start with Version 0.1 only. Do not attempt to build every roadmap
feature at once.

### Sprint 1: Foundation

1.  Initialize repository and monorepo structure.
2.  Initialize React Native TypeScript Android app.
3.  Initialize Cloudflare Worker TypeScript project.
4.  Configure D1 binding.
5.  Configure local and remote environment variables.
6.  Add initial SQL migration.
7.  Add Worker health endpoint.
8.  Add API validation and error format.

### Sprint 2: BLE

1.  Implement Android BLE permission handling.
2.  Implement scanner.
3.  Display discovered devices.
4.  Add device detail.
5.  Implement connect/disconnect.
6.  Discover GATT services and characteristics.
7.  Implement safe read and notification subscription.
8.  Add BLE lifecycle cleanup and error handling.

### Sprint 3: Local diagnostics

1.  Add local SQLite.
2.  Create device and session repositories.
3.  Create diagnostic event repository.
4.  Implement event timeline.
5.  Add manual wake marker.
6.  Add user-reported unresponsive marker.
7.  Add JSON/CSV export.

### Sprint 4: Cloud sync

1.  Implement authentication.
2.  Implement Worker API client.
3.  Implement local outbox.
4.  Implement batch event upload.
5.  Implement idempotent server ingestion.
6.  Implement retry and sync status.
7.  Test offline-to-online sync.
8.  Add D1 quota/error handling.

### Sprint 5: Hardware profile basics

1.  Add initial SRAM catalog schema.
2.  Add manual device registration.
3.  Add model/part/FCC/IC fields.
4.  Add verified/unverified status.
5.  Register the current Force FD as an unverified/partially identified
    profile until exact model is confirmed.

------------------------------------------------------------------------

# 19. Definition of Done for Version 0.1

Version 0.1 is complete only when:

-   The Android app builds and installs on a real phone.
-   BLE scanning works on real hardware.
-   The user can select a discovered device.
-   Connection attempts and outcomes are visible.
-   GATT discovery results are displayed.
-   Safe reads and notifications work where supported.
-   Diagnostic sessions and events persist locally.
-   App can operate without network connectivity.
-   Logs can be exported.
-   Cloudflare Worker is deployed and has a health endpoint.
-   D1 migrations apply successfully.
-   Authenticated batch sync works.
-   Duplicate events are not inserted on retries.
-   Failed sync never deletes local data.
-   The UI clearly distinguishes unavailable data from errors.
-   No fake SRAM model identification or firmware recovery is presented
    as working.

------------------------------------------------------------------------

# 20. Instructions to the AI Coding Agent

Act as the senior engineering team responsible for implementing this
project.

When working from this document:

1.  Read the entire `PROJECT.md` before making architectural decisions.
2.  Treat this document as the project source of truth.
3.  Start with Version 0.1.
4.  Do not implement future firmware flashing functionality prematurely.
5.  Do not fabricate BLE UUIDs, proprietary command formats, firmware
    versions, or test results.
6.  Use actual observed hardware data.
7.  Use Cloudflare Workers and D1 for all remote database operations.
8.  Use local SQLite for offline-first diagnostic capture.
9.  Use migrations for every D1 schema change.
10. Keep secrets out of the mobile bundle and source control.
11. Keep the code modular, typed, testable, and documented.
12. Prefer small working increments over large untested code generation.
13. Run builds and tests after each meaningful milestone.
14. If a hardware capability is unknown, document it and provide a safe
    discovery step.
15. If a requirement is blocked by proprietary protocol limitations,
    explain the limitation rather than simulating success.

At the end of each development milestone, report:

-   Files created or changed.
-   Features implemented.
-   Commands to run.
-   Build/test results.
-   Physical device tests still required.
-   Known limitations.
-   Next recommended task.

Do not claim a feature works until it has been implemented and tested.

------------------------------------------------------------------------

# 21. Official Reference Links

Use official documentation as the first source for platform behavior and
limits. Re-check current limits before deployment.

### Cloudflare

-   Workers limits:
    https://developers.cloudflare.com/workers/platform/limits/
-   D1 limits: https://developers.cloudflare.com/d1/platform/limits/
-   D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
-   D1 migrations:
    https://developers.cloudflare.com/d1/reference/migrations/
-   Workers database connections:
    https://developers.cloudflare.com/workers/databases/connecting-to-databases/

### Android / BLE

-   Android Bluetooth overview:
    https://developer.android.com/develop/connectivity/bluetooth
-   Android BLE overview:
    https://developer.android.com/develop/connectivity/bluetooth/ble/ble-overview
-   Android permissions:
    https://developer.android.com/develop/connectivity/bluetooth/bt-permissions

### SRAM

-   SRAM support: https://support.sram.com/
-   SRAM AXS app: https://www.sram.com/en/sram/axs
-   SRAM product documentation: https://www.sram.com/en/service

Use official SRAM sources to verify exact model identity, firmware
compatibility, and recovery procedures. Do not treat community posts or
reverse-engineering observations as official recovery instructions.

------------------------------------------------------------------------

# FINAL PRODUCT PRINCIPLE

**AXS Diagnostic Lab is a universal, offline-first SRAM AXS diagnostic
platform with a Cloudflare Workers + D1 backend.**

It must collect real hardware evidence, support multiple SRAM groupsets
and generations through verified hardware profiles, preserve diagnostic
data locally, synchronize efficiently within Cloudflare Free-tier
limits, and only attempt firmware recovery when a safe, compatible, and
verified method exists.

**Observe first. Record accurately. Compare carefully. Diagnose
transparently. Recover safely.**
