---
id: qto-troubleshooting
slug: /qto-troubleshooting
title: Troubleshooting
sidebar_label: Troubleshooting
---

| Issue | Likely Cause | Solution |
|-------|--------------|----------|
| Upload stuck at *Processing* | Very large IFC (>500 MB) or invalid geometry | Wait; if still stuck after 30 min, split the model or validate in BIMcollab Zoom. |
| Yellow rows (missing quantity) | Missing QuantitySet in IFC | Add the correct QuantitySet, re-export. |
| Red rows (Net > Gross) | Openings not subtracted, units mismatch | Check element geometry and units in authoring tool. |
| Project not visible in Cost plugin | QTO not finished or you uploaded under a different project name | Wait for Ready status or ensure consistent names. |
| “Duplicate GlobalId” error | Same GlobalId appears multiple times in the same upload | Regenerate IDs or clean up models before upload. |

---

### Still stuck?
Send IFC sample to **support@fastbim5.eu**. 