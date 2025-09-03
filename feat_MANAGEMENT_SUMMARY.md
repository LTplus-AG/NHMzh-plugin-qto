# eBKP-Mapping Projekt-Management-Übersicht

## Projektübersicht

**Projekt:** eBKP-Mapping für IFC-Elemente
**Ziel:** Automatische Zuordnung von eBKP-Codes zu IFC-Elementen basierend auf konfigurierbaren Regeln
**Umfang:** Erweiterung des QTO-Plugins um regel-basiertes Mapping-System
**Architektur:** Integration in bestehende QTO-Infrastruktur

## Geschäftlicher Nutzen

### Problemstellung
- In IFC Modellen fehlen oft eBKP Klassifikationen
- Manuelle Klassifizierung von IFC-Elementen ist fehleranfällig, aufwändig und nur im Autorentool möglich (oder via alternative Tools, welche das IFC bearbeiten)
- Bei wiederholten IFC Abgaben (Data Drops) müssen manuelle Anpassungen bei jedem neuen Projektstand wieder händisch eingepflegt werden
- Hoher Aufwand für Projekte mit vielen ähnlichen Elementen, qualitativ schwierig

### Lösungsansatz
- Regel-basiertes System zur automatischen Klassifizierung
- Nutzung vorhandener IFC-Properties (Typ, Geschoss, Tragfähigkeit, Material)
- Projekt-spezifische Regel-Konfiguration
- Integration in bestehende QTO-Verarbeitung
- **Prioritäts-System:** Ermöglicht präzise Kontrolle bei Regel-Konflikten

## Technische Architektur

### Backend-Komponenten
- **MongoDB Collection:** `mappingRules` für Regel-Speicherung
- **RuleEvaluator:** Engine zur Regel-Anwendung auf IFC-Elemente
- **PropertyAnalyzer:** Ermittlung verfügbarer IFC-Properties
- **REST API:** CRUD-Operationen für Regel-Management

### Frontend-Komponenten
- **Regel-Management UI:** Übersicht und Verwaltung vorhandener Regeln
- **Regel-Builder:** Visuelle Erstellung von Mapping-Regeln
- **Property-Auswahl:** Dropdown-Menüs für IFC-Properties und Werte

### Integration
- **QTO-Plugin:** Nahtlose Integration in IFC-Verarbeitung
- **Cost&LCA-Plugins:** Automatische Nutzung der klassifizierten Daten
- **Keine Datenbank-Änderungen:** Nutzung vorhandener Element-Struktur

## Entscheidungspunkte

### Technische Entscheidungen
1. **Maximale Bedingungen:** Max. 3 Bedingungen pro Regel
2. **Operatoren:** Nur "ist gleich" und "ist nicht gleich"
3. **Konflikt-Handling:** Erste passende Regel gewinnt
