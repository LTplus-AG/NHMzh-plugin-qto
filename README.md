# 🏗️ QTO Plugin with IFC Integration

[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Material-UI](https://img.shields.io/badge/Material--UI-0081CB?style=for-the-badge&logo=material-ui&logoColor=white)](https://mui.com/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![License: AGPL](https://img.shields.io/badge/License-AGPL-blue.svg?style=for-the-badge)](https://www.gnu.org/licenses/agpl-3.0)

> Quantity Take-Off (QTO) application for NHMzh

## ✨ Features

- 📊 Interactive eBKP structure with expandable/collapsible rows
- 📤 Drag-and-drop IFC model upload and smart parsing
- 🔍 Intelligent IFC elements grouping by type
- 📝 Comprehensive property extraction from IFC elements

## 🗂️ Project Structure

```
plugin-qto/
  ├── src/              # Frontend React app
  ├── backend/          # Python FastAPI backend for IFC parsing
  ├── data/             # Static data files
  └── public/           # Public assets
```

## 🚀 Quick Start

### Frontend (React)

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Backend (Python)

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

1. Open the application in your browser (default: http://localhost:3000)
2. Drag and drop an IFC file in the upload area
3. Explore the eBKP structure in the top table
4. Analyze the extracted IFC elements grouped by type in the bottom section

## 🔌 API Endpoints

| Endpoint                   | Method | Description                              |
| -------------------------- | ------ | ---------------------------------------- |
| `/`                        | GET    | Welcome message                          |
| `/upload-ifc/`             | POST   | Upload an IFC file and get a model ID    |
| `/ifc-elements/{model_id}` | GET    | Get all elements from a specific model   |
| `/models`                  | GET    | List all uploaded models                 |
| `/models/{model_id}`       | DELETE | Delete a model                           |
| `/simulation/ifc-elements` | GET    | Get simulated IFC elements (for testing) |

## 📝 Kafka Message Format

When sending QTO data to Kafka, the following JSON format is used:

```json
{
  "project": "project_name",
  "filename": "ifc_filename.ifc",
  "timestamp": "2023-12-31T12:00:00Z",
  "file_id": "ifc_filename_2023-12-31T12:00:00Z",
  "elements": [
    {
      "id": "1HFUtCRj9D3RelhQMZCBu8",
      "category": "ifcwall",
      "level": "EG",
      "area": 24.56,
      "is_structural": true,
      "is_external": false,
      "ebkph": "C2.1",
      "materials": [
        {
          "name": "Concrete",
          "fraction": 0.78,
          "volume": 2.45
        },
        {
          "name": "Insulation",
          "fraction": 0.22,
          "volume": 0.65
        }
      ],
      "classification": {
        "id": "C2.1",
        "name": "Innenwand",
        "system": "EBKP"
      }
    }
  ]
}
```

### Message Fields Explanation

| Field       | Description                                                            |
| ----------- | ---------------------------------------------------------------------- |
| `project`   | Project name                                                           |
| `filename`  | Original IFC filename                                                  |
| `timestamp` | ISO 8601 timestamp when the data was sent                              |
| `file_id`   | Unique identifier for the file (combination of filename and timestamp) |
| `elements`  | Array of building elements extracted from the IFC file                 |

#### Element Fields

| Field            | Description                                     |
| ---------------- | ----------------------------------------------- |
| `id`             | Global unique ID of the element                 |
| `category`       | Element type/category (e.g., ifcwall, ifcslab)  |
| `level`          | Building level or story                         |
| `area`           | Surface area in square meters                   |
| `is_structural`  | Boolean indicating if the element is structural |
| `is_external`    | Boolean indicating if the element is external   |
| `ebkph`          | eBKP-H classification code                      |
| `materials`      | Array of materials used in the element          |
| `classification` | Classification information (optional)           |

## 🛠️ Tech Stack

### Frontend

- **React** - UI library
- **Material-UI** - Component library
- **TypeScript** - Type-safe JavaScript

### Backend

- **Python** - Backend language
- **FastAPI** - API framework
- **IfcOpenShell** - IFC parsing library

## 📝 Notes

- The application features a resilient architecture - it can run with or without the backend, using simulated IFC data when needed.
- For production deployment, update the API URL in `MainPage.tsx` and configure proper CORS settings in the backend.

## 📄 License

AGPL

# QTO Plugin

This plugin provides Quantity Takeoff (QTO) functionality for IFC models.

## Docker Setup

### Prerequisites

- Docker and Docker Compose installed
- Git (to clone the repository)

### Running the application

1. Clone the repository:

```bash
git clone <repository-url>
cd plugin-qto
```

2. Configure environment variables (optional):

   - Copy `.env.example` to `.env` if needed and adjust settings

3. Start the development environment:

```bash
docker-compose up
```

This will start:

- Kafka broker and UI
- Backend API on port 8000
- Frontend development server on port 3004

4. For production deployment:

```bash
docker-compose up frontend
```

This will build and serve the frontend through Nginx on port 80.

### Architecture

The system consists of three main components:

1. **Backend**: A FastAPI application that processes IFC files using ifcopenshell and sends QTO data to Kafka
2. **Frontend**: A React application that provides the user interface
3. **Kafka**: A message broker for sending QTO data to other systems

### Environment Variables

| Variable           | Description                       | Default               |
| ------------------ | --------------------------------- | --------------------- |
| API_URL            | URL for the backend API           | http://localhost:8000 |
| FRONTEND_PORT      | Port for the development frontend | 3004                  |
| FRONTEND_PROD_PORT | Port for the production frontend  | 80                    |
| BACKEND_PORT       | Port for the backend API          | 8000                  |
| KAFKA_QTO_TOPIC    | Kafka topic for QTO data          | qto-elements          |

See `.env` file for more configuration options.

### Development

The development environment mounts the source code as volumes, so changes to the code will be reflected immediately without rebuilding the containers.

### Production Deployment

For production, the frontend is built and served through Nginx, which also proxies API requests to the backend.

Make sure to set proper environment variables for production deployment, especially the API_URL.
