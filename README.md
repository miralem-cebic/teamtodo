# Teamaufgaben – Anleitung

Teamaufgaben ist ein Aufgabenwerkzeug für unser Marketing-Team. Es läuft direkt im Browser, braucht keinen Server und keine Internetverbindung. Alle Daten liegen als Dateien in einem gemeinsamen Ordner, zum Beispiel auf OneDrive.

> Stand: Phase 2. Der Kalender und ein Projekt-Dashboard folgen in Phase 3.

## App öffnen

1. Öffne den Ordner mit der App (darin liegen `index.html` und der Ordner `assets`).
2. Doppelklick auf **`index.html`**.
3. Die App öffnet sich in deinem Standardbrowser. Sie funktioniert nur in **Google Chrome** und **Microsoft Edge**. Ist ein anderer Browser dein Standard: Rechtsklick auf `index.html` → „Öffnen mit“ → Chrome oder Edge.

Tipp: Lege dir ein Lesezeichen auf die geöffnete Seite, dann geht es beim nächsten Mal schneller.

## Datenordner verbinden

Beim ersten Start fragt die App nach dem **Datenordner**. Das ist der Ordner, in dem eure Aufgaben gespeichert werden.

- Alle im Team wählen **denselben** Ordner, zum Beispiel einen geteilten OneDrive-Ordner „Teamaufgaben“.
- Ist der Ordner leer, legt die App ihre Dateien an. Auf Wunsch mit Beispieldaten zum Ausprobieren.
- Enthält der Ordner schon andere Dateien, schlägt die App einen Unterordner „Teamaufgaben“ vor.

Bei jedem weiteren Start zeigt die App **„Weiter mit Ordner …“**. Ein Klick genügt. Der Browser fragt aus Sicherheitsgründen einmal pro Sitzung nach, ob die App auf den Ordner zugreifen darf. Bestätige mit „Zulassen“.

**Wichtig bei OneDrive:** Klicke im Finder bzw. Explorer mit der rechten Maustaste auf den Datenordner und wähle **„Immer auf diesem Gerät behalten“**. Sonst muss OneDrive die Dateien erst herunterladen und die App startet langsamer.

## Team einrichten

- Beim ersten Start wählst du aus, **wer du bist**. Fehlt dein Name, legst du dich direkt an.
- Diese Auswahl gilt nur für deinen Browser. Ändern kannst du sie unten links (Klick auf deinen Namen → „Person wechseln“).
- Weitere Personen entstehen automatisch, wenn du im Personenfeld einen neuen Namen eingibst und „… zum Team hinzufügen“ wählst.

## Arbeiten mit Aufgaben

- **Aufgabe anlegen:** Titel tippen, **Enter**, nächste Aufgabe tippen. Kein Formular, kein Speichern-Knopf.
- **Person und Datum:** Klick auf das Feld in der Zeile oder **Alt + P** (Person), **Alt + D** (Datum). Im Datumsfeld kannst du auch tippen: „morgen“, „fr“, „12.10.“, „+3“.
- **Erledigt:** Klick auf den Kreis vor dem Titel oder **Strg + Enter** (Mac: ⌘ + Enter).
- **Details:** Klick auf die Zeile oder **Strg + O**. Rechts öffnet sich die Detailansicht mit Beschreibung und Unteraufgaben. Die Liste bleibt sichtbar.
- **Unteraufgaben:** In der Detailansicht unter „Unteraufgaben“ oder mit **Alt + S** in der Zeile. Jede Unteraufgabe hat eine eigene Person und ein eigenes Datum.
- **Bereiche:** In einem Projekt gliedern Bereiche die Aufgaben. „Bereich hinzufügen“ unter dem letzten Bereich. Umbenennen per Doppelklick auf den Namen.
- **Meine Aufgaben** zeigt alles, was dir zugewiesen ist, aus allen Projekten, sortiert nach Fälligkeit.

### Verschieben per Drag and Drop

