# Modellierungsanforderungen Nachhaltigkeitsmonitoring ZH

Grundlegende Anforderungen an Modelle für Kostenberechnung & LCA: Wir benötigen Materialien und zugehörige Mengen (je nach Ifc Klasse leicht unterschiedliche BaseQuantities). Falls diese Angaben nicht via Ifc kommunizierbar sind (z.B. bei IfcCurtainWall sind keine Materialien hinterlegt), müssen sie entsprechend separat erfasst werden.

---

## 1. Ifc Klassen / BaseQuantities

Für alle IfcBuiltElement gelten folgende Zuordnungen:

- **IfcBeam**  
  `Qto_BeamBaseQuantities.GrossVolume` (IfcQuantityVolume)
  `Qto_BeamBaseQuantities.Length` (IfcQuantityLength)
- **IfcBuildingElementPart**  
  `Qto_BuildingElementPartBaseQuantities.GrossVolume` (IfcQuantityVolume)
  `Qto_BuildingElementPartBaseQuantities.GrossArea` (IfcQuantityArea)
- **IfcBuildingElementProxy**  
  `Qto_BuildingElementProxyBaseQuantities.GrossVolume` (IfcQuantityVolume)
  `Qto_BuildingElementProxyBaseQuantities.GrossArea` (IfcQuantityArea)
- **IfcColumn**  
  `Qto_ColumnBaseQuantities.GrossVolume` (IfcQuantityVolume)
  `Qto_ColumnBaseQuantities.Length` (IfcQuantityLength)
- **IfcCovering**  
  `Qto_CoveringBaseQuantities.GrossArea` (IfcQuantityArea)
- **IfcCurtainWall**  
  `Qto_CurtainWallBaseQuantities.GrossSideArea` (IfcQuantityArea)
- **IfcDoor**  
  `Qto_DoorBaseQuantities.Area` (IfcQuantityArea)
- **IfcEarthworksCut**  
  `Qto_EarthworksCutBaseQuantities.UndisturbedVolume` (IfcQuantityVolume)
- **IfcFooting**  
  `Qto_FootingBaseQuantities.GrossVolume` (IfcQuantityVolume)
- **IfcMember**  
  `Qto_MemberBaseQuantities.GrossVolume` (IfcQuantityVolume)
- **IfcPile**  
  `Qto_PileBaseQuantities.GrossVolume` (IfcQuantityVolume)
  `Qto_PileBaseQuantities.GrossSurfaceArea` (IfcQuantityArea)
- **IfcPlate**  
  `Qto_PlateBaseQuantities.GrossVolume` (IfcQuantityVolume)
  `Qto_PlateBaseQuantities.GrossArea` (IfcQuantityArea)
- **IfcRampFlight**  
  `Qto_RampFlightBaseQuantities.GrossVolume` (IfcQuantityVolume)
  `Qto_RampFlightBaseQuantities.GrossArea` (IfcQuantityArea)
- **IfcSolarDevice**  
  `Qto_SolarDeviceBaseQuantities.GrossArea` (IfcQuantityArea)

---

## 2. Definitionen

- **IfcQuantityVolume**:  
  [Weitere Informationen](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcQuantityVolume.htm)

- **IfcQuantityArea**:  
  [Weitere Informationen](https://ifc43-docs.standards.buildingsmart.org/IFC/RELEASE/IFC4x3/HTML/lexical/IfcQuantityArea.htm)

---

## 3. Materialien

Folgende Materialtypen werden berücksichtigt:

- `IfcMaterial`
- `IfcMaterialLayerSet` / `IfcMaterialLayer`
- `IfcMaterialConstituentSet` / `IfcMaterialConstituent`

### 3.1 Bezeichnung & Struktur der IfcMaterial

- **Spezifische Materialbezeichnung**:  
  Der Name eines IfcMaterial muss ein spezifisches Material widerspiegeln, beispielsweise _"Beton C30/37"_ oder _"Stahl S355"_. Generische Bezeichnungen wie _"Default"_ oder _"Allgemeine Konstruktion"_ sind zu vermeiden.

- **Feingliedrige Aufteilung**:  
  Eine detaillierte Unterteilung in unterschiedliche Materialien ermöglicht die spätere Zuordnung spezifischer KBOB-Materialien zu den IfcMaterial. Wenn z.B. verschiedene Betonsorten vorgesehen sind, sollten diese aktuell als unterschiedliche IfcMaterial definiert werden.

### 4. eBKP

- zweistufige eBKP pro IfcElement, z.B. C02.01.01
