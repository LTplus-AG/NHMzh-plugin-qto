# 🏗️ QTO Plugin with IFC Integration

[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Material-UI](https://img.shields.io/badge/Material--UI-0081CB?style=for-the-badge&logo=material-ui&logoColor=white)](https://mui.com/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![License: AGPL](https://img.shields.io/badge/License-AGPL-blue.svg?style=for-the-badge)](https://www.gnu.org/licenses/agpl-3.0)

> A comprehensive Quantity Take-Off (QTO) application for BIM workflows that extracts, manipulates, and visualizes quantities from IFC models.

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
- 🔄 Event-driven architecture for integration with other systems

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

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose
- Python 3.8+
- Node.js 16+

### Using Docker

1. Clone the repository:

```bash
git clone <repository-url>
cd plugin-qto
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

This will build and serve the frontend through Nginx on port 80.

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

## 📖 Usage

1. Open the application in your browser (default: http://localhost:3004)
2. Drag and drop an IFC file in the upload area
3. Explore the eBKP structure in the top table
4. Analyze the extracted IFC elements grouped by type in the bottom section
5. Use the search feature to find specific elements
6. Edit quantities as needed
7. Send QTO data to Dtabase for integration with other systems

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

## 🖥️ Frontend Components

### Core Components

- **ObjectSearch**: Advanced search for IFC objects with autocompletion
- **ClassificationFilter**: Filter elements by classification system
- **ElementsHeader**: Controls for searching and filtering elements
- **EbkpGroupRow**: Displays groups of elements by classification
- **ElementRow**: Shows individual element details with quantity editing
- **MaterialsTable**: Displays material information for elements

### Workflow

1. Upload an IFC model to the backend
2. View extracted elements organized by classification
3. Search and filter elements as needed
4. Edit quantities if necessary
5. Send updated QTO data for integration with other systems

## 🔍 IFC Element Processing

The system processes IFC elements based on their class types and extracts quantities using the configuration in `ifc_quantities_config.py`. For example:

- **Walls and Slabs**: Area (m²) from GrossSideArea or GrossArea
- **Beams and Columns**: Length (m) from Length property
- **Materials**: Volumes calculated from element volume and material proportions

## ✏️ Quantity Editing

When editing quantities:

1. Original values are preserved
2. Change tracking is enabled
3. Edited values are highlighted
4. Changes can be reset

## 📝 Format

When sending QTO data to Kafka, the following JSON format is used:

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
  "ifc_id": "139",
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

### Element Fields Explanation

| Field               | Description                                               |
| ------------------- | --------------------------------------------------------- |
| `_id`               | MongoDB document identifier                               |
| `project_id`        | Reference to the project this element belongs to          |
| `ifc_id`            | ID from the original IFC file                             |
| `global_id`         | IFC GlobalId (UUID format)                                |
| `ifc_class`         | IFC entity type (e.g., IfcWall, IfcSlab)                  |
| `name`              | Instance name from IFC                                    |
| `type_name`         | Type/style name                                           |
| `level`             | Building story/level name                                 |
| `quantity`          | Current quantity with value, type (area/length), and unit |
| `original_quantity` | Original extracted quantity from IFC                      |
| `is_structural`     | Boolean indicating if element is load-bearing             |
| `is_external`       | Boolean indicating if element is exterior                 |
| `classification`    | Classification system details with id, name, and system   |
| `materials`         | Array of materials with name, volume, fraction, and unit  |
| `properties`        | Key-value store of all IFC property sets                  |
| `status`            | Element status (active, deleted, etc.)                    |
| `created_at`        | Timestamp of element creation                             |
| `updated_at`        | Timestamp of last element update                          |

## 💾 MongoDB Schema

Elements are stored with the following structure:

```javascript
{
  "project_id": ObjectId("..."),
  "ifc_id": "123",
  "global_id": "3Hu7R7nL9Epf72889UUqXF",
  "ifc_class": "IfcWall",
  "name": "Basic Wall:Interior - 165 Blockwork:123456",
  "type_name": "Basic Wall:Interior - 165 Blockwork",
  "level": "Level 1",
  "quantity": {
    "value": 10.5,
    "type": "area",
    "unit": "m²"
  },
  "original_quantity": {
    "value": 10.5,
    "type": "area"
  },
  "is_structural": true,
  "is_external": false,
  "classification": {
    "id": "321.41",
    "name": "Interior walls",
    "system": "EBKP"
  },
  "materials": [
    {
      "name": "Concrete",
      "volume": 2.3,
      "fraction": 0.8,
      "unit": "m³"
    }
  ],
  "properties": {
    "Pset_WallCommon.FireRating": "2H"
  },
  "status": "active"
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

## 📝 Notes

- The application features a resilient architecture - it can run with or without the backend, using simulated IFC data when needed.
- For production deployment, update the API URL in configuration and set proper CORS settings in the backend.
- The system is designed to work with a variety of IFC schemas and element types.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

AGPL

## 🙏 Acknowledgements

- IfcOpenShell for IFC parsing
- Material-UI for React components
- FastAPI for the backend framework