Am linken Rand jeder Zeile erscheint beim Darüberfahren ein Griff (⋮⋮). Damit ziehst du Aufgaben innerhalb eines Bereichs an eine andere Stelle oder in einen anderen Bereich. Bereiche selbst verschiebst du am Griff neben dem Bereichsnamen, Unteraufgaben in der Detailansicht genauso. Ziehst du in „Meine Aufgaben“ eine Aufgabe nach „Heute“, bekommt sie das heutige Datum. In „Überfällig“ kann man nichts ablegen.

### Board, Filter, Sortieren, Gruppieren

- **Liste oder Board:** oben umschalten oder Taste **L** bzw. **B**. Im Board sind die Spalten die aktuelle Gruppierung (im Projekt standardmäßig die Bereiche). Karten ziehst du in eine andere Spalte.
- **Filter:** nach verantwortlicher Person, Fälligkeit und Status. Aktive Filter sind farbig markiert, das kleine × setzt sie zurück.
- **Sortieren** nach Fälligkeit, Titel, Person oder Erstellung. Eigene Reihenfolge per Ziehen gibt es nur bei „Manuell“.
- **Gruppieren** nach Bereich, Person, Fälligkeit, Status oder Projekt.
- „Offene / Alle / Erledigte Aufgaben“ blendet Erledigtes ein oder aus.

### Kommentare, Anhänge, Follower

- **Kommentare** schreibst du unten in der Detailansicht. Mit **@** und den ersten Buchstaben erwähnst du jemanden. Senden mit **Strg + Enter** (Mac: ⌘ + Enter).
- **Anhänge:** „Datei anhängen“ oder Dateien einfach in den Bereich „Anhänge“ ziehen. Die Datei wird in den Datenordner kopiert (`attachments`). Ein Klick öffnet sie.
- **Follower** werden über Kommentare zu einer Aufgabe informiert. Wer eine Aufgabe anlegt, zugewiesen bekommt, kommentiert oder erwähnt wird, folgt automatisch.
- **Verlauf:** Unter „Kommentare und Aktivität“ steht, wer wann was geändert hat. „Nur Kommentare zeigen“ blendet die Änderungen aus.

### Eingang

Im **Eingang** siehst du, was andere für dich getan haben: dir eine Aufgabe zugewiesen, dich erwähnt, eine Aufgabe kommentiert oder erledigt, der du folgst. Ungelesenes ist mit einem Punkt markiert, die Zahl steht in der Navigation. Taste **G**, dann **I** springt hin.

### Zusammenarbeit im Team

Die App gleicht sich alle 10 Sekunden und beim Zurückkehren ins Fenster mit dem Datenordner ab. Änderungen anderer erscheinen ohne Neuladen, die Zeile leuchtet kurz auf. Ändern zwei Personen gleichzeitig dieselbe Aufgabe, führt die App die Änderungen Feld für Feld zusammen: Wer den Titel ändert und wer das Datum ändert, behalten beide recht. Nur wenn beide dasselbe Feld ändern, gewinnt die spätere Änderung. Kommentare gehen nie verloren.

### Rückgängig statt Nachfragen

Erledigen, Löschen, Verschieben und Weitergeben passiert sofort. Unten erscheint ein Hinweis mit **„Rückgängig“**. Alternativ **Strg + Z** (Mac: ⌘ + Z), solange kein Eingabefeld aktiv ist.

### Speichern

Die App speichert jede Änderung automatisch. Oben rechts steht „Speichert …“ bzw. „Gespeichert“. Erscheint dort eine rote Meldung:

- **„Kein Zugriff auf den Ordner.“** → auf **„Erneut verbinden“** klicken und den Zugriff erlauben.
- **„Datenordner nicht gefunden.“** → Wurde der Ordner verschoben oder umbenannt? Unten links → „Anderen Datenordner wählen“.

