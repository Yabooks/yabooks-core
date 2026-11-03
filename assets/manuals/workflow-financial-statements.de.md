# Arbeitsablauf: Jahresabschluss vor der Veröffentlichung prüfen

Bevor ein Jahresabschluss unterzeichnet, beim Firmenbuch eingereicht oder Banken und Investoren übergeben wird, sollte jede Zahl überprüft sein.
Diese Seite führt Sie durch eine systematische Prüfung in YaBooks und endet mit dem Sperren des Geschäftsjahres, damit sich die veröffentlichten Zahlen nicht mehr ändern können.

## 1. Vorbereiten

1. [Wählen Sie das Unternehmen aus](getting-started.de#ein-unternehmen-auswahlen).
2. Öffnen Sie die [Salden](balances.de) und setzen Sie **Von** auf den ersten und **Bis** auf den letzten Tag des Geschäftsjahres (die Voreinstellung, wenn das Jahr gerade geendet hat).
3. Stellen Sie sicher, dass alle [Monatsabschlüsse](workflow-monthly.de#monatsabschluss) des Jahres erledigt sind.

## 2. Vollständigkeit

| Prüfung | Vorgehen |
| --- | --- |
| Keine Entwürfe mehr im Jahr | Der gelbe Balken für [ungebuchte Belege](balances.de#ungebuchte-belege) darf nicht erscheinen. Falls doch: anklicken und jeden Entwurf buchen oder löschen. |
| Alle Belege des Jahres erfasst | Vergleichen Sie die letzten internen Belegnummern je [Belegart](documents.de#belegarten) mit Ihrem Rechnungsnummernkreis; filtern Sie nach Art und Datum. |
| Abschlussbuchungen gebucht | Abschreibungen, Rechnungsabgrenzungen, Rückstellungen, Bestandsveränderungen, Abschlussbuchungen für alternative Bücher. Erfassen Sie sie in einem `UB`-Beleg zum Bilanzstichtag. |

## 3. Bilanzkonten

Gehen Sie jedes Bilanzkonto durch und bestätigen Sie seinen Saldo mit Nachweisen über [Kontoabstimmungen](balances.de#kontoabstimmung):

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

1. Klicken Sie auf 🤔 neben dem Konto.
2. Geben Sie den Betrag laut Nachweis und einen Kommentar ein und hängen Sie den Nachweis als Beleg an.
3. Klicken Sie auf ✅ **Bestätigen**, wenn er übereinstimmt, sonst auf ❌ **Ablehnen**.

Fahren Sie fort, bis jedes Konto ✅ zeigt. Konten mit ⁉️ wurden nach der Bestätigung geändert – stellen Sie im [Hauptbuch](general-ledger.de) fest, was gebucht wurde, und bestätigen Sie erneut.

## 4. Gewinn- und Verlustrechnung

* Vergleichen Sie Erträge und Aufwendungen mit dem Vorjahr: Setzen Sie in einem zweiten Browser-Tab den Zeitraum auf das Vorjahr. Erklären Sie jede wesentliche Abweichung.
* Prüfen Sie auffällige Konten mit 📋 auf Fehlbuchungen, z. B. Privataufwand oder als Aufwand gebuchte Anlagenzugänge.
* Wenn Sie [Kostenstellen](accounts.de#kostenstellen) verwenden, prüfen Sie die plausible Verteilung der Kosten.

## 5. Alternative Bücher

Verwendet das Unternehmen [alternative Bücher](document-editor.de#alternative-bucher), z. B. `Steuer` für die Steuerbilanz, prüfen Sie, dass alle Abweichungen zwischen den Büchern erfasst sind (z. B. abweichende Abschreibung oder nicht abzugsfähige Aufwände).

## 6. Korrekturen

Wenn Sie einen Fehler finden:

* Bei Belegen in einem **offenen** Zeitraum: Korrigieren Sie den Beleg im [Beleg-Editor](document-editor.de) und speichern Sie.
* Bei bereits gemeldeten Buchungen oder solchen in einem **gesperrten** Zeitraum: [Stornieren](general-ledger.de#stornieren) Sie die Buchung und erfassen Sie die richtige in einem offenen Zeitraum.
* Klicken Sie danach in den Salden auf 🔄 **Aktualisieren** und bestätigen Sie die betroffenen Abstimmungen erneut.

## 7. Drucken und archivieren

1. Klicken Sie in den Salden auf 🖨️ **Drucken** und speichern Sie die Salden als PDF.
2. Laden Sie das PDF und den unterzeichneten Jahresabschluss als Belege des Unternehmens hoch, z. B. mit Belegart `JA`, damit sie gemeinsam mit den Büchern archiviert sind.

## Geschäftsjahr sperren

Sobald der Jahresabschluss endgültig ist, sperren Sie das Jahr, damit sich seine gebuchten Zahlen nicht mehr ändern können:

1. Öffnen Sie **Personen**, die besitzende Organisation, und klicken Sie auf ✏️ neben dem Unternehmen.
2. Setzen Sie **Gesperrt bis** auf den letzten Tag des Geschäftsjahres, z. B. 31. Dezember.
3. Klicken Sie auf **Speichern**.

Ab jetzt können Buchungen mit einem Datum im gesperrten Zeitraum nicht mehr gebucht, geändert oder gelöscht werden; Entwürfe im Zeitraum können nicht gebucht werden. Korrekturen sind nur noch durch Buchungen in einem offenen Zeitraum möglich.

> ⚠️ **Achtung:** Nur Benutzer mit der Berechtigung *Periode sperren* können sperren, und nur Benutzer mit *Periode entsperren* können das Datum zurücksetzen (siehe [Rollen](settings.de#rollen)). Entsperren Sie ein veröffentlichtes Jahr nur in Ausnahmefällen und dokumentieren Sie den Grund; jede Änderung wird im [Prüfprotokoll](settings.de#protokolle) festgehalten.

## Verwandte Themen

* [Salden](balances.de)
* [Hauptbuch](general-ledger.de)
* [Laufende Buchhaltung und Monatsabschluss](workflow-monthly.de)
