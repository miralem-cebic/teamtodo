# Teamaufgaben – Entwicklung

Lokale Web-App (React 18, TypeScript, Vite) für Aufgabenmanagement nach dem Bedienprinzip von Asana. Läuft ohne Server per Doppelklick auf `dist/index.html` (`file://`) in Chrome und Edge und speichert über die File System Access API in einen gewählten Ordner.

## Setup

Voraussetzung: Node.js ≥ 20. Auf dem Entwicklungs-Mac liegt Node 24 LTS ohne Admin-Rechte in `~/.local/node` (PATH in `~/.zshrc`).

```bash
npm install
npm run dev        # Entwicklungsserver (http://localhost:5173)
```

Hinweis: Das Projekt liegt bewusst **nicht** in OneDrive (`node_modules` hat zehntausende Dateien). Nach OneDrive kommt nur der Build (`npm run deploy -- "<Ziel>"`).

## Skripte

| Skript | Zweck |
|---|---|
| `npm run dev` | Vite-Entwicklungsserver |
| `npm run build` | Typprüfung und Produktions-Build nach `dist/` |
| `npm run typecheck` | Nur TypeScript prüfen |
| `npm run lint` | ESLint |
| `npm test` | Unit-Tests (Vitest): Datenlogik, Repository, Persister, Gruppierung, Datumsparser |
| `npm run test:e2e` | Build + Playwright-Tests gegen `dist/index.html` per `file://` im installierten Chrome |
| `npm run check:file` | Abnahmetest Build: startet `dist/index.html` per `file://`, prüft Konsole, sicheren Kontext, API, Schrift |
| `npm run deploy -- "<Ordner>"` | `dist/` in einen Zielordner kopieren (z. B. OneDrive) |

Playwright nutzt den installierten Chrome (`channel: 'chrome'`), es werden keine Browser heruntergeladen. Mit Fenster: `HEADED=1`.

## Build für file://

Chrome blockiert unter `file://` Modul-Skripte und CORS-Anfragen. Deshalb:

- `vite.config.ts`: `format: 'iife'`, kein Code-Splitting, `base: './'`, `modulePreload: false`
- `build/fileProtocol.ts`: Vite-Plugin, das im gebauten `index.html` `type="module"`/`crossorigin` entfernt und das Skript mit `defer` lädt. Bricht den Build ab, falls `type="module"` übrig bleibt.
- Schrift Hanken Grotesk (`@fontsource`) wird als `data:`-URL ins CSS eingebettet.

## Architektur

```
src/
  main.tsx, App.tsx          Einstieg; App zeigt Onboarding oder Workspace
  app/session.ts             Startablauf: Browser prüfen → Ordner → Berechtigung → Laden → Person
  data/
    types.ts                 Datenmodell
    schema.ts                Fabriken, SCHEMA_VERSION
    migrations.ts            Migrationsschicht (pro Dateityp), Normalisierung
    repository.ts            Repository-Schnittstelle, Fehlerklassen
    fs/FsRepository.ts       Implementierung auf FileSystemDirectoryHandle
    fs/memoryFs.ts           Ordner im Speicher (Tests, ?e2e)
    fs/handleStore.ts        Ordner-Handle in IndexedDB
    persister.ts             beobachtet den Store, schreibt geänderte Entitäten (Debounce 400 ms)
    merge.ts                 feldweises Zusammenführen (Aufgaben, Projekte, Team)
    sync.ts                  SyncEngine (10 s + Fensterfokus), Übernahme fremder Änderungen
    maintenance.ts           Tagessicherung (14), Aufräumen nach 30 Tagen, Wiederherstellen
    fs/storageFs.ts          Ordner in localStorage (E2E: zwei Fenster teilen sich einen Ordner)
    seed.ts                  Beispieldaten
  store/
    appStore.ts              Zustand (zustand) + alle Aktionen, Undo-Stack, Panel, Fokus
    selectors.ts             Sichtbarkeit, Hierarchie, Gruppierung, Filter, Sortierung (rein, getestet)
    prefs.ts                 Einstellungen pro Browser (localStorage)
  features/                  onboarding, workspace, shell (Sidebar/Header/Toolbar/DataDialog), list, board,
                             task-panel (Feed, Anhänge, Follower), inbox, dnd, keys
  components/                Popover/Menü, Personen-/Datumsauswahl, Felder, Toast, Dialog, Avatar, Icon
  hooks/listNav.ts           DOM-Helfer für Tastaturnavigation
  styles/                    tokens.css, base.css, components.css (aus dem Prototyp), app.css
```

