# Apps

Apps erweitern YaBooks um neue Funktionen, z. B. Bankanbindung, Fakturierung, Lohnverrechnung, OCR, Steuererklärungen oder einen Kontenplan für Ihr Land.
Installierte Apps erscheinen als Kacheln auf dem [Startbildschirm](getting-started.de#der-startbildschirm) und arbeiten mit denselben Daten wie YaBooks selbst.

Öffnen Sie **App-Marktplatz** auf dem Startbildschirm, um alle registrierten Apps zu sehen und zu verwalten.

![Der App-Marktplatz](screenshots/de/apps.jpg)

## Registrierte Apps

Jede registrierte App zeigt ihren Namen, ob sie **installiert** ist (läuft auf diesem Server) oder **extern** (läuft anderswo und verbindet sich über die API), und wann sie registriert wurde.

* **Berechtigungen** öffnet die [Zugriffseinstellungen](settings.de#app-zugriff) der App.
* **entfernen** beendet die App und hebt ihre Registrierung auf.

> ⚠️ **Achtung:** Wird eine App entfernt, kann ihre Konfiguration verloren gehen: Ihre keinem Unternehmen zugeordneten Dokumente werden gelöscht.

Die Schaltflächen oben:

* **API-Dokumentation** – die interaktive Dokumentation der YaBooks-API, für Entwickler und zum Anbinden externer Apps.
* **zum App-Marktplatz** – der Marktplatz, in dem Apps erworben werden können.
* **neue App installieren** – siehe unten. Nur für Benutzer sichtbar, die Apps installieren dürfen.

## Eine App installieren

Klicken Sie auf **neue App installieren** und wählen Sie ein Verfahren:

| Verfahren | Wann verwenden |
| --- | --- |
| **Abo-Code** | Sie haben eine App im Marktplatz erworben und einen Code erhalten. Geben Sie den Code ein. |
| **ZIP-Archiv** | Sie haben ein App-Paket erhalten (eine ZIP-Datei mit einer `package.json`). Ziehen Sie es auf das Feld oder klicken Sie, um es auszuwählen. Die App läuft auf diesem Server. |
| **API-Key** | Die App läuft anderswo (z. B. ein Clouddienst oder Ihr eigenes Skript). Geben Sie einen Namen ein; YaBooks erzeugt einen API-Key, mit dem sich die App verbindet. |

Wählen Sie dann die **Rolle**, mit der die App handelt, und ihren **Geltungsbereich** – ein einzelnes Unternehmen, *alle Unternehmen* oder *alles* – und klicken Sie auf **Installieren**.
Die Rolle bestimmt, was die App darf; Sie können sie später unter [Einstellungen → App-Zugriff](settings.de#app-zugriff) verfeinern.

> 💡 **Tipp:** Geben Sie Apps nur die Berechtigungen, die sie brauchen. Eine Banking-App etwa muss Dokumente lesen und schreiben und für die betreuten Unternehmen verbuchen dürfen, aber keine Benutzer verwalten.

### API-Keys

Beim Verbinden einer externen App mit einem API-Key wird der Key **nur einmal** angezeigt. Klicken Sie auf **Kopieren**, hinterlegen Sie ihn in der Konfiguration der externen App und klicken Sie auf **Fertig**. Geht der Key verloren, entfernen Sie die App und registrieren Sie sie neu.

## Apps und Ihre Daten

* Apps können Belege, Buchungen, Benachrichtigungen und Aufgaben anlegen. Änderungen durch Apps werden im [Prüfprotokoll](settings.de#protokolle) mit dem Namen der App festgehalten.
* Apps können einander über [Aufträge](settings.de#auftrage) Arbeit übergeben.
* Von einer App bereitgestellte Steuercodes sind unter [Einstellungen → Steuercodes](taxes.de#steuercodes) gekennzeichnet.

## Verwandte Themen

* [Einstellungen → App-Zugriff](settings.de#app-zugriff)
* [YaCob AI](yacob.de)
