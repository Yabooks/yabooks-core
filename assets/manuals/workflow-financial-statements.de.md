# Arbeitsablauf: Jahresabschluss vor der Veröffentlichung prüfen

Bevor ein Jahresabschluss unterzeichnet, beim Firmenbuch eingereicht oder Banken und Investoren übergeben wird, sollte jede Zahl überprüft sein.
Diese Seite führt dich durch eine systematische Prüfung in YaBooks und endet mit dem Sperren des Geschäftsjahres, damit sich die veröffentlichten Zahlen nicht mehr ändern können.

## 1. Vorbereiten

1. [Wähle das Unternehmen aus](getting-started.de#ein-unternehmen-auswahlen).
2. Öffne die [Salden](balances.de) und setze **Von** auf den ersten und **Bis** auf den letzten Tag des Geschäftsjahres (die Voreinstellung, wenn das Jahr gerade geendet hat).
3. Stelle sicher, dass alle [Monatsabschlüsse](workflow-monthly.de#monatsabschluss) des Jahres erledigt sind.

## 2. Vollständigkeit

| Prüfung | Vorgehen |
| --- | --- |
| Keine Entwürfe mehr im Jahr | Der gelbe Balken für [ungebuchte Belege](balances.de#ungebuchte-belege) darf nicht erscheinen. Falls doch: anklicken und jeden Entwurf buchen oder löschen. |
| Alle Belege des Jahres erfasst | Vergleiche die letzten internen Belegnummern je [Belegart](documents.de#belegarten) mit deinem Rechnungsnummernkreis; filtere nach Art und Datum. |
| Abschlussbuchungen gebucht | Abschreibungen, Rechnungsabgrenzungen, Rückstellungen, Bestandsveränderungen, Abschlussbuchungen für alternative Bücher. Erfasse sie in einem `UB`-Beleg zum Bilanzstichtag. |

## 3. Bilanzkonten

Gehe jedes Bilanzkonto durch und bestätige seinen Saldo mit Nachweisen über [Kontoabstimmungen](balances.de#kontoabstimmung):

| Konto | Nachweis |
| --- | --- |
| Bank und Kassa | Kontoauszüge und Kassabericht zum Bilanzstichtag |
| Forderungen | Offene-Posten-Liste (📋 neben dem Konto) – jeder **offen**-Posten muss eine tatsächlich unbezahlte Rechnung sein; Einbringlichkeit prüfen |
| Verbindlichkeiten | Offene-Posten-Liste, Saldenbestätigungen wichtiger Lieferanten |
| Umsatzsteuer und andere Steuern | Umsatzsteuervoranmeldungen und Kontoauszüge des Finanzamts |
| Anlagevermögen | Anlagenverzeichnis, Abschreibungspläne |
| Rechnungsabgrenzungen | Liste der [Abgrenzungen](general-ledger.de#abgrenzen), die ins Folgejahr reichen |
| Kredite | Kreditkontoauszüge der Bank |
| Eigenkapital | Firmenbuch, Gesellschafterbeschlüsse |

Für jedes Konto:

1. Klicke auf 🤔 neben dem Konto.
2. Gib den Betrag laut Nachweis und einen Kommentar ein und hänge den Nachweis als Beleg an.
3. Klicke auf ✅ **Bestätigen**, wenn er übereinstimmt, sonst auf ❌ **Ablehnen**.

Fahre fort, bis jedes Konto ✅ zeigt. Konten mit ⁉️ wurden nach der Bestätigung geändert – stelle im [Hauptbuch](general-ledger.de) fest, was gebucht wurde, und bestätige erneut.

## 4. Gewinn- und Verlustrechnung

* Vergleiche Erträge und Aufwendungen mit dem Vorjahr: Setze in einem zweiten Browser-Tab den Zeitraum auf das Vorjahr. Erkläre jede wesentliche Abweichung.
* Prüfe auffällige Konten mit 📋 auf Fehlbuchungen, z. B. Privataufwand oder als Aufwand gebuchte Anlagenzugänge.
* Wenn du [Kostenstellen](accounts.de#kostenstellen) verwendest, prüfe die plausible Verteilung der Kosten.

## 5. Alternative Bücher

Verwendet das Unternehmen [alternative Bücher](document-editor.de#alternative-bucher), z. B. `Steuer` für die Steuerbilanz, prüfe, dass alle Abweichungen zwischen den Büchern erfasst sind (z. B. abweichende Abschreibung oder nicht abzugsfähige Aufwände).

## 6. Korrekturen

Wenn du einen Fehler findest:

* Bei Belegen in einem **offenen** Zeitraum: Korrigiere den Beleg im [Beleg-Editor](document-editor.de) und speichere.
* Bei bereits gemeldeten Buchungen oder solchen in einem **gesperrten** Zeitraum: [Storniere](general-ledger.de#stornieren) die Buchung und erfasse die richtige in einem offenen Zeitraum.
* Klicke danach in den Salden auf 🔄 **Aktualisieren** und bestätige die betroffenen Abstimmungen erneut.

## 7. Drucken und archivieren

1. Klicke in den Salden auf 🖨️ **Drucken** und speichere die Salden als PDF.
2. Lade das PDF und den unterzeichneten Jahresabschluss als Belege des Unternehmens hoch, z. B. mit Belegart `JA`, damit sie gemeinsam mit den Büchern archiviert sind.

## Geschäftsjahr sperren

Sobald der Jahresabschluss endgültig ist, sperre das Jahr, damit sich seine gebuchten Zahlen nicht mehr ändern können:

1. Öffne **Personen**, die besitzende Organisation, und klicke auf ✏️ neben dem Unternehmen.
2. Setze **Gesperrt bis** auf den letzten Tag des Geschäftsjahres, z. B. 31. Dezember.
3. Klicke auf **Speichern**.

Ab jetzt können Buchungen mit einem Datum im gesperrten Zeitraum nicht mehr gebucht, geändert oder gelöscht werden; Entwürfe im Zeitraum können nicht gebucht werden. Korrekturen sind nur noch durch Buchungen in einem offenen Zeitraum möglich.

> ⚠️ **Achtung:** Nur Benutzer mit der Berechtigung *Periode sperren* können sperren, und nur Benutzer mit *Periode entsperren* können das Datum zurücksetzen (siehe [Rollen](settings.de#rollen)). Entsperre ein veröffentlichtes Jahr nur in Ausnahmefällen und dokumentiere den Grund; jede Änderung wird im [Prüfprotokoll](settings.de#protokolle) festgehalten.

## Verwandte Themen

* [Salden](balances.de)
* [Hauptbuch](general-ledger.de)
* [Laufende Buchhaltung und Monatsabschluss](workflow-monthly.de)
