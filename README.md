# QTO Plugin with IFC Integration

This project is a Quantity Take-Off (QTO) application with IFC model integration. It displays eBKP structure based on the Swiss cost classification system and extracts elements from IFC files.

## Features

- eBKP structure display with expandable/collapsible rows
- IFC model upload and parsing
- IFC elements display grouped by type
- Property extraction from IFC elements

## Project Structure

```
plugin-qto/
  ├── src/              # Frontend React app
  ├── backend/          # Python FastAPI backend for IFC parsing
  ├── data/             # Static data files
  └── public/           # Public assets
```

## Setup and Installation

### Frontend (React)

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

### Backend (Python)

1. Navigate to the backend directory:

   ```bash
   cd backend
   ```

2. Create a virtual environment (recommended):

   ```bash
   python -m venv venv

   # On Windows
   venv\Scripts\activate

   # On macOS/Linux
   source venv/bin/activate
   ```

3. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

4. Start the backend server:
   ```bash
   uvicorn main:app --reload
   ```

## Usage

1. Open the application in your browser (default: http://localhost:3000)
2. Drag and drop an IFC file in the upload area
3. View the eBKP structure in the top table
4. View the extracted IFC elements grouped by type in the bottom section

## API Endpoints

The backend provides the following API endpoints:

- `GET /`: Welcome message
- `POST /upload-ifc/`: Upload an IFC file and get a model ID
- `GET /ifc-elements/{model_id}`: Get all elements from a specific model
- `GET /models`: List all uploaded models
- `DELETE /models/{model_id}`: Delete a model
- `GET /simulation/ifc-elements`: Get simulated IFC elements (for testing)

## Technologies

- Frontend:

  - React
  - Material-UI
  - TypeScript

- Backend:
  - Python
  - FastAPI
  - IfcOpenShell (for IFC parsing)

## Notes

- The application can run with or without the backend. If the backend is not available, it will use simulated IFC data.
- For production deployment, update the API URL in `MainPage.tsx` and configure proper CORS settings in the backend.
