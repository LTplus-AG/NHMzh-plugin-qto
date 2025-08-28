---
id: qto-import
slug: /qto-import
title: Importing from Excel
sidebar_label: Excel Import
---

> Ergänze fehlende Mengen und eBKP-Codes direkt aus einer Excel-Tabelle.

---

## 1. Datei vorbereiten

Erstelle eine Vorlage über **Export → Elemente (.xlsx)** oder erstelle eine Tabelle mit folgenden Spalten:

| Spalte              | Beschreibung                                   |
| ------------------- | ---------------------------------------------- |
| `GUID`              | Eindeutiger Identifier des Elements (Pflicht).  |
| `Klassifikation ID` | eBKP-Code wie `C02.01` oder `C02.01.01`.       |
| `Klassifikation Name` | Bezeichnung des eBKP-Codes.                  |
| Mengen- und Materialspalten | Optional zur Aktualisierung weiterer Werte. |

Nur Zeilen mit gültiger `GUID` werden verarbeitet. Das Plugin erkennt eBKP-Codes automatisch und setzt das Klassifikationssystem auf `eBKP`.

---

## 2. Import durchführen

1. Öffne ein Projekt.
2. Klicke auf **Excel Import**.
3. Wähle die vorbereitete Datei aus und bestätige die Vorschau.

Die Elemente werden per GUID abgeglichen; vorhandene eBKP-Codes werden ergänzt oder überschrieben.

---

### Hinweise

- Ungültige eBKP-Codes werden als Warnung in der Vorschau angezeigt.
- Die Zuordnung basiert ausschliesslich auf der GUID; doppelte GUIDs in der Datei führen zur letzten eingelesenen Zeile.