### Datenfluss

1. UI ruft Aktionen in `store/appStore.ts` auf. Sie ändern den Zustand sofort (optimistisch) und unveränderlich (neue Objekte).
2. `Persister` vergleicht Objekt-Referenzen zwischen altem und neuem Zustand und reiht geänderte Aufgaben, `projects.json`, `users.json` ein. Bereits gespeicherte Objekte stehen in einem `WeakSet`.
3. Nach 400 ms Ruhe schreibt er über das `Repository`. Status → `save` im Store → Kopfzeile.
4. Fehler bleiben in der Warteschlange; Notfallkopie in `localStorage` (`teamaufgaben.unsaved.v1`), beim nächsten Start wiederhergestellt.

### Synchronisation und Zusammenführen

- `FsRepository.known` merkt sich `lastModified` jeder gelesenen/geschriebenen Datei.
- **Schreiben** (`writeChecked`): Ist die Datei neuer als bekannt, wird sie gelesen und mit `merge.ts` zusammengeführt; geschrieben wird das Ergebnis. Der Persister übernimmt es in den Store (`integrateWrittenTask`).
- **Abgleich** (`SyncEngine.poll`, alle 10 s, bei `focus`/`visibilitychange`): wartet auf laufende Schreibvorgänge, liest nur geänderte Dateien (`pullChanges`), erkennt entfernte Aufgaben und Konfliktkopien. `applyChanges`: Ist die lokale Aufgabe „sauber“, wird sie ersetzt; hat sie ungespeicherte Änderungen, wird zusammengeführt und danach geschrieben. Sichtbar geänderte Zeilen leuchten kurz auf (`flash`).
- **Aufgaben:** pro Feld gewinnt der neuere `fieldUpdatedAt`-Wert (Gleichstand: lokal). Kommentare, Aktivitäten, Anhänge werden nach ID vereinigt; `removedAt`/`deletedAt` bleiben gesetzt.
- **Projekte:** Projektfelder nach `updatedAt` des Projekts, Bereiche einzeln nach ihrem `updatedAt`. Bereichsänderungen berühren das `updatedAt` des Projekts nicht.
- **Team:** Vereinigung nach ID, neuerer Eintrag gewinnt.

### Pflege

- `dailyBackup`: wenn `workspace.lastBackupDate` ≠ heute → `backups/JJJJ-MM-TT.json` (Komplettstand ohne Anhänge), ältere als die 14 neuesten werden entfernt.
- `purge`: höchstens einmal pro Tag; entfernt Aufgabendateien (samt `attachments/<id>`), deren `deletedAt` (oder das ihrer Hauptaufgabe/ihres Projekts) älter als 30 Tage ist, sowie alte Bereiche, Projekte und entfernte Anhänge.
- `restoreBackup`: sichert vorher (`vor-wiederherstellung-…`), setzt alle Felder mit neuem Zeitstempel (gewinnt beim Zusammenführen), löscht (weich) Aufgaben/Projekte, die es in der Sicherung nicht gab.

### Drag and Drop

`features/dnd/TaskDnd.tsx` (dnd-kit, Maus und Touch). IDs: `t:<id>` Aufgabe, `p:<id>` Unteraufgabe im Panel, `s:<id>` Bereich, `g:<key>` Gruppenende/Spalte. Davor/danach wird aus der echten Zeigerposition und der aktuellen Lage des Ziels berechnet (nicht aus dnd-kit-Deltas, die Auto-Scroll enthalten). Ablegen in eine andere Gruppe wendet `group.apply` an; Gruppen mit `apply: null` (Überfällig) lehnen ab. Tastatur: Strg/⌘+Umschalt+↑/↓.

### Eingang

`features/inbox/inbox.ts` leitet Einträge aus `activity` (zugewiesen, erledigt bei gefolgten Aufgaben) und `comments` (Erwähnung, Kommentar bei gefolgten Aufgaben) der letzten 30 Tage ab, jeweils nur Handlungen anderer. Gelesen-Status: `localStorage` `teamaufgaben.inbox.<workspaceId>.<userId>` (`readBefore` + IDs).

### Wichtige Regeln

