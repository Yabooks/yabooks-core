# YaCob AI

YaCob ist ein KI-Assistent mit Zugriff auf deine YaBooks-Daten. Stelle Fragen in natürlicher Sprache, lass Datensätze suchen und auswerten oder lass YaCob Daten für dich anlegen und ändern – immer mit deiner Zustimmung.

![YaCob AI](screenshots/de/yacob.jpg)

> ⚠️ **Achtung:** YaCob benötigt einen am Server konfigurierten Schlüssel eines KI-Anbieters (siehe [Einstellungen → Allgemein](settings.de#allgemein)). Außerdem ist die Berechtigung *verwenden* für *YaCob KI* nötig (siehe [Rollen](settings.de#rollen)). YaCob handelt mit **deinen** Berechtigungen: Es kann nichts sehen oder tun, was du nicht auch könntest.

## Fragen stellen

1. Öffne **YaCob AI** auf dem Startbildschirm.
2. Tippe deine Frage und drücke <kbd>Enter</kbd> oder klicke auf ➤. Mit <kbd>Umschalt</kbd>+<kbd>Enter</kbd> beginnst du eine neue Zeile.
3. YaCob sucht die nötigen Daten und antwortet. Ein Klick auf einen ⚙️-Werkzeugaufruf in der Antwort zeigt, welche Anfrage gestellt wurde und was das System geantwortet hat.

Beispiele:

* *Welche Rechnungen von Hotel Blauer See sind noch unbezahlt?*
* *Wie hoch war der Büromaterialaufwand der Musterfirma im ersten Quartal?*
* *Liste alle Entwürfe mit Buchungen im März auf.*
* *Vergleiche die Erlöse von Jänner und Februar und erkläre den Unterschied.*

> 💡 **Tipp:** Nenne das Unternehmen, um das es geht. YaCob kann mit allen Unternehmen arbeiten, auf die du Zugriff hast, nicht nur mit dem ausgewählten.

## Dateien anhängen

Mit 📎 hängst du ein Bild, PDF, eine Text-, Markdown-, CSV- oder JSON-Datei an, z. B. *Erfasse diese Rechnung* mit dem PDF einer Lieferantenrechnung oder *Welche dieser Kontobewegungen sind noch nicht gebucht?* mit einem CSV-Export deiner Bank.

## Änderungen freigeben

YaCob **ändert niemals Daten, ohne zu fragen**. Will es etwas anlegen, ändern oder löschen, zeigt es die geplante Anfrage mit den Schaltflächen **Approve** (freigeben) und **Deny** (ablehnen).

* Prüfe die Parameter sorgfältig, z. B. Konten, Beträge und Datumsangaben.
* **Approve** lässt YaCob die Anfrage ausführen, **Deny** lehnt sie ab. Eine abgelehnte Anfrage wiederholt YaCob nicht.

Änderungen durch YaCob werden wie jede andere Änderung im [Prüfprotokoll](settings.de#protokolle) festgehalten.

## Gut zu wissen

* Die Unterhaltung wird nur im Arbeitsspeicher gehalten: **Neuladen der Seite löscht den Chat**.
* YaCob beantwortet nur Fragen zu den Daten in YaBooks, keine allgemeinen Fragen.
* KI kann Fehler machen. Prüfe wichtige Antworten, z. B. in den [Salden](balances.de) oder im [Hauptbuch](general-ledger.de), bevor du dich darauf verlässt.

## Verwandte Themen

* [Einstellungen](settings.de)
* [Belege](documents.de)
