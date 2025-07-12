---
id: qto-plugin-guide
slug: /qto-plugin-guide
title: Using the QTO Plugin
sidebar_label: Plugin Guide
---

> **Audience:** BIM authors, quantity surveyors, and project coordinators who need to upload IFC models and validate extracted quantities.

---

## 1. Purpose of the QTO Plugin

The QTO (Quantity Take-Off) plugin is the first step in the NHMzh workflow.  It:

1. **Imports IFC files** (IFC2x3 & IFC4).
2. **Calculates quantities** - area, length, surface, and volume per element.
3. **Extracts materials** and eBKP codes when present.
4. **Writes the data to the shared database** so Cost & LCA plugins can continue.

---

## 2. Uploading Your IFC

1. Open `https://qto.fastbim5.eu` and log in.
2. Click **Upload IFC** and drag-and-drop your file.
3. Provide a short *Project Name* (used across all plugins).
4. Hit **Start Upload**.

> ⏱️ Large models (>300 MB) process in the background and this can take a while...

---

## 3. Monitoring Progress

Your project appears with one of three badges:

| Badge | Meaning |
|-------|---------|
| **⏳ Processing** | IFC is still being parsed. Refresh occasionally. |
| **✅ Ready** | Quantities extracted successfully. Move on to Cost & LCA plugins. |
| **❌ Error** | Something went wrong. Open browser console to see logs (F12). |

---

## 4. Inspecting Quantities

1. Click a **Ready** project to open the element table.
2. Use the **Classification filter** on the left to jump to an eBKP group.
3. Columns show Gross/Net volumes, areas, lengths, etc.
4. **Highlighting rules**:
   * **Yellow** - missing quantity; investigate in your authoring tool.
   * **Red** - volume inconsistency (Net > Gross).

> **Tip:** Export the table to Excel via **Export → Elements (.xlsx)** for offline checks.

---

## 5. Fixing Common Issues

| Issue | What to do |
|-------|-----------|
| Missing quantities | Ensure the correct *Quantity Set* exists (see **Quantity Reference** doc). Re-export IFC and re-upload. |
| Materials not detected | Add proper **IfcMaterial** / **IfcMaterialLayerSet** / **IfcMaterialConstituentSet**. |
| eBKP code absent | Assign the code in your BIM authoring tool (IfcClassification or as custom property set `eBKP_Code`). |

Uploads are incremental—you may re-upload the corrected IFC under the same project. The plugin keeps the newest file.

---

## 6. Quantity Reference (Quick Table)

| Element type | Required Quantity | Quantity Set |
|--------------|------------------|--------------|
| Wall | GrossSideArea (m²) | `Qto_WallBaseQuantities` |
| Slab / Plate | GrossArea (m²) | `Qto_SlabBaseQuantities` / `Qto_PlateBaseQuantities` |
| Beam / Column | Length (m) | `Qto_BeamBaseQuantities` / `Qto_ColumnBaseQuantities` |
| Pile | GrossSurfaceArea (m²) | `Qto_PileBaseQuantities` |
| ALL | NetVolume or GrossVolume (m³) | respective `BaseQuantities` |

For a full list, see **IFC Modelling Guidelines**.

---

## 7. FAQ

**Q: Can I upload multiple disciplines (ARC, STR, MEP) separately?**  
A: No. We currently do not encourage mixing disciplines, except if models are clearly structured and do not contain the same construction elements in different files.

**Q: Is my model geometry stored?**  
A: Yes, but not inside Plugin QTO. The geometric elements plus some metadata get saved for the final dashboard view.

**Q: How do I delete a project?**  
A: Contact Admin; deletion removes data for all three plugins.

---

### Need help?
Email **support@fastbim5.eu** or consult the *Error Logs* panel for technical details to forward to the support team. 