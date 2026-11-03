# Arbeitsablauf: Ein neues Unternehmen einrichten

Folge diesen Schritten, wenn du beginnst, die Bücher eines neuen Unternehmens in YaBooks zu führen – egal ob neu gegründet oder aus einem anderen System übernommen.
Plane etwa eine Stunde ein; der Großteil entfällt auf den Kontenplan.

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

1. Öffne **Personen**, klicke auf **+** und wähle **Neue Organisation** (bzw. **Neue Privatperson** bei Einzelunternehmen).
2. Gib den rechtlichen Namen ein und speichere.
3. Klicke auf ✏️ und ergänze Firmenbuchnummer und Rechtsordnung (z. B. `AT`).
4. Ergänze **Kontaktmöglichkeiten** mit der Adresse des Sitzes, die **Bankverbindungen** und die **Unternehmens- und Steuerregistrierungen**, z. B. `AT-UID` = `ATU12345678`.

Das Sitzland ist wichtig: Die [Schnellbuchungsfunktion](quick-recorder.de#angabe-von-umsatzsteuer) bevorzugt Steuercodes dieses Landes.

## 2. Unternehmen anlegen und auswählen

1. Klicke im Feld **Unternehmen** der Organisation auf **+**.
2. Gib **Name** und **Währung** der Bücher ein.
3. Lege das Ende des Wirtschaftsjahres mit **Abschlussmonat** und **Abschlusstag** fest.
4. Benötigst du zusätzliche Bücher, z. B. für eine von der Unternehmensbilanz abweichende Steuerbilanz, füge sie unter **Alternative Bücher** hinzu (z. B. `Steuer`).
5. Lass **Gesperrt bis** vorerst leer und klicke auf **Speichern**.
6. Klicke auf 👇 neben dem neuen Unternehmen, um es auszuwählen. Sein Logo erscheint nun rechts oben.

## 3. Steuercodes prüfen

Steuercodes gelten für alle Unternehmen. Öffne **Einstellungen → Steuercodes** und prüfe, dass alle benötigten Codes vorhanden sind – für die Umsatzsteuer meist zumindest Umsatzsteuer- und Vorsteuercodes je Steuersatz, Reverse Charge und Steuerzahlungen.
Apps für dein Land können sie bereitstellen. Siehe [Steuern](taxes.de).

## 4. Kontenplan einrichten

Öffne **Konten** und lege die Konten an (oder installiere eine App, die den Standardkontenrahmen deines Landes importiert). Richte zumindest ein:

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

Setze **gültig ab** auf den ersten Tag des ersten in YaBooks erfassten Wirtschaftsjahres.

## 5. Kostenstellen einrichten (optional)

Wenn du Kosten und Erlöse je Abteilung, Projekt oder Produkt auswerten möchtest, lege die Kostenstellen an und ordne Erlös- und Aufwandskonten Standard-Kostenstellen zu. Siehe [Kostenstellen](accounts.de#kostenstellen).

## 6. Eröffnungsbilanz buchen

Bei einem Systemwechsel übernimmst du die Schlussbilanz des Vorjahres:

1. Öffne **Dokumente** und lade die Schlussbilanz des Vorjahres hoch (oder lege einen Beleg ohne Datei an).
2. Öffne ihn im [Beleg-Editor](document-editor.de), setze die Belegart auf `UB` und den Namen auf *Eröffnungsbilanz*.
3. Füge im Reiter **Hauptbuch** je Bilanzkonto eine Zeile mit dem ersten Tag des Wirtschaftsjahres hinzu: Sollsalden als positive, Habensalden als negative Beträge.
4. Buche Gewinn oder Verlust des Vorjahres auf die Gewinnrücklagen bzw. den Bilanzgewinn, sodass der Beleg null ergibt.
5. Hake **Gebucht?** an und speichere.

Für offene Forderungen und Verbindlichkeiten erfasst du je offener Rechnung eine Zeile mit Geschäftspartner und Fälligkeitsdatum, damit die [Offene-Posten-Verwaltung](general-ledger.de#offene-posten) ab dem ersten Tag funktioniert.

## 7. Kollegen und Apps Zugriff geben

* Lege Benutzer an und weise ihnen eine Rolle für das neue Unternehmen zu, siehe [Benutzer](settings.de#benutzer) und [Rollen](settings.de#rollen).
* Installiere die benötigten Apps, z. B. für die Bankanbindung, und gib ihnen Zugriff auf das neue Unternehmen, siehe [Apps](apps.de).

## 8. Ergebnis prüfen

Öffne **Salden** und setze den Zeitraum auf den ersten Tag des Wirtschaftsjahres. Die Bilanz muss genau die Werte der Schlussbilanz des Vorjahres zeigen, und der Gewinn der Periode muss null sein.

## Nächste Schritte

* [Laufende Buchhaltung und Monatsabschluss](workflow-monthly.de)
* [Übersicht aller Hilfethemen](index.de)
