# 📊 NHMzh Plugin QTO (Quantity Take-Off)

[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Material-UI](https://img.shields.io/badge/Material--UI-0081CB?style=for-the-badge&logo=material-ui&logoColor=white)](https://mui.com/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![License: AGPL](https://img.shields.io/badge/License-AGPL-blue.svg?style=for-the-badge)](https://www.gnu.org/licenses/agpl-3.0)
[![Version](https://img.shields.io/badge/Version-1.0.0-brightgreen.svg?style=for-the-badge)](https://github.com/LTplus-AG/NHMzh-plugin-qto)

Quantity Take-Off (QTO) module for the Nachhaltigkeitsmonitoring der Stadt Zürich (NHMzh) that extracts, manipulates, and visualizes quantities from IFC models.

## 📋 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Project Structure](#-project-structure)
- [Installation](#-installation)
- [Kafka Topics](#-kafka-topics)
- [Usage](#-usage)
- [API Endpoints](#-api-endpoints)
- [Data Models](#-data-models)
- [Tech Stack](#-tech-stack)
- [Integration](#-integration)
- [License](#-license)

## ✨ Features

- 📊 Interactive eBKP structure with expandable/collapsible rows
- 📤 Drag-and-drop IFC model upload and smart parsing
- 🔍 Intelligent IFC elements grouping by type and classification
- 📐 Automatic quantity extraction based on element type (area, length, volume)
- 🧮 Material volume calculation and analysis
- 🔎 Advanced search with autocomplete for finding elements
- ✏️ Quantity editing with change tracking and history
- 📡 Integration with Kafka for event publishing
- 💾 Data persistence with MongoDB
- 🚦 Classification filtering (EBKP, etc.)
- 🔄 Event-driven architecture for integration with other NHMzh modules

## 🔧 Architecture

### Backend

- **FastAPI** application with endpoints for IFC processing
- **IfcOpenShell** for parsing IFC files
- **Kafka Producer** for publishing QTO events
- **MongoDB** for storing element and project data

### Frontend

- **React/TypeScript** with Material-UI components
- **MUI DataGrid** for efficient element display
- **Component-based** architecture for maintainability

## 🗂️ Project Structure

```
plugin-qto/
  ├── src/              # Frontend React app
  │   ├── components/   # React components
  │   │   ├── IfcElements/  # Element-related components
  │   ├── types/        # TypeScript type definitions
  ├── backend/          # Python FastAPI backend for IFC parsing
  │   ├── main.py       # Main API application
  │   ├── qto_producer.py  # Kafka producer for QTO data
  │   ├── ifc_quantities_config.py  # Configuration for quantity extraction
  ├── public/           # Public assets
  ├── data/             # Static data files
  └── dist/             # Build output
```

## 🚀 Installation

### Prerequisites

- Docker and Docker Compose
- Python 3.8+
- Node.js 16+

### Using Docker

1. Clone the repository:

```bash
git clone https://github.com/LTplus-AG/NHMzh-plugin-qto.git
cd NHMzh-plugin-qto
```

2. Start with Docker Compose:

```bash
docker-compose up -d
```

This will start:

- Kafka broker and UI
- Backend API on port 8000
- Frontend development server on port 3004

3. For production deployment:

```bash
docker-compose up frontend
```

### Local Development

#### Frontend (React)

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

#### Backend (Python)

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows
venv\Scripts\activate
# On macOS/Linux
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the backend server
uvicorn main:app --reload
```

## 📡 Kafka Topics

The QTO plugin publishes element and project data to Kafka topics. Based on the implementation in `qto_producer.py`:

- Project updates are sent with an `eventType` of `PROJECT_UPDATED` containing project metadata
- Element data is structured with properties including:
  - IFC class information
  - Element quantity data (area, volume, etc.)
  - Classification information (EBKP)
  - Material composition and volumes 
  - Structural properties

Elements are sent in batched format for efficient processing by downstream modules. The QTO plugin serves as the primary data source for the NHMzh ecosystem, providing the foundation for both cost calculations and LCA analyses.

## 📖 Usage

1. Open the application in your browser (default: http://localhost:3004)
2. Drag and drop an IFC file in the upload area
3. Explore the eBKP structure in the top table
4. Analyze the extracted IFC elements grouped by type in the bottom section
5. Use the search feature to find specific elements
6. Edit quantities as needed
7. Send QTO data to other NHMzh modules for integration

## 🔌 API Endpoints

| Endpoint                   | Method | Description                            |
| -------------------------- | ------ | -------------------------------------- |
| `/`                        | GET    | Welcome message                        |
| `/upload-ifc/`             | POST   | Upload an IFC file for processing      |
| `/ifc-elements/{model_id}` | GET    | Retrieve elements from a model         |
| `/send-qto/`               | POST   | Send QTO data to Kafka                 |
| `/qto-elements/{model_id}` | GET    | Get elements formatted for QTO display |
| `/models`                  | GET    | List all uploaded models               |
| `/models/{model_id}`       | DELETE | Delete a model                         |
| `/health`                  | GET    | Check service health                   |

## 💾 Data Models

### Element Data Format

When sending data to Kafka, a notification message is sent with project metadata and element count:

```json
{
  "eventType": "PROJECT_UPDATED",
  "timestamp": "2023-01-01T12:00:00Z",
  "producer": "plugin-qto",
  "payload": {
    "projectId": "67e39625158688f60bbd807a",
    "projectName": "Project Name",
    "elementCount": 100
  },
  "metadata": {
    "version": "1.0",
    "correlationId": "abc123"
  }
}
```

Each element in MongoDB is stored with the following structure:

```json
{
  "_id": {
    "$oid": "67f2d5c1e266a64f97f4c87c"
  },
  "project_id": {
    "$oid": "67e39625158688f60bbd807a"
  },
  "ifc_id": "3DqaUydM99ehywE4_2hm1u",
  "global_id": "3DqaUydM99ehywE4_2hm1u",
  "ifc_class": "IfcWall",
  "name": "Basic Wall:Holz Aussenwand_470mm:2270026",
  "type_name": "Basic Wall:Holz Aussenwand_470mm",
  "level": "U1.UG_RDOK",
  "quantity": {
    "value": 555,
    "type": "area",
    "unit": "m²"
  },
  "original_quantity": {
    "value": 68.8941199200415,
    "type": "area"
  },
  "is_structural": true,
  "is_external": false,
  "classification": {
    "id": "C4",
    "name": "Deckenkonstruktion, Dachkonstruktion",
    "system": "EBKP"
  },
  "materials": [
    {
      "name": "_Holz_wg",
      "unit": "m³",
      "volume": 1.35783,
      "fraction": 0.04255
    },
    {
      "name": "_Staenderkonstruktion_ungedaemmt_wg",
      "unit": "m³",
      "volume": 1.69729,
      "fraction": 0.05319
    }
  ],
  "properties": {
    "Pset_BuildingStoreyElevation": {
      "Name": "U1.UG_RDOK"
    },
    "Qto_WallBaseQuantities.Height": "3.500",
    "Qto_WallBaseQuantities.Length": "19.684",
    "Qto_WallBaseQuantities.Width": "0.470",
    "Qto_WallBaseQuantities.GrossSideArea": "68.894",
    "Pset_WallCommon.IsExternal": "True",
    "Pset_WallCommon.LoadBearing": "True"
  },
  "status": "active",
  "created_at": {
    "$date": "2025-04-06T19:28:01.209Z"
  },
  "updated_at": {
    "$date": "2025-04-06T19:28:01.209Z"
  }
}
```

## 🛠️ Tech Stack

### Frontend

- **React** - UI library
- **Material-UI** - Component library
- **TypeScript** - Type-safe JavaScript

### Backend

- **Python** - Backend language
- **FastAPI** - API framework
- **IfcOpenShell** - IFC parsing library
- **Kafka** - Message broker
- **MongoDB** - Database for element storage

## 🔗 Integration

The QTO plugin is a core component of the NHMzh ecosystem and integrates with:

- **Cost Plugin**: Provides element quantities for cost calculations (see [NHMzh-plugin-cost](https://github.com/LTplus-AG/NHMzh-plugin-cost))
- **LCA Plugin**: Supplies material volumes for life cycle assessment (see [NHMzh-plugin-lca](https://github.com/LTplus-AG/NHMzh-plugin-lca))
- **Central Database**: Stores element data for the entire NHMzh platform

## 📄 License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).

GNU Affero General Public License v3.0 (AGPL-3.0): This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

See <https://www.gnu.org/licenses/agpl-3.0.html> for details.
