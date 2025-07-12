---
id: qto-export
slug: /qto-export
title: Exporting to Excel
sidebar_label: Excel Export
---

> Need to share quantities with colleagues who don’t use NHMzh? Use the built-in Excel export.

---

## 1. How to Export

1. Open a *Ready* project.  
2. Click **Export → Elements (.xlsx)** in the top-right menu.  
3. Save the file locally - filename includes timestamp.

---

## 2. What’s Inside the File

Sheet | Contents
----- | ---------
`Elements` | Every element row exactly as displayed (GlobalId, IFC class, quantities, material names, eBKP, highlight status).
`Materials` | Aggregated list of unique materials with total volumes.
`Meta` | Project name, upload date, IFC filename, plugin version.

---

## 3. Typical Use Cases

• **Manual QA** - Use sorting and filtering o review problematic elements.  
• **Cost estimation** - Import the *Elements* sheet into your cost tool if you prefer offline workflows.  
• **Archiving** - Attach the file to milestone documentation.

---

## 4. Re-export After Changes

Whenever you re-upload an updated IFC, simply export again - the sheets always reflect the latest version.

---

### Need help?
Email **support@fastbim5.eu**. 