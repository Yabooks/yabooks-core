# Arbeitsablauf: Ein neues Unternehmen einrichten

Folgen Sie diesen Schritten, wenn Sie beginnen, die Bücher eines neuen Unternehmens in YaBooks zu führen – egal ob neu gegründet oder aus einem anderen System übernommen.
Planen Sie etwa eine Stunde ein; der Großteil entfällt auf den Kontenplan.

## Checkliste

| Schritt | Erledigt in | Erforderlich |
| --- | --- | --- |
| 1. Besitzende Organisation anlegen | [Personen](people.de) | ja |
| 2. Unternehmen anlegen und auswählen | [Personen → Unternehmen](people.de#unternehmen) | ja |
| 3. Steuercodes prüfen | [Einstellungen → Steuercodes](settings.de#steuercodes) | wenn steuerpflichtig |
| 4. Kontenplan einrichten | [Konten](accounts.de) | ja |
| 5. Kostenstellen einrichten | [Konten → Kostenstellen](accounts.de#kostenstellen) | optional |
| 6. Eröffnungsbilanz buchen | [Beleg-Editor](document-editor.de) | bei Systemwechsel |
| 7. Kollegen und Apps Zugriff geben | [Einstellungen → Benutzer](settings.de#benutzer), [Apps](apps.de) | optional |
| 8. Ergebnis prüfen | [Salden](balances.de) | ja |

## 1. Besitzende Organisation anlegen

1. Öffnen Sie **Personen**, klicken Sie auf **+** und wählen Sie **Neue Organisation** (bzw. **Neue Privatperson** bei Einzelunternehmen).
2. Geben Sie den rechtlichen Namen ein und speichern Sie.
3. Klicken Sie auf ✏️ und ergänzen Sie Firmenbuchnummer und Rechtsordnung (z. B. `AT`).
4. Ergänzen Sie **Kontaktmöglichkeiten** mit der Adresse des Sitzes, die **Bankverbindungen** und die **Unternehmens- und Steuerregistrierungen**, z. B. `AT-UID` = `ATU12345678`.

Das Sitzland ist wichtig: Die [Schnellbuchungsfunktion](quick-recorder.de#angabe-von-umsatzsteuer) bevorzugt Steuercodes dieses Landes.

## 2. Unternehmen anlegen und auswählen

1. Klicken Sie im Feld **Unternehmen** der Organisation auf **+**.
2. Geben Sie **Name** und **Währung** der Bücher ein.
3. Legen Sie das Ende des Wirtschaftsjahres mit **Abschlussmonat** und **Abschlusstag** fest.
4. Benötigen Sie zusätzliche Bücher, z. B. für eine von der Unternehmensbilanz abweichende Steuerbilanz, fügen Sie sie unter **Alternative Bücher** hinzu (z. B. `Steuer`).
5. Lassen Sie **Gesperrt bis** vorerst leer und klicken Sie auf **Speichern**.
6. Klicken Sie auf 👇 neben dem neuen Unternehmen, um es auszuwählen. Sein Logo erscheint nun rechts oben.

## 3. Steuercodes prüfen

Steuercodes gelten für alle Unternehmen. Öffnen Sie **Einstellungen → Steuercodes** und prüfen Sie, dass alle benötigten Codes vorhanden sind – für die Umsatzsteuer meist zumindest Umsatzsteuer- und Vorsteuercodes je Steuersatz, Reverse Charge und Steuerzahlungen.
Apps für Ihr Land können sie bereitstellen. Siehe [Steuern](taxes.de).

## 4. Kontenplan einrichten

Öffnen Sie **Konten** und legen Sie die Konten an (oder installieren Sie eine App, die den Standardkontenrahmen Ihres Landes importiert). Richten Sie zumindest ein:

| Konto | Art | Einstellungen |
| --- | --- | --- |
| Bankkonto/-konten, Kassa | Vermögen | |
| Forderungen aus Lieferungen und Leistungen | Vermögen | **offene Posten verwalten** |
| Vorsteuer | Vermögen | Tags: alle Vorsteuercodes |
| Aktive Rechnungsabgrenzung | Vermögen | Tag `accruals` |
| Verbindlichkeiten aus Lieferungen und Leistungen | Fremdkapital | **offene Posten verwalten** |
| Umsatzsteuer | Fremdkapital | Tags: alle Umsatzsteuercodes |
| Passive Rechnungsabgrenzung | Fremdkapital | Tag `accruals` |
| Stammkapital, Gewinnrücklagen | Eigenkapital | |
| Erlöse | Erträge | bevorzugter Steuercode, Standard-Kostenstelle |
| Aufwände | Aufwendungen | Standard-Kostenstelle |

Setzen Sie **gültig ab** auf den ersten Tag des ersten in YaBooks erfassten Wirtschaftsjahres.

## 5. Kostenstellen einrichten (optional)

Wenn Sie Kosten und Erlöse je Abteilung, Projekt oder Produkt auswerten möchten, legen Sie die Kostenstellen an und ordnen Sie Erlös- und Aufwandskonten Standard-Kostenstellen zu. Siehe [Kostenstellen](accounts.de#kostenstellen).

## 6. Eröffnungsbilanz buchen

Bei einem Systemwechsel übernehmen Sie die Schlussbilanz des Vorjahres:

1. Öffnen Sie **Dokumente** und laden Sie die Schlussbilanz des Vorjahres hoch (oder legen Sie einen Beleg ohne Datei an).
2. Öffnen Sie ihn im [Beleg-Editor](document-editor.de), setzen Sie die Belegart auf `UB` und den Namen auf *Eröffnungsbilanz*.
3. Fügen Sie im Reiter **Hauptbuch** je Bilanzkonto eine Zeile mit dem ersten Tag des Wirtschaftsjahres hinzu: Sollsalden als positive, Habensalden als negative Beträge.
4. Buchen Sie Gewinn oder Verlust des Vorjahres auf die Gewinnrücklagen bzw. den Bilanzgewinn, sodass der Beleg null ergibt.
5. Haken Sie **Gebucht?** an und speichern Sie.

Für offene Forderungen und Verbindlichkeiten erfassen Sie je offener Rechnung eine Zeile mit Geschäftspartner und Fälligkeitsdatum, damit die [Offene-Posten-Verwaltung](general-ledger.de#offene-posten) ab dem ersten Tag funktioniert.

## 7. Kollegen und Apps Zugriff geben

* Legen Sie Benutzer an und weisen Sie ihnen eine Rolle für das neue Unternehmen zu, siehe [Benutzer](settings.de#benutzer) und [Rollen](settings.de#rollen).
* Installieren Sie die benötigten Apps, z. B. für die Bankanbindung, und geben Sie ihnen Zugriff auf das neue Unternehmen, siehe [Apps](apps.de).

## 8. Ergebnis prüfen

Öffnen Sie **Salden** und setzen Sie den Zeitraum auf den ersten Tag des Wirtschaftsjahres. Die Bilanz muss genau die Werte der Schlussbilanz des Vorjahres zeigen, und der Gewinn der Periode muss null sein.

## Nächste Schritte

* [Laufende Buchhaltung und Monatsabschluss](workflow-monthly.de)
* [Übersicht aller Hilfethemen](index.de)
