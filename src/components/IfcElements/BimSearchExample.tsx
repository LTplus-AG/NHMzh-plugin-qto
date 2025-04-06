import React, { useState, useEffect } from "react";
import { Box, Typography, Paper, Alert, Button } from "@mui/material";
import BimObjectSearch from "./BimObjectSearch";

// Sample BIM elements for demonstration
const sampleElements = [
  {
    id: "1",
    name: "Wall-01",
    element_type: "IfcWall",
    properties: {
      level: "EG",
      is_structural: true,
      is_external: true,
      material: "Beton",
      thickness: "240mm",
    },
  },
  {
    id: "2",
    name: "Window-123",
    element_type: "IfcWindow",
    properties: {
      level: "1.OG",
      is_structural: false,
      is_external: true,
      width: "900mm",
      height: "1200mm",
    },
  },
  {
    id: "3",
    name: "Concrete Column Type A",
    element_type: "IfcColumn",
    properties: {
      level: "EG",
      is_structural: true,
      is_external: false,
      material: "Beton",
      diameter: "400mm",
    },
  },
  {
    id: "4",
    name: "Steel Beam X-223",
    element_type: "IfcBeam",
    properties: {
      level: "2.OG",
      is_structural: true,
      is_external: false,
      material: "Stahl",
      profile: "IPE 300",
    },
  },
  {
    id: "5",
    name: "Interior Door",
    element_type: "IfcDoor",
    properties: {
      level: "EG",
      is_structural: false,
      is_external: false,
      width: "900mm",
      height: "2100mm",
    },
  },
];

interface BimElement {
  id: string;
  name?: string;
  element_type?: string;
  properties?: {
    level?: string;
    category?: string;
    is_structural?: boolean;
    is_external?: boolean;
    [key: string]: any;
  };
}

const BimSearchExample: React.FC = () => {
  const [elements, setElements] = useState<BimElement[]>([]);
  const [selectedElement, setSelectedElement] = useState<BimElement | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Simulate loading data from an API
  useEffect(() => {
    // In a real application, this would be an API call
    const loadElements = async () => {
      try {
        setLoading(true);
        // Simulate network delay
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Set sample data
        setElements(sampleElements);
        setError(null);
      } catch (err) {
        setError("Failed to load BIM elements");
        console.error("Error loading elements:", err);
      } finally {
        setLoading(false);
      }
    };

    loadElements();
  }, []);

  const handleElementSelect = (element: BimElement | null) => {
    setSelectedElement(element);
    console.log("Selected element:", element);
  };

  // Render properties table for the selected element
  const renderProperties = (element: BimElement) => {
    if (!element.properties) return null;

    return (
      <Box
        component="table"
        sx={{ width: "100%", borderCollapse: "collapse", mt: 2 }}
      >
        <thead>
          <tr>
            <Box
              component="th"
              sx={{
                textAlign: "left",
                p: 1,
                borderBottom: "1px solid",
                borderColor: "divider",
              }}
            >
              Eigenschaft
            </Box>
            <Box
              component="th"
              sx={{
                textAlign: "left",
                p: 1,
                borderBottom: "1px solid",
                borderColor: "divider",
              }}
            >
              Wert
            </Box>
          </tr>
        </thead>
        <tbody>
          {Object.entries(element.properties).map(([key, value]) => (
            <tr key={key}>
              <Box
                component="td"
                sx={{
                  p: 1,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                }}
              >
                {key}
              </Box>
              <Box
                component="td"
                sx={{
                  p: 1,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                }}
              >
                {typeof value === "boolean"
                  ? value
                    ? "Ja"
                    : "Nein"
                  : String(value)}
              </Box>
            </tr>
          ))}
        </tbody>
      </Box>
    );
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        BIM Objekt Suche Demo
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ mb: 4 }}>
        <BimObjectSearch
          elements={elements}
          onElementSelect={handleElementSelect}
          width="100%"
        />

        {loading && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Lade BIM Elemente...
          </Typography>
        )}
      </Box>

      {selectedElement ? (
        <Paper elevation={1} sx={{ p: 3, borderRadius: 2 }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 2,
            }}
          >
            <Typography variant="h6">{selectedElement.name}</Typography>
            <Typography
              variant="body2"
              sx={{
                backgroundColor: "primary.light",
                color: "primary.dark",
                px: 1.5,
                py: 0.5,
                borderRadius: 1,
                fontWeight: 500,
              }}
            >
              {selectedElement.element_type?.replace("Ifc", "")}
            </Typography>
          </Box>

          <Typography variant="body1" gutterBottom>
            Element ID: {selectedElement.id}
          </Typography>

          <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>
            Eigenschaften:
          </Typography>

          {renderProperties(selectedElement)}

          <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 3 }}>
            <Button variant="outlined" onClick={() => setSelectedElement(null)}>
              Zurücksetzen
            </Button>
          </Box>
        </Paper>
      ) : (
        <Paper
          elevation={0}
          sx={{
            p: 4,
            borderRadius: 2,
            border: "1px dashed",
            borderColor: "divider",
            textAlign: "center",
          }}
        >
          <Typography variant="body1" color="text.secondary">
            Kein Element ausgewählt. Nutzen Sie die Suche, um ein BIM Objekt
            auszuwählen.
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default BimSearchExample;
