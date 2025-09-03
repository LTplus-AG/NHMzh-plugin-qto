# eBKP-Mapping Benutzerfluss

## Übersicht

Dieses Dokument beschreibt den Benutzerfluss für das eBKP-Mapping-System. Es zeigt die Schritte zur Erstellung und Verwaltung von Mapping-Regeln.

## Hauptziele für Benutzer

- Einfache Regel-Erstellung mit Dropdown-Menüs
- Automatische Klassifizierung von IFC-Elementen
- Flexible Regel-Konfiguration für verschiedene Anwendungsfälle

---

## 1. Zugriff auf das Mapping-System

### Navigation zur Mapping-Funktion
```
Projekt auswählen → Reiter "eBKP-Mappings" → Regel-Übersicht
```

**Einstiegspunkte:**
- **Neue Regel:** Button "Neue Regel erstellen"
- **Regel-Liste:** Übersicht aller vorhandenen Regeln

---

## 2. Regel-Erstellung

### Einfacher Regel-Builder
```
┌─────────────────────────────────────────────────────────────┐
│ Neue Regel erstellen                                         │
├─────────────────────────────────────────────────────────────┤
│ Regel-Name: [Tragende Wände]                               │
├─────────────────────────────────────────────────────────────┤
│ Priorität: [Normal ▾]                                       │
│ (Höhere Priorität = wichtigere Regel)                       │
├─────────────────────────────────────────────────────────────┤
│ Bedingung 1:                                                │
│ Property: [IFC-Klasse ▾]   Operator: [ist gleich ▾]         │
│ Wert: [IfcWall ▾]                                           │
├─────────────────────────────────────────────────────────────┤
│ Bedingung 2: (optional)                                     │
│ Property: [Tragend ▾]      Operator: [ist gleich ▾]         │
│ Wert: [True ▾]                                              │
├─────────────────────────────────────────────────────────────┤
│ Ergebnis:                                                   │
│ eBKP-Code: [H01.01 ▾]   Mengentyp: [Fläche ▾]              │
├─────────────────────────────────────────────────────────────┤
│ [Regel speichern]                                           │
└─────────────────────────────────────────────────────────────┘
```

### Verfügbare Properties für Initial Version
- **IFC-Klasse**: IfcWall, IfcSlab, IfcColumn, etc.
- **Gebäudegeschoss**: EG, U1.UG_RDOK, OG1, etc.
- **Tragend**: True/False (für Wände, Stützen)
- **Aussen/Innen**: True/False (für Wände, Decken)
- **Materialname**: Genauer Materialname (z.B. "Beton_C35/45")

### Beispiel-Regeln

#### Regel mit hoher Priorität (spezifische Kombination)
```
Name: Tragende Untergeschoss-Wände
Priorität: Hoch (15)
Bedingung 1: IFC-Klasse = IfcWall
Bedingung 2: Tragend = True
Bedingung 3: Gebäudegeschoss = U1.UG_RDOK
Ergebnis: eBKP-Code H01.01, Mengentyp Fläche
```

#### Regel mit normaler Priorität (allgemeine Eigenschaft)
```
Name: Alle tragenden Wände
Priorität: Normal (10)
Bedingung 1: IFC-Klasse = IfcWall
Bedingung 2: Tragend = True
Ergebnis: eBKP-Code H01.02, Mengentyp Fläche
```

#### Regel mit niedriger Priorität (allgemeine Fallback-Regel)
```
Name: Alle Wände
Priorität: Niedrig (5)
Bedingung: IFC-Klasse = IfcWall
Ergebnis: eBKP-Code H01.03, Mengentyp Fläche
```

---

## 3. Regel-Management

### Regel-Übersicht
```
┌─────────────────────────────────────────────────────────────┐
│ eBKP-Mapping-Regeln        [+ Neue Regel]                   │
├─────────────────────────────────────────────────────────────┤
│ ▶ Alle Wände (aktiv)                                        │
│ ▶ Tragende Wände (aktiv)                                   │
│ ▶ Untergeschoss-Wände (aktiv)                              │
│ ▶ Beton-Wände (aktiv)                                      │
└─────────────────────────────────────────────────────────────┘
```

### Regel bearbeiten/löschen
- **Bearbeiten**: Regel anklicken → Name, Priorität, Bedingungen ändern → Speichern
- **Löschen**: Regel anklicken → [Löschen] → Bestätigen
- **Aktiv/Inaktiv**: Checkbox zum schnellen Aktivieren/Deaktivieren
- **Priorität anpassen**: Hohe Priorität für spezifische Regeln, niedrige für allgemeine

---

## 4. Häufige Anwendungsfälle

### 4.1 Wände nach Tragfähigkeit
1. Neue Regel erstellen
2. Property: IFC-Klasse = IfcWall
3. Property: Tragend = True
4. eBKP-Code für tragende Wände auswählen
5. Regel speichern

### 4.2 Geschoss-spezifische Klassifizierung
1. Neue Regel erstellen
2. Property: Gebäudegeschoss = U1.UG_RDOK
3. Optional: IFC-Klasse = IfcWall
4. eBKP-Code für Untergeschoss auswählen
5. Regel speichern

### 4.3 Material-basierte Klassifizierung
1. Neue Regel erstellen
2. Property: Materialname = Beton_C35/45
3. eBKP-Code für Beton auswählen
4. Mengentyp: Volumen (für Beton)
5. Regel speichern

---

## 5. Automatische Anwendung

### Wie Regeln funktionieren
1. **Bei neuer IFC-Verarbeitung**: Regeln werden automatisch auf alle Elemente angewendet
2. **Prioritäts-System**: Regeln werden nach Priorität sortiert (höhere Priorität zuerst)
3. **Erste passende Regel gewinnt**: Die erste Regel mit passenden Bedingungen wird angewendet
4. **Keine Überschreibung**: Bereits klassifizierte Elemente bleiben unverändert
5. **Sofortige Wirkung**: Änderungen an Regeln wirken sich auf neue Verarbeitungen aus

### Feedback bei Regel-Anwendung
```
✅ Regel "Tragende Wände" angewendet auf 45 Elemente
⚠️  3 Elemente konnten nicht klassifiziert werden
ℹ️  Regel "Alle Wände" wurde nicht angewendet (höhere Regel traf zu)
```
