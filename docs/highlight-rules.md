---
id: qto-highlight-rules
slug: /qto-highlights
title: Table Highlight Rules
sidebar_label: Highlight Rules
---

> The colour coding inside the element table is your first QA dashboard. Fix hoghlighted cells **before** switching to Cost or LCA plugins.

---

## 1. Colour Legend

| Colour | Meaning | Typical Fix |
|--------|---------|-------------|
| **Yellow** | Missing primary quantity (e.g., NetVolume = 0). | Add the required QuantitySet in your BIM tool and re-export IFC. |
| **Red** | Invalid ratios (NetVolume > GrossVolume) or negative values. | Check units, ensure openings are modelled correctly. |

---

## 2. Where the Rules Live

Implemented in `utils/zeroQuantityHighlight.ts` and called within every row component. The logic is identical across Wall, Slab and Beam tables.

---

## 3. Workflow Recommendation

1. Upload IFC → open project.  
2. Have a close look at *highlighted rows*.
3. Fix issues in modelling software.  
4. Re-upload under same project name.  Warning highlighting should disappear.

Remember: downstream plugins cannot work with elements that have missing quantities.

---

### Need help?
Email **support@fastbim5.eu** with a screenshot of the highlighted row. 