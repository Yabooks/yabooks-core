# Personen, Organisationen und Unternehmen

Unter **Personen** verwalten Sie alle, die YaBooks kennen muss: Kundinnen und Kunden, Lieferanten, Mitarbeitende, Behörden – und Ihre eigenen Gesellschaften.
Jeder Eintrag wird als *Identität* bezeichnet und ist entweder eine **Privatperson** (natürliche Person) oder eine **Organisation** (Gesellschaft, Verein, Behörde, …).
Dieselbe Identität kann in einem Unternehmen Kunde und in einem anderen Lieferant sein; sie wird nur einmal gespeichert.

Identitäten können **Unternehmen** besitzen. Ein Unternehmen ist die Einheit, für die Sie Bücher führen: Es hat einen eigenen Kontenplan, eigene Belege und Salden.

![Die Liste der Personen und Organisationen](screenshots/de/people.jpg)

## Person oder Organisation anlegen

1. Öffnen Sie **Personen** auf dem Startbildschirm.
2. Klicken Sie auf die runde **+**-Schaltfläche rechts unten.
3. Wählen Sie **Neue Privatperson** oder **Neue Organisation**.
4. Geben Sie den Namen ein (Vor- und Nachname bzw. den vollständigen Namen der Organisation) und klicken Sie auf **Speichern**.

![Eine neue Privatperson anlegen](screenshots/de/people-new.jpg)

Die neue Identität wird sofort geöffnet, sodass Sie die Details ergänzen können.

## Details einer Identität

Klicken Sie in der Liste auf einen Namen, um die Identität zu öffnen.

![Eine Organisation mit ihren Details](screenshots/de/organization.jpg)

Mit ✏️ in der Kopfzeile bearbeiten Sie Namen, Firmenbuchnummer und Rechtsordnung (zweistelliger Ländercode, z. B. `AT`); ein Klick auf Bild bzw. Logo lädt ein neues hoch.
Die Felder darunter enthalten weitere Details. Jedes Feld hat eine **+**-Schaltfläche zum Hinzufügen:

| Feld | Inhalt |
| --- | --- |
| **Marken und Geschäftsbezeichnungen** | Handelsnamen, die zusätzlich zum rechtlichen Namen verwendet werden. |
| **Kontaktmöglichkeiten** | E-Mail-Adresse, Telefonnummer (internationales Format, z. B. `+436641234567`) und Adresse. Eine Adresse muss vollständig (Straße, Nummer, PLZ und Ort) oder ganz leer sein. Mehrere Adressen sind möglich. |
| **Bankverbindungen** | IBAN, BIC, Bankname und Kontoinhaber. Wird z. B. von Banking-Apps zur Zuordnung von Zahlungen verwendet. |
| **Unternehmens- und Steuerregistrierungen** | Steuernummern und Registrierungen als Schlüssel-Wert-Paare, z. B. Schlüssel `AT-UID` und Wert `ATU12345678`. Die ersten beiden Buchstaben des Schlüssels bestimmen die angezeigte Länderflagge. |
| **Unternehmen** | Die Unternehmen dieser Identität (siehe unten). |
| **Beziehungen und Verknüpfungen** | Verbindungen zu anderen Identitäten, siehe [Beziehungen](#beziehungen). |

## Beziehungen

Beziehungen verbinden Identitäten miteinander, z. B. *Anna Berger* ist *Geschäftsführerin* der *Sample Company Ltd*.

1. Klicken Sie im Feld **Beziehungen und Verknüpfungen** auf **+**.
2. Suchen Sie die verknüpfte Person oder Organisation.
3. Geben Sie die **Art der Beziehung** ein, z. B. `Mitarbeiter`, `Geschäftsführer` oder `Gesellschafter`. Bereits verwendete Arten werden vorgeschlagen.
4. Wählen Sie optional ein **Symbol** (Emoji) und einen Gültigkeitszeitraum (**Gültig ab** / **Gültig bis**).
5. Mit **Richtung tauschen** kehren Sie die Beziehung bei Bedarf um; klicken Sie dann auf **Hinzufügen**.

Beziehungen werden sofort gespeichert. Mit ✕ neben einer Beziehung entfernen Sie sie.

## Unternehmen

Ein Unternehmen wird bei der Identität angelegt, der es gehört.

1. Öffnen Sie die besitzende Organisation oder Person.
2. Klicken Sie im Feld **Unternehmen** auf **+**.
3. Füllen Sie die Einstellungen aus und klicken Sie auf **Speichern**.

![Einstellungen eines Unternehmens](screenshots/de/business.jpg)

| Einstellung | Bedeutung |
| --- | --- |
| **Name** | Name des Unternehmens in YaBooks. |
| **Unternehmensnummer** | Optionale Nummer, z. B. die Klientennummer Ihrer Steuerberatungskanzlei. |
| **Währung** | Dreistelliger ISO-Währungscode der Bücher, z. B. `EUR`. Alle Beträge im Hauptbuch lauten auf diese Währung. |
| **Fiktives Unternehmen** | Kennzeichnet ein steuerlich nicht relevantes Unternehmen, z. B. zum Testen oder Planen. |
| **Abschlussmonat / Abschlusstag** | Letzter Tag des Wirtschaftsjahres, z. B. 31. Dezember. Die [Salden](balances.de) zeigen anhand dessen standardmäßig das laufende Wirtschaftsjahr. |
| **Gesperrt bis** | Alle Buchungsdaten bis einschließlich dieses Tages sind gesperrt: Gebuchte Buchungen dieses Zeitraums können nicht mehr hinzugefügt, geändert oder gelöscht werden. Siehe [Geschäftsjahr sperren](workflow-financial-statements.de#geschaftsjahr-sperren). |
| **Aufgelöst am** | Datum, an dem das Unternehmen aufgegeben wurde. |
| **Alternative Bücher** | Namen zusätzlicher Bücher, z. B. `Steuer` oder `IFRS`, für Abweichungen zwischen Rechnungslegungsstandards. Siehe [Alternative Bücher](document-editor.de#alternative-bucher). |

Um mit einem Unternehmen zu arbeiten, klicken Sie auf 👇 daneben. Damit wird es zum [ausgewählten Unternehmen](getting-started.de#ein-unternehmen-auswahlen). Mit ✏️ ändern Sie später seine Einstellungen.

> ⚠️ **Achtung:** Das Sperren und Entsperren von Zeiträumen erfordert besondere Berechtigungen (siehe [Rollen](settings.de#rollen)). Einen bereits an das Finanzamt gemeldeten oder veröffentlichten Zeitraum zu entsperren, sollte die Ausnahme sein.

## Verwandte Themen

* [Ein neues Unternehmen einrichten](workflow-setup.de)
* [Sachkonten und Kostenstellen](accounts.de)
* [Belege](documents.de)
