import {
  Typography,
  Select,
  MenuItem,
  Paper,
  FormControl,
  FormLabel,
  Stepper,
  Step,
  StepLabel,
  Table,
  TableContainer,
  TableBody,
  TableCell,
  TableRow,
  TableHead,
  useMediaQuery,
  Theme,
  Divider,
  Alert,
  Snackbar,
  Button,
} from "@mui/material";
import { useEffect, useState } from "react";
import { CostItem, IFCElement, UploadedFile } from "./types";
import QtoTableRow from "./QtoTableRow";
import { tableStyle, columnWidths, createCellStyles } from "./styles";
import { ebkpData } from "../../data/ebkpData";
import { processEbkpData, formatNumber } from "./utils";
import IfcElementsList from "./IfcElementsList";
import FileUpload from "./FileUpload";

// Define API URL - this would typically come from your environment variables
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

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

  // QTO table state
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [qtoItems, setQtoItems] = useState<CostItem[]>([]);

  // IFC elements state
  const [ifcElements, setIfcElements] = useState<IFCElement[]>([]);
  const [ifcLoading, setIfcLoading] = useState(false);
  const [ifcError, setIfcError] = useState<string | null>(null);

  // Backend connectivity state
  const [backendConnected, setBackendConnected] = useState(false);
  const [connectionChecked, setConnectionChecked] = useState(false);
  const [showConnectionError, setShowConnectionError] = useState(false);

  // Check if on mobile device
  const isMobile = useMediaQuery((theme: Theme) =>
    theme.breakpoints.down("sm")
  );

  // Cell styles for alignment and formatting
  const cellStyles = createCellStyles(isMobile);

  // Check backend connectivity on load
  useEffect(() => {
    checkBackendConnectivity();
  }, []);

  // Function to check if backend is available
  const checkBackendConnectivity = async () => {
    try {
      const response = await fetch(`${API_URL}/health`, {
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

  // Process EBKP data for the cost structure
  useEffect(() => {
    // Only load EBKP structure if connectivity check is complete
    if (connectionChecked) {
      // Process the EBKP data into a hierarchical structure
      const processedItems = processEbkpData(ebkpData);

      // Add sample quantity data for demonstration
      const enrichedItems = processedItems.map((item) => {
        // Add random values to top level items
        const enrichedItem = {
          ...item,
          totalChf: Math.round(Math.random() * 1000000),
        };

        // Add random values to second level items
        enrichedItem.children = item.children.map((child) => {
          const enrichedChild = {
            ...child,
            totalChf: Math.round(Math.random() * 300000),
          };

          // Add realistic values to third level items
          enrichedChild.children = child.children.map((grandchild) => {
            // Generate random but realistic values for quantities
            const menge = Math.round(Math.random() * 1000);
            const kennwert = Math.round(Math.random() * 500);
            const chf = menge * kennwert;

            return {
              ...grandchild,
              menge,
              einheit: getRandomUnit(grandchild.bezeichnung),
              kennwert,
              chf,
              totalChf: chf,
              kommentar: getRandomComment(grandchild.bezeichnung),
            };
          });

          return enrichedChild;
        });

        return enrichedItem;
      });

      setQtoItems(enrichedItems);
    }
  }, [connectionChecked]);

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

  // Get a random unit based on the item name
  const getRandomUnit = (bezeichnung: string): string => {
    const lowerName = bezeichnung.toLowerCase();

    if (
      lowerName.includes("wand") ||
      lowerName.includes("fassade") ||
      lowerName.includes("dämmung")
    ) {
      return "m²";
    } else if (lowerName.includes("leitung") || lowerName.includes("kabel")) {
      return "lfm";
    } else if (
      lowerName.includes("dach") ||
      lowerName.includes("boden") ||
      lowerName.includes("decke")
    ) {
      return "m²";
    } else if (lowerName.includes("fundament") || lowerName.includes("beton")) {
      return "m³";
    } else if (lowerName.includes("stütze") || lowerName.includes("säule")) {
      return "Stk";
    } else if (lowerName.includes("fenster") || lowerName.includes("tür")) {
      return "Stk";
    } else if (lowerName.includes("honorar") || lowerName.includes("kosten")) {
      return "pauschal";
    }

    const units = ["m²", "m³", "lfm", "Stk", "kg", "t", "pauschal"];
    return units[Math.floor(Math.random() * units.length)];
  };

  // Get a random comment based on the item name
  const getRandomComment = (bezeichnung: string): string => {
    const lowerName = bezeichnung.toLowerCase();

    if (lowerName.includes("wand")) {
      return "Dicke 20cm";
    } else if (lowerName.includes("dach")) {
      return "Inkl. Abdichtung";
    } else if (lowerName.includes("fenster")) {
      return "Dreifachverglasung";
    } else if (lowerName.includes("boden")) {
      return "Inkl. Dämmung";
    } else if (lowerName.includes("fundament")) {
      return "C30/37";
    } else if (lowerName.includes("elektro")) {
      return "Gemäss Elektrokonzept";
    }

    const comments = [
      "",
      "Gemäss Plan",
      "Inkl. Montage",
      "Exkl. Nebenarbeiten",
      "Standardausführung",
    ];
    return comments[Math.floor(Math.random() * comments.length)];
  };

  // Handle expanding/collapsing rows in the QTO table
  const handleRowToggle = (code: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [code]: !prev[code],
    }));
  };

  // Render numbers with proper formatting
  const renderNumber = (
    value: number | null | undefined,
    decimals = 2
  ): string => {
    if (value === null || value === undefined) return "";
    return formatNumber(value, decimals);
  };

  // Toggle all rows expanded/collapsed
  const toggleAllExpanded = () => {
    if (Object.keys(expandedRows).length === 0) {
      // Expand all
      const newExpandedRows: Record<string, boolean> = {};

      // Expand top-level items
      qtoItems.forEach((item) => {
        newExpandedRows[item.ebkp] = true;

        // Expand second-level items
        item.children.forEach((child) => {
          newExpandedRows[child.ebkp] = true;
        });
      });

      setExpandedRows(newExpandedRows);
    } else {
      // Collapse all
      setExpandedRows({});
    }
  };

  // Handle closing the connection error snackbar
  const handleCloseConnectionError = () => {
    setShowConnectionError(false);
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

      {/* Sidebar */}
      <div className="sidebar text-primary">
        {/* Header und Inhalte */}
        <div>
          <Typography
            variant="h3"
            className="text-5xl mb-2"
            style={{ color: "black" }}
          >
            Modell
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

      {/* Main content area - QTO Table and IFC Elements */}
      <div className="main-content flex-grow overflow-y-auto p-10">
        <div className="flex justify-between items-center mb-6">
          <Typography variant="h2" className="text-5xl">
            Mengenermittlung
          </Typography>

          <div className="flex gap-2">
            {/* Expand/Collapse All button */}
            <Button
              variant="outlined"
              color="secondary"
              onClick={toggleAllExpanded}
              size="small"
            >
              {Object.keys(expandedRows).length === 0
                ? "Alle aufklappen"
                : "Alle zuklappen"}
            </Button>
          </div>
        </div>

        {/* QTO Table */}
        <TableContainer component={Paper} elevation={2}>
          <Table aria-label="QTO Overview Table" sx={tableStyle}>
            <colgroup>
              <col style={{ width: columnWidths["expandIcon"] }} />
              <col style={{ width: columnWidths["ebkp"] }} />
              <col style={{ width: columnWidths["bezeichnung"] }} />
              <col style={{ width: columnWidths["menge"] }} />
              <col style={{ width: columnWidths["einheit"] }} />
              <col style={{ width: columnWidths["kennwert"] }} />
              <col style={{ width: columnWidths["chf"] }} />
              <col style={{ width: columnWidths["totalChf"] }} />
              <col style={{ width: columnWidths["kommentar"] }} />
            </colgroup>
            <TableHead>
              <TableRow sx={{ backgroundColor: "rgba(0, 0, 0, 0.08)" }}>
                <TableCell />
                <TableCell style={{ fontWeight: "bold" }}>eBKP</TableCell>
                <TableCell style={{ fontWeight: "bold" }}>
                  Bezeichnung
                </TableCell>
                <TableCell align="right" style={{ fontWeight: "bold" }}>
                  Menge
                </TableCell>
                <TableCell align="left" style={{ fontWeight: "bold" }}>
                  Einheit
                </TableCell>
                <TableCell align="right" style={{ fontWeight: "bold" }}>
                  Kennwert
                </TableCell>
                <TableCell align="right" style={{ fontWeight: "bold" }}>
                  CHF
                </TableCell>
                <TableCell align="right" style={{ fontWeight: "bold" }}>
                  Total CHF
                </TableCell>
                <TableCell align="left" style={{ fontWeight: "bold" }}>
                  Kommentar
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {qtoItems.map((item) => (
                <QtoTableRow
                  key={item.ebkp}
                  item={item}
                  expanded={expandedRows[item.ebkp] || false}
                  onToggle={handleRowToggle}
                  expandedRows={expandedRows}
                  isMobile={isMobile}
                  renderNumber={renderNumber}
                  cellStyles={cellStyles}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Divider between tables */}
        <Divider sx={{ my: 4 }} />

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

        {/* IFC Elements List */}
        <div
          className="border border-gray-200 rounded-md"
          style={{
            height: "400px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
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
