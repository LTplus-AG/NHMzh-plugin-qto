#!/bin/bash

echo "Starting QTO Plugin with IFC Integration..."

# Start the Python backend
echo "Starting Python backend..."
(cd backend && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt && uvicorn main:app --reload) &

# Wait a moment for the backend to initialize
echo "Waiting for backend to initialize..."
sleep 5

# Start the React frontend
echo "Starting React frontend..."
npm install && npm run dev &

echo "Both servers are starting. You can access the application at http://localhost:3000"

# Keep the script running
wait 