---
id: qto-classification
slug: /qto-classification
title: eBKP Classification in QTO
sidebar_label: Classification Flow
---

> Assigning eBKP codes early means fewer manual steps later. QTO preserves whatever it finds - Cost & LCA rely on it.

---

## 1. How QTO Extracts Codes

1. **IfcClassificationReference** with source *eBKP* (same logic as LCA).  
2. Fallback property: `IfcPropertySet "Classification" → eBKP_Code`.  
3. Stored verbatim in Mongo (`elements.properties.ebkp_code`).

No automatic mapping is done at this stage - you see exactly what your IFC contains.

---

## 2. Viewing Codes

• Use the **Classification filter** on the left: start typing `C2.01` to isolate walls, etc.  
• The element table shows the code in its own column.

---

## 3. Fixing or Adding Codes

Same methods as in the LCA guide: BIM authoring tool or **ifcclassify.com** for a rule-based update, then re-upload.

---

## 4. Impact on Downstream Modules

| Situation | Cost plugin | LCA plugin |
|-----------|-------------|------------|
| Valid eBKP | Auto-matches Kennwerte, sets amortisation | Computes relative impacts |
| Missing / invalid | Requires manual mapping | Relative view disabled (absolute only) |

---

### Need help?
Email **support@fastbim5.eu** or see the *Troubleshooting* page. 