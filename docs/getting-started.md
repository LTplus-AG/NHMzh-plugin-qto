---
id: qto-getting-started
slug: /
title: QTO Plugin - Get Started
sidebar_label: Getting Started
---

Welcome to the **NHMzh Quantity-Take-Off (QTO)** plugin documentation.

Follow this roadmap to move from raw IFC to clean, quantity-rich data that can flow into Cost & LCA modules.

| Step | Doc link | What you’ll learn |
|------|----------|-------------------|
| 1️⃣ Upload & monitor | [Using the QTO Plugin](/qto-plugin-guide) | Upload process, progress badges, initial QA. |
| 2️⃣ Check model compliance | [IFC Requirements](/qto-ifc-requirements) | Supported schemas, classes, and export settings. |
| 3️⃣ Validate quantities | [Quantity Reference](/qto-quantities) • [Highlight Rules](/qto-highlights) | Required QuantitySets and colour-coded warnings. |
| 4️⃣ Confirm classification | [Classification Flow](/qto-classification) | How eBKP codes are extracted and why they matter. |
| 5️⃣ Manage versions | [Incremental Uploads](/qto-versioning) | Re-upload logic, merging, rollback. |
| 6️⃣ Share data | [Excel Export](/qto-export) | Contents of the .xlsx and typical use cases. |

---

## Quick Pre-Upload Checklist

- [ ] IFC uses **supported classes** only (see Requirements).  
- [ ] QuantitySets populated for walls, slabs, beams, columns, etc. 
- [ ] NetVolume & GrossVolume plausible (> 0, Net ≤ Gross).  
- [ ] Materials assigned (no *Default* placeholders).  
- [ ] eBKP codes present where possible.

Ticked all boxes? Upload and keep the browser tab open until status flips to **Ready**.

---

### Support
Need help? Email **support@fastbim5.eu** or check the *Troubleshooting* section. 