@echo off
echo Starting QTO Plugin with IFC Integration...

:: Start the Python backend
echo Starting Python backend...
start cmd /k "cd backend && python -m venv venv && venv\Scripts\activate && pip install -r requirements.txt && uvicorn main:app --reload"

:: Wait a moment for the backend to initialize
timeout /t 5

:: Start the React frontend
echo Starting React frontend...
start cmd /k "npm install && npm run dev"

echo Both servers are starting. You can access the application at http://localhost:3000 