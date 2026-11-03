# Arbeitsablauf: Laufende Buchhaltung und Monatsabschluss

Diese Seite beschreibt eine bewährte Routine, um Belege während des Monats zu erfassen und den Monat anschließend abzuschließen, z. B. vor der Umsatzsteuervoranmeldung.

## Während des Monats

### Belege sammeln

Laden Sie jede Rechnung, Quittung und jeden Kontoauszug gleich nach Erhalt hoch:

* ziehen Sie die Dateien auf die **+**-Schaltfläche der [Belegliste](documents.de#belege-hochladen), oder
* lassen Sie Apps sie importieren, z. B. aus Ihrem E-Mail-Postfach, vom Scanner oder von der Bank.

Hochgeladene Belege sind Entwürfe (📝), bis sie gebucht werden. Filtern Sie nach *Gebucht gleich nein*, um zu sehen, was noch zu erfassen ist.

### Ausgangsrechnungen erfassen

Für jede Ausgangsrechnung:

1. Öffnen Sie den Beleg im [Beleg-Editor](document-editor.de).
2. Geben Sie unter **Allgemein** Belegdatum, Belegart `AR`, die nächste interne Belegnummer, die Rechnungsnummer und den **Geschäftspartner** (Kunde) ein.
3. Erfassen Sie unter **Hauptbuch** Forderung (Soll), Erlös (Haben, Bemessungsgrundlage) und Umsatzsteuer (Haben, Steuerbetrag).
4. Öffnen Sie … bei der Forderungszeile und geben Sie das **Fälligkeitsdatum** ein.
5. Haken Sie **Gebucht?** an und speichern Sie.

Einfache Rechnungen erfassen Sie schneller mit der [Schnellbuchungsfunktion](quick-recorder.de), z. B. `@AR 7=2026-03-15=Beratung März=2000/4000,.2=2400`. Ziehen Sie das PDF auf das Eingabefeld, um es anzuhängen, und ergänzen Sie dann Geschäftspartner und Fälligkeitsdatum über *Kürzlich erfasste Belege* im Beleg-Editor.

### Eingangsrechnungen erfassen

Wie Ausgangsrechnungen, mit Belegart `ER`, dem Lieferanten als Geschäftspartner, Aufwand (Soll, Bemessungsgrundlage), Vorsteuer (Soll, Steuerbetrag) und Verbindlichkeit (Haben).
Nutzen Sie den Reiter **Kommentare**, um eine Kollegin vor dem Buchen um Freigabe zu bitten – erwähnen Sie sie mit `@`.

### Zahlungen erfassen

Zahlungen werden meist von einer Banking-App importiert, die auch die offenen Rechnungen ausgleicht. Bei manueller Erfassung buchen Sie sie gegen das Forderungs- bzw. Verbindlichkeitenkonto; die offenen Posten werden dann durch Apps oder über die API ausgeglichen (siehe [Offene Posten](general-ledger.de#offene-posten)).

### Rechnungsabgrenzungen

Betrifft eine Rechnung mehrere Monate, z. B. eine Jahreslizenz, [grenzen Sie sie im Hauptbuch ab](general-ledger.de#abgrenzen): ⋮ → **Abgrenzen** → Abgrenzungskonto und Monate wählen.

## Monatsabschluss

Arbeiten Sie diese Checkliste zu Beginn des Folgemonats ab:

1. **Alle Belege erfasst?** Filtern Sie in der [Belegliste](documents.de#nutzliche-filter) nach Entwürfen. Buchen oder löschen Sie sie. Auch die [Salden](balances.de#ungebuchte-belege) warnen vor Entwürfen im Zeitraum.
2. **Bank abgestimmt?** Öffnen Sie die [Salden](balances.de), setzen Sie *Bis* auf den Monatsletzten und [stimmen Sie](balances.de#kontoabstimmung) jedes Bank- und Kassakonto mit dem Kontoauszug ab. Hängen Sie den Auszug als Nachweis an.
3. **Offene Posten plausibel?** Klicken Sie auf 📋 neben Forderungen und Verbindlichkeiten und achten Sie auf alte **offen**-Posten. Mahnen Sie überfällige Rechnungen; prüfen Sie, ob Lieferantenrechnungen doppelt oder gar nicht bezahlt wurden.
4. **Steuern vollständig?** Prüfen Sie, dass alle Erlös- und Aufwandsbuchungen einen Steuercode tragen, und stimmen Sie die Umsatzsteuerkonten mit der Voranmeldung ab. Siehe [Steuern prüfen](taxes.de#steuern-prufen).
5. **Abgrenzungen gebucht?** Prüfen Sie wiederkehrende Posten wie Miete, Gehälter, Abschreibungen und Abgrenzungen.
6. **Ergebnis plausibel?** Vergleichen Sie Erträge und Aufwendungen in den [Salden](balances.de) mit dem Vormonat. Große Abweichungen deuten oft auf falsche Konten oder fehlende Belege hin.
7. **Monat sperren.** Sobald die Umsatzsteuervoranmeldung abgegeben ist, setzen Sie **Gesperrt bis** in den [Unternehmenseinstellungen](people.de#unternehmen) auf den Monatsletzten. Das verhindert spätere Änderungen an gebuchten Buchungen des Monats.

> 💡 **Tipp:** Korrekturen nach dem Sperren werden im laufenden Zeitraum gebucht, z. B. mit **Stornieren** im [Hauptbuch](general-ledger.de#stornieren) und einem neuen, korrekten Beleg.

## Verwandte Themen

* [Jahresabschluss vor der Veröffentlichung prüfen](workflow-financial-statements.de)
* [Beleg-Editor](document-editor.de)
* [Schnellbuchungsfunktion](quick-recorder.de)
