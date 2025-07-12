---
id: qto-quantities
slug: /qto-quantities
title: Supported Quantities & IFC Classes
sidebar_label: Quantity Reference
---

> Use this table when checking your IFC before upload. Every element class below **must** expose the listed quantity to be processed.

| IFC Class | Primary Quantity (unit) | Quantity Set | Notes |
|-----------|------------------------|--------------|-------|
| IfcWall / IfcWallStandardCase | GrossSideArea (m²) | `Qto_WallBaseQuantities` | NetVolume also required for LCA. |
| IfcSlab / IfcPlate | GrossArea (m²) | `Qto_SlabBaseQuantities` / `Qto_PlateBaseQuantities` | Floor, roof, balcony plates. |
| IfcBeam / IfcColumn | Length (m) | `Qto_BeamBaseQuantities` / `Qto_ColumnBaseQuantities` | Auto-rotates beams in IFC4. |
| IfcPile | GrossSurfaceArea (m²) | `Qto_PileBaseQuantities` | Pile volume via NetVolume. |
| **ALL classes** | NetVolume → GrossVolume (m³) | `BaseQuantities` | Volume drives material & impact. |

For the full 25-class list see the *IFC Modelling Guidelines*.

---

## How the plugin chooses between Net & Gross Volume

1. **NetVolume** - preferred (excludes openings).  
2. **GrossVolume** - used only if NetVolume is missing or zero.

If both are zero, the element is flagged yellow (missing quantity).

---

### Need help?
Refer to the *Highlight Rules* page for warning colours or email **support@fastbim5.eu**. 