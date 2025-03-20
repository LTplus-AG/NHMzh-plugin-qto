import {
  Alert,
  Button,
  FormControl,
  FormLabel,
  MenuItem,
  Select,
  Snackbar,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import FileUpload from "./FileUpload";
import IfcElementsList from "./IfcElementsList";
import { IFCElement, UploadedFile } from "./types";
import SendIcon from "@mui/icons-material/Send";

// Define API URL - using relative path for proxy to avoid HTTPS upgrade issues
const API_URL = "/api";

const MainPage = () => {
  const Instructions = [
    {
      label: "Modell hochladen",
      description: `Laden Sie Ihr Modell hoch, anschließend wird dieses gegen die bereitgestellten Information Delivery Specifications (IDS) geprüft.`,
    },
    {
      label: "Modell senden",
      description:
        'Nach erfolgreicher Prüfung reichen Sie Ihr Modell über den Button "Freigeben" ein.',
    },
  ];

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);

  // IFC elements state
  const [ifcElements, setIfcElements] = useState<IFCElement[]>([]);
  const [ifcLoading, setIfcLoading] = useState(false);
  const [ifcError, setIfcError] = useState<string | null>(null);

  // Kafka send state
  const [kafkaSending, setKafkaSending] = useState(false);
  const [kafkaSuccess, setKafkaSuccess] = useState<boolean | null>(null);
  const [kafkaError, setKafkaError] = useState<string | null>(null);

  // Backend connectivity state
  const [backendConnected, setBackendConnected] = useState(false);
  const [connectionChecked, setConnectionChecked] = useState(false);
  const [showConnectionError, setShowConnectionError] = useState(false);

  // Check backend connectivity on load
  useEffect(() => {
    checkBackendConnectivity();
  }, []);

  // Function to check if backend is available
  const checkBackendConnectivity = async () => {
    const url = `${API_URL}/health`;
    console.log("Checking backend connectivity at:", url);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        // Set a short timeout to quickly detect if backend is down
        signal: AbortSignal.timeout(3000),
      });

      if (response.ok) {
        setBackendConnected(true);
        console.log("Backend connection successful");
        // Get the ifcopenshell version from response
        const data = await response.json();
        console.log(`Using ifcopenshell version: ${data.ifcopenshell_version}`);
      } else {
        setBackendConnected(false);
        console.warn(
          "Backend health check failed with status:",
          response.status
        );
        setShowConnectionError(true);
      }
    } catch (error) {
      console.warn("Backend connectivity check failed:", error);
      setBackendConnected(false);
      setShowConnectionError(true);
    } finally {
      setConnectionChecked(true);
    }
  };

  // Function to try to load the list of models from the backend on startup
  useEffect(() => {
    if (backendConnected) {
      loadModelsList();
    }
  }, [backendConnected]);

  // Function to load the list of available models from the backend
  const loadModelsList = async () => {
    try {
      const response = await fetch(`${API_URL}/models`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Failed to load models list: ${response.statusText}`);
      }

      const models = await response.json();
      if (Array.isArray(models) && models.length > 0) {
        const modelFiles: UploadedFile[] = models.map((model) => ({
          filename: model.filename,
          created_at: new Date().toISOString(),
          modelId: model.model_id,
        }));
        setUploadedFiles(modelFiles);
      }
    } catch (error) {
      console.error("Error loading models list:", error);
    }
  };

  // Function to fetch IFC elements for a specific model
  const fetchIfcElements = async (modelId: string) => {
    if (!backendConnected || !modelId) {
      setIfcError(
        "Backend is not connected. Please make sure the server is running."
      );
      return;
    }

    try {
      setIfcLoading(true);
      setIfcError(null);

      // First try to get QTO-formatted elements
      try {
        const qtoResponse = await fetch(`${API_URL}/qto-elements/${modelId}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(10000), // 10 second timeout
        });

        if (qtoResponse.ok) {
          const qtoData = await qtoResponse.json();
          console.log("Using QTO-formatted elements:", qtoData);

          // Map QTO elements format to IFCElement format
          interface QTOElement {
            id: string;
            category: string;
            level: string;
            area: number;
            is_structural: boolean;
            is_external: boolean;
            ebkph: string;
            materials: Array<{
              name: string;
              fraction: number;
              volume: number;
            }>;
            classification?: {
              id: string;
              name: string;
              system: string;
            };
          }

          const mappedElements = qtoData.map((el: QTOElement) => ({
            id: el.id,
            global_id: el.id, // Use id as global_id for compatibility
            type: el.category,
            name: el.category,
            description: null,
            properties: {},
            // QTO specific fields
            category: el.category,
            level: el.level,
            area: el.area,
            is_structural: el.is_structural,
            is_external: el.is_external,
            ebkph: el.ebkph,
            materials: el.materials,
            // Map classification data if available
            classification_id: el.classification?.id || null,
            classification_name: el.classification?.name || null,
            classification_system: el.classification?.system || null,
          }));

          setIfcElements(mappedElements);
          setIfcLoading(false);
          return;
        }
      } catch (qtoError) {
        console.warn(
          "Error fetching QTO elements, falling back to standard IFC elements:",
          qtoError
        );
      }

      // Fallback to standard IFC elements if QTO endpoint fails
      const response = await fetch(`${API_URL}/ifc-elements/${modelId}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch IFC elements: ${response.statusText}`);
      }

      const data = await response.json();
      setIfcElements(data);
    } catch (error) {
      console.error(`Error fetching IFC elements for model ${modelId}:`, error);
      setIfcError(
        "Could not load IFC elements from server. Please try uploading the file again."
      );
    } finally {
      setIfcLoading(false);
    }
  };

  // Handlers for FileUpload component
  const handleFileSelected = (file: UploadedFile) => {
    setSelectedFile(file);

    // If the file has a modelId, fetch its IFC elements
    if (file.modelId && backendConnected) {
      fetchIfcElements(file.modelId);
    } else {
      setIfcError(
        "No model ID associated with this file or backend not connected."
      );
    }
  };

  const handleFileUploaded = (newFile: UploadedFile) => {
    setUploadedFiles((prev) => [newFile, ...prev]);
  };

  // Function to send QTO data to Kafka
  const sendQtoToKafka = async () => {
    if (!selectedFile?.modelId) {
      setKafkaError("No model is selected");
      setKafkaSuccess(false);
      return;
    }

    if (ifcElements.length === 0) {
      setKafkaError("No elements found in model. Please reload the model.");
      setKafkaSuccess(false);
      return;
    }

    try {
      setKafkaSending(true);
      setKafkaError(null);
      setKafkaSuccess(null);

      // First check if the model is still available on the server
      try {
        const checkResponse = await fetch(
          `${API_URL}/ifc-elements/${selectedFile.modelId}`,
          {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(5000),
          }
        );

        if (!checkResponse.ok) {
          // If the model is not found, try to reload the model list
          await loadModelsList();
          throw new Error(
            "Model not found on server. It may have been deleted or the server was restarted."
          );
        }
      } catch (checkError) {
        throw new Error(
          `Failed to verify model: ${
            checkError instanceof Error
              ? checkError.message
              : String(checkError)
          }`
        );
      }

      const response = await fetch(
        `${API_URL}/send-qto/?model_id=${selectedFile.modelId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(10000), // 10 second timeout
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(
            "Model not found on server. It may have been deleted or the server was restarted."
          );
        } else {
          throw new Error(`Failed to send QTO data: ${response.statusText}`);
        }
      }

      const data = await response.json();
      console.log("QTO data sent successfully:", data);
      setKafkaSuccess(true);
    } catch (error) {
      console.error("Error sending QTO data to Kafka:", error);
      setKafkaError(
        `Error sending QTO data: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      setKafkaSuccess(false);
    } finally {
      setKafkaSending(false);
    }
  };

  // Handle closing the connection error snackbar
  const handleCloseConnectionError = () => {
    setShowConnectionError(false);
  };

  // Handle closing the kafka result snackbar
  const handleCloseKafkaSnackbar = () => {
    setKafkaSuccess(null);
    setKafkaError(null);
  };

  return (
    <div
      className="w-full flex h-full overflow-hidden"
      style={{ height: "100vh" }}
    >
      {/* Backend Connection Error Snackbar */}
      <Snackbar
        open={showConnectionError}
        autoHideDuration={6000}
        onClose={handleCloseConnectionError}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={handleCloseConnectionError}
          severity="warning"
          sx={{ width: "100%" }}
        >
          Backend server connection failed. Please make sure the server is
          running.
        </Alert>
      </Snackbar>

      {/* Kafka Send Result Snackbar */}
      <Snackbar
        open={kafkaSuccess !== null || kafkaError !== null}
        autoHideDuration={6000}
        onClose={handleCloseKafkaSnackbar}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={handleCloseKafkaSnackbar}
          severity={kafkaSuccess ? "success" : "error"}
          sx={{ width: "100%" }}
        >
          {kafkaSuccess
            ? "QTO data successfully sent to Kafka"
            : kafkaError || "Error sending QTO data"}
        </Alert>
      </Snackbar>

      {/* Sidebar */}
      <div className="sidebar text-primary">
        {/* Header und Inhalte */}
        <div>
          <Typography
            variant="h3"
            className="text-5xl mb-2 font-thin tracking-wide"
            color="black"
          >
            Mengenermittlung
          </Typography>
          <div className="flex flex-col mt-2 gap-1">
            <FormLabel focused htmlFor="select-project">
              Projekt:
            </FormLabel>
            <FormControl variant="outlined" focused>
              <Select
                id="select-project"
                size="small"
                value={"Projekt 1"}
                labelId="select-project"
              >
                <MenuItem value={"Projekt 1"}>
                  Recyclingzentrum Juch-Areal
                </MenuItem>
                <MenuItem value={"Projekt 2"}>
                  Gesamterneuerung Stadthausanlage
                </MenuItem>
                <MenuItem value={"Projekt 3"}>Amtshaus Walche</MenuItem>
                <MenuItem value={"Projekt 4"}>
                  Gemeinschaftszentrum Wipkingen
                </MenuItem>
              </Select>
            </FormControl>
          </div>
        </div>

        {/* Backend Status Indicator */}
        {connectionChecked && (
          <div className="mt-2 px-2 py-1 text-xs flex items-center">
            <span
              className={`inline-block w-2 h-2 rounded-full mr-2 ${
                backendConnected ? "bg-green-500" : "bg-red-500"
              }`}
            ></span>
            <span>
              {backendConnected
                ? "Backend connected"
                : "Backend not available - IFC processing will fail"}
            </span>
          </div>
        )}

        {/* File Upload Component */}
        <FileUpload
          apiUrl={API_URL}
          backendConnected={backendConnected}
          uploadedFiles={uploadedFiles}
          selectedFile={selectedFile}
          instructions={Instructions}
          onFileSelected={handleFileSelected}
          onFileUploaded={handleFileUploaded}
          fetchIfcElements={fetchIfcElements}
        />

        {/* Fußzeile */}
        <div className="flex flex-col mt-auto">
          <span className="font-bold">Anleitung</span>
          <Stepper orientation="vertical" nonLinear className="max-w-xs">
            {Instructions.map((step) => (
              <Step key={step.label} active>
                <StepLabel>
                  <span className="leading-tight text-primary font-bold">
                    {step.label}
                  </span>
                </StepLabel>
                <div className="ml-8 -mt-2">
                  <span className="text-sm leading-none">
                    {step.description}
                  </span>
                </div>
              </Step>
            ))}
          </Stepper>
        </div>
      </div>

      {/* Main content area - IFC Elements */}
      <div className="main-content flex-grow overflow-y-auto p-6 flex flex-col">
        {/* Header section with title */}
        <div className="flex justify-between items-center mb-4 pt-3">
          <Typography variant="h4" className="text-3xl font-bold">
            IFC Elemente
          </Typography>
        </div>

        {/* Info section - model info and alerts */}
        <div className="mb-4">
          {/* Active model info */}
          {selectedFile && (
            <Typography variant="subtitle1" className="mb-2">
              Aktives Modell: <strong>{selectedFile.filename}</strong>
            </Typography>
          )}

          {/* Message when no IFC file is loaded */}
          {!ifcLoading && ifcElements.length === 0 && !ifcError && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Bitte laden Sie eine IFC-Datei hoch, um die Daten anzuzeigen. Die
              IFC-Elemente werden mit ifcopenshell 0.8.1 verarbeitet.
            </Alert>
          )}

          {/* Note about the filtering */}
          {ifcElements.length > 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Es werden nur die ausgewählten IFC-Elementtypen angezeigt. Andere
              Elementtypen wie IfcSpace, IfcFurnishingElement, etc. werden nicht
              berücksichtigt.
            </Alert>
          )}
        </div>

        {/* Action buttons */}
        {selectedFile && (
          <div className="flex gap-2 mb-4">
            {/* Reload Button */}
            <Button
              variant="outlined"
              color="primary"
              onClick={() =>
                selectedFile.modelId && fetchIfcElements(selectedFile.modelId)
              }
              disabled={ifcLoading || !backendConnected}
            >
              {ifcLoading ? "Loading..." : "Reload Model"}
            </Button>

            {/* Send to Kafka Button */}
            {ifcElements.length > 0 && (
              <Button
                variant="contained"
                color="primary"
                startIcon={<SendIcon />}
                onClick={sendQtoToKafka}
                disabled={kafkaSending || !backendConnected}
              >
                {kafkaSending ? "Sending..." : "Send to Kafka"}
              </Button>
            )}
          </div>
        )}

        {/* Element list container - expanded to fill remaining space */}
        <div className="border border-gray-200 rounded-md flex-grow flex flex-col min-h-0">
          <IfcElementsList
            elements={ifcElements}
            loading={ifcLoading}
            error={ifcError}
          />
        </div>
      </div>
    </div>
  );
};

export default MainPage;
