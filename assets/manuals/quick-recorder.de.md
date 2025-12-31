# Schnellbuchungsfunktion
Die Erfassung von Buchungszeilen erfolgt durch Eingabe eines Erfassungscodes.
Während der Eingabe erkennt das System automatisch die einzelenen Bestandteile der Buchung und bereitet einen entsprechenden Buchungssatz vor.

## Erfassungscodes
Die Eingabe muss alle erforderlichen Bestandteile einer Hauptbuchtransaktion enthalten.
Die einzelnen Bestandteile sind durch die Zeichen `+` oder `=` von einander zu trennen.

Beispiel: `@ER 19=2026-01-12=Einkauf Bürobedarf=5700,.2/3300+=123.45`

Erforderliche Bestandteile sind:
*  Buchungsdatum
*  Buchungsbetrag
*  Hauptbuchkonten
*  Buchungssymbol und Belegnummer (optional)
*  Buchungstext (optional)

### Buchungsdatum
Das Buchungsdatum ist entweder im Format `tt.mm.jjjj`, `jjjj-mm-tt` oder `mm/tt/jjjj` zu erfassen.

## Buchungsbetrag
Als Buchungsbetrag wird jener Bestandteil interpretiert, der lediglich eine Zahl enthält. Im obigen Beispiel ist dies `123.45`.
Als Dezimaltrennzeichen sind sowohl `.`, als auch `,` erlaubt. Tausendertrennzeichen sind nicht gestattet.

## Hauptbuchkonten
Soll- und Habenkonto sind durch Angabe der Kontonummern getrennt durch einen `/` anzugeben.
Im obigen Beispiel wird somit das Konto `5700` im Soll und das Konto `3300` im Haben bebucht.

### Angabe von Umsatzsteuer
Ist entweder auf Soll- oder Habenseite zusätzlich ein Steuerprozentsatz angegeben, der mittels `,` und
Dezimaltrennzeichen (`,` oder `.`) vom Konto getrennt angeführt ist, wird zusätzlich eine Steuerbuchung erfasst.
Der Buchungsbetrag wird sodann als Bruttobetrag verstanden.

Der anzuwendende Steuercode wird automatisch wie folgt ermittelt:
1.  Ist am Sachkonto ein präferierter Steuercode hinterlegt, der mit dem angegebenen Prozentsatz kompatibel ist, so wird dieser verwendet.
2.  Anderenfalls werden die existierenden Steuercodes nach einem passenden durchsucht (Vorsteuercodes bei Aufwandskonten, Umsatzsteuercodes bei Erfolgskonten).
3.  Gibt es mehrere Codes, auf die die obigen Kriterien zutreffen, wird auf jene eingeschränkt, die mit dem Ländercode des Sitzes des Unternehmens beginnen.
3.  Tifft auch dies auf mehrere Steuercodes zu, so wird jener verwendet, der das kürzeste Kürzel führt.

Die Steuer wird auf das jeweilige Umsatz- oder Vorsteuerkonto gebucht. Dieses ist mit jenen Steuercodes zu taggen, für die es verwendet werden soll.
Im obigen Beispiel werden im Soll `102,88` (netto von `123.45`) Konto `5700` gebucht
und `20,57` auf jenes Konto, bei dem der Steuercode von 20% Vorsteuer hinterlegt ist.

## Buchungssymbol und Belegnummer
Soll ein spezifisches Buchungssymbol und eine interne Belegnummer vergeben werden, so ist dies mittels `@`-Zeichen zu signalisieren.
Danach ist das Belegsymbol und nach einem Leerzeichen die Belegnummer anzugeben.
Im obigen Beispiel wird somit das Belegsymbol `ER` und die interne Belegnummer `19` verwendet.

## Buchungstext
Jener Bestandteil, der nicht den Kriterien für einen der anderen Bestandteile entspricht, wird als Buchungstext interpretiert.
Im obigen Beispiel wird somit `Einkauf Bürobedarf` als Buchungstext festgelegt.
