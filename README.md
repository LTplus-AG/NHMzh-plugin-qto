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
