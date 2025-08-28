# 📊 NHMzh Plugin-QTO: Mengenermittlung (Quantity Take-Off)

[![React](https://img.shields.io/badge/React-18.3-61DAFB.svg?style=for-the-badge&logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6.svg?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Python](https://img.shields.io/badge/Python-3.8-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg?style=for-the-badge)](https://www.gnu.org/licenses/agpl-3.0)

Zentrales Modul für die Mengenermittlung (QTO) aus IFC-Modellen im Nachhaltigkeitsmonitoring der Stadt Zürich (NHMzh).

## 📋 Inhaltsverzeichnis

- [Architektur](#-architektur)
- [Datenfluss und Integration](#-datenfluss-und-integration)
- [Funktionsumfang](#-funktionsumfang)
- [API-Endpunkte](#-api-endpunkte)
- [Datenbank-Schema](#-datenbank-schema)
- [Installation](#-installation)
- [Lizenz](#-lizenz)

---

### 🏛️ Architektur

Das QTO-Plugin besteht aus einem Frontend und einem Backend:

- **Frontend**: Eine **React/TypeScript**-Anwendung, die das interaktive UI für die Mengenermittlung (QTO) bereitstellt. Anstatt IFC-Dateien direkt hochzuladen, wählen Benutzer:innen ein Projekt aus, dessen IFC-Modell bereits vom Backend verarbeitet wurde. Das Frontend visualisiert die extrahierten Bauteile sowie deren Mengen und ermöglicht:
  - Die Bearbeitung der ermittelten Mengen.
  - Das manuelle Hinzufügen von neuen Elementen (z.B. für nicht-modellierte Bauteile).
  - Den Import und Export von Mengendaten via Excel.
  - Die finale Freigabe der Daten zur Nutzung durch nachgelagerte Module.
- **Backend**: Eine **Python/FastAPI**-Anwendung, die für die Verarbeitung der IFC-Dateien zuständig ist. Sie nutzt **IfcOpenShell** zum Parsen der Modelle und extrahiert Mengen, Materialien und Eigenschaften gemäss den [IFC-Modellierungsrichtlinien](./../../NHMzh-docs/IFC-Modellierungsrichtlinien_NHMzh.md).

### 🔄 Datenfluss und Integration

Das QTO-Plugin verarbeitet IFC-Modelle, die über einen asynchronen Workflow bereitgestellt werden. Der Upload-Prozess ist vom QTO-Frontend entkoppelt und wird durch den `qto_ifc-msg`-Service gesteuert.

1.  **Nachrichten-basierter Trigger**: Der `qto_ifc-msg`-Service empfängt eine Kafka-Nachricht über eine neue IFC-Datei, die von einem vorgelagerten Prozess in MinIO abgelegt wurde.
2.  **Datei-Übermittlung**: Der Service holt die IFC-Datei aus MinIO und leitet sie zur Verarbeitung an den `/upload-ifc/`-Endpunkt des QTO-Backends weiter.
3.  **Asynchrone Verarbeitung im Backend**: Das Backend parst das IFC-Modell in einer Hintergrundaufgabe.
4.  **Datenspeicherung**: Die extrahierten Daten (Elemente, Mengen, Materialien) werden in der `qto`-MongoDB-Datenbank gespeichert.
5.  **Visualisierung im Frontend**: Das QTO-Frontend lädt die verarbeiteten Projekte aus der Datenbank. Benutzer können die Daten hier einsehen, bearbeiten und zur weiteren Nutzung freigeben. Es findet **kein direkter IFC-Upload** über das Frontend statt.
6.  **Datenquelle für andere Module**: Die `qto`-Datenbank dient als primäre Datenquelle für nachgelagerte Module wie **Plugin-Cost** und **Plugin-LCA**.

Die Kommunikation zwischen den Modulen erfolgt **ausschliesslich über direkte Datenbankabfragen**. Das QTO-Plugin publiziert keine Elementdaten mehr an Kafka.

### ✨ Funktionsumfang

- **IFC-Parsing**: Extraktion von Geometrie, Mengen (Flächen, Längen, Volumen) und Eigenschaften aus IFC2x3- und IFC4-Dateien.
- **Material- und Schichtaufbau-Analyse**: Detaillierte Auswertung von `IfcMaterial` und `IfcMaterialLayerSet`.
- **eBKP-Klassifizierung**: Erkennung und Zuordnung von eBKP-Codes.
- **Excel-Import**: Ergänzt Elemente über die GUID und übernimmt eBKP-Klassifikationen aus Excel-Dateien.
- **Interaktive Datenvisualisierung**: Anzeige der extrahierten Daten in einer anpassbaren Tabelle.
- **Manuelle Datenbearbeitung**: Möglichkeit zur Korrektur und Ergänzung von Mengen und Attributen.
- **Asynchroner Upload**: Nicht-blockierende Verarbeitung grosser IFC-Modelle.

### 🔌 API-Endpunkte

Die FastAPI-Anwendung stellt unter anderem folgende Endpunkte bereit:

| Endpunkt                 | Methode | Beschreibung                               |
| ------------------------ | ------- | ------------------------------------------ |
| `/upload-ifc/`           | POST    | Lädt eine IFC-Datei zur Verarbeitung hoch. |
| `/ifc-jobs/{job_id}`     | GET     | Ruft den Status eines Verarbeitungsjobs ab.|
| `/projects/`             | GET     | Listet alle verfügbaren Projekte auf.      |
| `/projects/{name}/elements/` | GET     | Ruft alle Elemente eines Projekts ab.      |
| `/projects/{name}/approve/`| POST    | Schliesst die Bearbeitung eines Projekts ab.|

### 💾 Datenbank-Schema

Die primäre Sammlung in der `qto`-Datenbank ist `elements`. Jedes Dokument repräsentiert ein extrahiertes IFC-Bauteil.

**`qto.elements` Beispiel-Dokument:**
```json
{
  "_id": "ObjectId",
  "project_id": "ObjectId",
  "global_id": "3DqaUydM99ehywE4_2hm1u",
  "ifc_class": "IfcWall",
  "name": "Aussenwand_470mm",
  "level": "U1.UG_RDOK",
  "quantity": {
    "value": 555,
    "type": "area",
    "unit": "m²"
  },
  "classification": {
    "id": "C2.01",
    "name": "Aussenwandkonstruktion",
    "system": "eBKP"
  },
  "materials": [
    {
      "name": "Holzfaserdämmung",
      "volume": 8.5,
      "fraction": 0.875,
      "unit": "m³"
    }
  ],
  "properties": {
    "Pset_WallCommon.IsExternal": "True"
  },
  "status": "active",
  "created_at": "ISODate"
}
```

### 🚀 Installation

#### Voraussetzungen

- Docker und Docker Compose
- Python 3.8+
- Node.js 16+

#### Lokale Entwicklung

**Frontend (React):**
```bash
# Abhängigkeiten installieren
npm install
# Entwicklungsserver starten
npm run dev
```

**Backend (Python):**
```bash
cd backend
# Virtuelle Umgebung erstellen und aktivieren
python -m venv venv
source venv/bin/activate
# Abhängigkeiten installieren
pip install -r requirements.txt
# Backend-Server starten
uvicorn main:app --reload
```

### 📄 Lizenz

Dieses Projekt ist unter der GNU Affero General Public License v3.0 (AGPL-3.0) lizenziert.