Bis das Speichern wieder klappt, hält die App deine Änderungen fest. Schließe das Fenster in dieser Zeit nicht.

## Tastenkürzel

Die vollständige Liste zeigt die App mit der Taste **?**.

| Taste | Wirkung |
|---|---|
| Enter | Aufgabe speichern, neue Zeile darunter |
| Strg/⌘ + Enter | Erledigt / wieder öffnen |
| ↑ / ↓ | Vorherige / nächste Aufgabe |
| Strg/⌘ + Umschalt + ↑ / ↓ | Aufgabe verschieben |
| Tab | Zum nächsten Feld (Person, Datum, Status) |
| Alt + P / Alt + M / Alt + D | Person wählen / Mir zuweisen / Datum wählen |
| Alt + S | Unteraufgabe anlegen |
| Esc | Eingabe verlassen. Danach: ↑/↓ wählt Zeilen, Leertaste öffnet Details, Entf löscht |
| N | Neue Aufgabe |
| / | Suche |
| G, dann M | Zu „Meine Aufgaben“ |
| G, dann I | Zum Eingang |
| L / B | Liste / Board |
| Strg/⌘ + Z | Rückgängig |
| ? | Alle Tastenkürzel |

Auf dem Mac ist Alt die Taste ⌥ (Option).

## Daten sichern und wiederherstellen

Alle Daten liegen als Dateien im Datenordner:

```
Teamaufgaben/
  workspace.json   Name und Version
  users.json       Team
  projects.json    Projekte und Bereiche
  tasks/           eine Datei pro Aufgabe
  attachments/     Anhänge, ein Ordner pro Aufgabe
  backups/         tägliche Sicherungen
```

- **Automatisch:** Wer die App als Erste oder Erster am Tag öffnet, legt eine Komplettsicherung in `backups` an. Die letzten 14 bleiben erhalten.
- **Wiederherstellen:** Navigation → **Daten und Sicherungen** → bei der gewünschten Sicherung „Wiederherstellen …“. Der aktuelle Stand wird vorher noch einmal gesichert, ein Fehlgriff lässt sich also rückgängig machen. Anhänge sind in den Sicherungen nicht enthalten, sie bleiben im Ordner `attachments`.
- **Zusätzlich:** Den ganzen Datenordner gelegentlich als ZIP kopieren. OneDrive bewahrt außerdem frühere Versionen jeder Datei auf (Rechtsklick → „Versionsverlauf“).
- **Gelöschte Aufgaben** bleiben zunächst als Datei erhalten und werden erst nach 30 Tagen endgültig entfernt.

## Bekannte Grenzen

- **Nur Chrome und Edge.** Safari und Firefox können nicht direkt in Ordner schreiben.
- **Einmal pro Sitzung bestätigen.** Der Browser fragt bei jedem Start nach dem Ordnerzugriff.
- **OneDrive-Konflikte:** Speichern zwei Rechner dieselbe Datei im selben Moment, legt OneDrive manchmal eine Konfliktkopie an (z. B. `…-LAPTOP-123.json`). Die App ignoriert solche Kopien und zeigt unten links einen Hinweis. Unter „Daten und Sicherungen“ stehen die Dateinamen. Sie können im Datenordner gelöscht werden.
- **Verzögerung durch OneDrive:** Die App sieht Änderungen anderer erst, wenn OneDrive sie auf deinen Rechner geladen hat. Das dauert meist Sekunden, manchmal länger.
- **Uhrzeit des Rechners:** Bei gleichzeitigen Änderungen gewinnt die neuere. Geht die Uhr eines Rechners stark falsch, kann das die Reihenfolge verfälschen.
- **Gelesen-Markierungen im Eingang** gelten nur für den Browser, in dem du sie gesetzt hast.
- **Drag and Drop per Tastatur:** Statt zu ziehen verschiebst du mit Strg/⌘ + Umschalt + ↑/↓. In einen anderen Bereich geht es über das Bereichsfeld der Zeile.