- **Entwürfe:** Neue leere Zeilen haben `draft: true` und werden nie geschrieben. Erst mit Titel entsteht die Datei.
- **Weiches Löschen:** `deletedAt` statt Datei löschen (Aufgaben, Bereiche, Projekte). Endgültig entfernt nach 30 Tagen (`maintenance.ts`).
- **`fieldUpdatedAt`:** Jede Änderung eines zusammenführbaren Feldes setzt den Zeitstempel des Feldes. Grundlage für den feldweisen Merge.
- **Undo:** Einträge speichern den vorherigen Stand der betroffenen Aufgaben/Projekte; beim Rückgängigmachen werden geänderte Felder mit neuem Zeitstempel zurückgesetzt, Kommentare und Aktivität bleiben erhalten.
- **Fokus:** `requestFocus(id, scope)` + `claimFocus()`: jede Anfrage wirkt genau einmal (Zeilen, die in eine andere Gruppe umziehen, ziehen den Fokus nicht erneut an).
- **Wer bin ich:** pro Browser in `localStorage` (`teamaufgaben.me.<workspaceId>`), nicht im geteilten Ordner.

## Datenformat (Schema-Version 1)

```
<Datenordner>/
  workspace.json   { schemaVersion, id, name, createdAt, lastBackupDate, lastPurgeAt }
  users.json       { schemaVersion, users: User[] }
  projects.json    { schemaVersion, projects: Project[] }   Bereiche stecken im Projekt (sections[])
  tasks/<uuid>.json  Task (eine Datei pro Haupt- oder Unteraufgabe)
  attachments/<taskId>/<datei>
  backups/<JJJJ-MM-TT>.json
```

Typen: siehe `src/data/types.ts`. Wichtige Felder einer Aufgabe:

| Feld | Bedeutung |
|---|---|
| `parentId` | Hauptaufgabe (Unteraufgaben, mehrstufig) |
| `projectId`, `sectionId` | Projekt und Bereich; ohne Projekt nur in „Meine Aufgaben“; Unteraufgaben ohne Bereich |
| `status` | `todo` / `doing` / `waiting` |
| `completedAt` | gesetzt = erledigt (Status bleibt fürs Wiederöffnen) |
| `order` | fraktionaler Index innerhalb der Geschwister bzw. des Bereichs |
| `dueDate`, `dueTime` | `JJJJ-MM-TT`, optional `HH:MM` |
| `activity[]` | Typ + Daten (Text entsteht bei der Anzeige) |
| `fieldUpdatedAt` | Zeitstempel je Feld für den Merge |
| `tags`, `recurrence` | reserviert für später |

Konfliktkopien von OneDrive (Dateiname ist keine UUID, z. B. `<uuid>-LAPTOP-1.json`, `users-MacBook.json`) werden beim Laden ignoriert und gezählt. Hilfsdateien (`*.crswap`, `.DS_Store`, `~$…`) werden übersprungen.

### Migration

Neue Schema-Version: `SCHEMA_VERSION` in `data/schema.ts` erhöhen und in `data/migrations.ts` für jeden betroffenen Dateityp `{ from: n, up(raw) }` ergänzen. Dateien werden beim Lesen hochmigriert und beim nächsten Schreiben in der neuen Version gespeichert. Dateien aus einer neueren Version blockieren den Start mit einem Hinweis.

## Tests

- **Unit** (`tests/unit`): Repository, Migrationen, Store-Aktionen inkl. Undo, Gruppierung, Persister inkl. Fehlerfall, Datumsparser, Zusammenführen, zwei Clients auf einem Ordner (Konfliktschreiben, Änderungserkennung), Anhänge, Sicherungen, Aufräumen, Wiederherstellen.
- **E2E** (`tests/e2e`): echter Build unter `file://`. Abgedeckt: fünf Aufgaben + drei Unteraufgaben nur per Tastatur; Panel ohne Seitenwechsel und Scroll-Verlust; Rückgängig; Neuladen; Projekte/Bereiche; **zwei Fenster sehen gegenseitig Änderungen innerhalb von 10 s**; **gleichzeitige Änderungen an verschiedenen Feldern bleiben erhalten**; Kommentar mit @Erwähnung → Eingang; Anhänge; Filter/Gruppierung/Sortierung; Drag and Drop (Liste, Bereiche, Board, Ablehnung „Überfällig“); Board mit Enter-Kette; Sicherung wiederherstellen.

Testmodus `?e2e`: Ersetzt den nativen Ordnerdialog durch einen Ordner in `localStorage` (`data/fs/storageFs.ts`). Mehrere Fenster desselben Browserprofils teilen ihn, so lässt sich der Mehrbenutzerbetrieb testen. `window.__e2e` stellt `flush()`, `sync()` und `repo()` bereit. `?poll=ms` verkürzt den Abgleich. Nur über den URL-Parameter aktiv.
