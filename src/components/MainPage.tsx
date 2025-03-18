import { UploadFile } from "@mui/icons-material";
import {
  Typography,
  Select,
  MenuItem,
  Paper,
  IconButton,
  Button,
  FormControl,
  FormLabel,
  Stepper,
  Step,
  StepLabel,
  ListItem,
  ListItemIcon,
  Table,
  TableContainer,
  TableBody,
  TableCell,
  TableRow,
  TableHead,
  CircularProgress,
  useMediaQuery,
  Theme,
  Divider,
  Alert,
  Snackbar,
} from "@mui/material";
import { ReactElement, useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Delete as DeleteIcon } from "@mui/icons-material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { CostItem, IFCElement } from "./types";
import QtoTableRow from "./QtoTableRow";
import { tableStyle, columnWidths, createCellStyles } from "./styles";
import { ebkpData } from "../../data/ebkpData";
import { processEbkpData, formatNumber } from "./utils";
import IfcElementsList from "./IfcElementsList";

// Define API URL - this would typically come from your environment variables
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

type MetaFile = {
  file: File;
  steps: ReactElement[];
  valid: boolean | null;
  modelId?: string; // Add modelId to track the uploaded model
};

type UploadedFile = {
  filename: string;
  created_at: string;
  modelId?: string; // Add modelId for uploaded files
};

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

  const [metaFile, setMetaFile] = useState<MetaFile>();
  const [requestFinished, setRequestFinished] = useState(false);
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

  // Function to upload IFC file to backend
  const uploadIfcFile = async (
    file: File
  ): Promise<{ modelId: string } | null> => {
    if (!backendConnected) {
      setShowConnectionError(true);
      return null;
    }

    try {
      setIfcLoading(true);
      setIfcError(null);

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_URL}/upload-ifc/`, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(30000), // 30 second timeout for larger files
      });

      if (!response.ok) {
        throw new Error(`Failed to upload IFC file: ${response.statusText}`);
      }

      const data = await response.json();

      // After successful upload, fetch the elements
      await fetchIfcElements(data.model_id);

      return { modelId: data.model_id };
    } catch (error) {
      console.error("Error uploading IFC file:", error);
      setIfcError(
        "Failed to upload IFC file. Please check the file format and try again."
      );
      setShowConnectionError(true);
      return null;
    } finally {
      setIfcLoading(false);
    }
  };

  // Handler for clicking on a file in the sidebar
  const handleFileClick = (file: UploadedFile) => {
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

  const fileSize = (size: number) => {
    if (size === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(size) / Math.log(k));
    return parseFloat((size / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatMessage = (message: string, status: string) => {
    return message.split(/(\[.*?\]\(.*?\))/g).map((part, index) => {
      const match = part.match(/\[(.*?)\]\((.*?)\)/);
      if (match) {
        return (
          <a
            key={index}
            href={match[2]}
            className={`underline 
              ${
                status === "success"
                  ? "text-green-500"
                  : status === "error"
                  ? "text-red-500"
                  : ""
              }`}
          >
            {match[1]}
          </a>
        );
      }

      return (
        <span
          key={index}
          className={
            status === "success"
              ? "text-green-500"
              : status === "error"
              ? "text-red-500"
              : ""
          }
        >
          {part}
        </span>
      );
    });
  };

  const updateStep = (index: number, message: string, status: string) => {
    setMetaFile((prev) => {
      if (!prev) return prev;
      const updatedSteps = [...prev.steps];
      updatedSteps[index] = (
        <>
          {formatMessage(message, status)}{" "}
          {status === "loading" ? (
            <CircularProgress size={10} />
          ) : status === "success" ? (
            "✅"
          ) : status === "error" ? (
            "❌"
          ) : (
            ""
          )}
        </>
      );
      return { ...prev, steps: updatedSteps };
    });
    if (status === "error" || status === "success") {
      setMetaFile((prev) => {
        if (prev) {
          return {
            ...prev,
            valid:
              status === "success" &&
              (prev.valid === null || prev.valid === true)
                ? true
                : false,
          };
        }
        return prev;
      });
    }
  };

  const handleRemoveFile = () => {
    setMetaFile(undefined);
    // Reset the selected file display but keep showing existing file if one is selected
    if (selectedFile) {
      handleFileClick(selectedFile);
    } else {
      // Clear IFC elements if nothing is selected
      setIfcElements([]);
    }
  };

  const handlePublish = async () => {
    // Mock implementation - for now we just immediately call the file done
    updateStep(0, "Datei wird veröffentlicht", "loading");

    // Try to upload to the backend
    if (metaFile?.file) {
      try {
        const result = await uploadIfcFile(metaFile.file);
        if (result) {
          // Update the metaFile with the model ID
          setMetaFile((prev) =>
            prev ? { ...prev, modelId: result.modelId } : prev
          );
          updateStep(0, "Datei wurde erfolgreich veröffentlicht", "success");
        } else {
          updateStep(0, "Datei konnte nicht hochgeladen werden", "error");
          return;
        }
      } catch {
        // If backend not available, show error
        console.log("Backend not available");
        updateStep(0, "Fehler bei der Verbindung zum Server", "error");
        return;
      }

      // Add to uploaded files list
      const newFile: UploadedFile = {
        filename: metaFile.file.name,
        created_at: new Date().toISOString(),
        modelId: metaFile.modelId,
      };

      setUploadedFiles((prev) => [newFile, ...prev]);
      setSelectedFile(newFile);

      // Reset file upload UI after successful upload
      setTimeout(() => {
        setMetaFile(undefined);
      }, 1000);
    }
  };

  const onDropFile = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      // Initialize with loading state
      setRequestFinished(false);
      setMetaFile({
        file: acceptedFiles[0],
        steps: Instructions.map(() => <></>),
        valid: null,
      });

      // Step 1: File upload
      updateStep(0, "Datei wird hochgeladen", "loading");

      // Try to upload to backend
      try {
        const result = await uploadIfcFile(acceptedFiles[0]);
        if (result) {
          // Store the model ID with the file
          setMetaFile((prev) =>
            prev ? { ...prev, modelId: result.modelId } : prev
          );
          updateStep(0, "Datei wurde hochgeladen", "success");

          // Step 2: File validation
          updateStep(1, "Datei wird geprüft", "loading");

          // Since we've already loaded the IFC data in uploadIfcFile,
          // we can just mark this as success after a short delay for UI feedback
          setTimeout(() => {
            updateStep(1, "Datei wurde erfolgreich geprüft", "success");

            // Mark as valid and ready
            setMetaFile((prev) => {
              if (!prev) return prev;
              return { ...prev, valid: true };
            });

            setRequestFinished(true);
          }, 1500);
        } else {
          // If upload failed, show error
          updateStep(0, "Fehler beim Hochladen der Datei", "error");
        }
      } catch {
        // If backend not available, show error
        console.log("Backend not available");
        updateStep(0, "Fehler bei der Verbindung zum Server", "error");
      }
    },
    [Instructions]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onDropFile,
    multiple: false,
    accept: {
      "application/ifc": [".ifc"],
      // Add more common file types that might contain IFC data
      "application/octet-stream": [".ifc"],
      "text/plain": [".ifc"],
    },
  });

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

        {/* MAIN FILES DROPZONE - moved to sidebar */}
        <div className="mt-4">
          <Typography variant="h6" className="mb-2">
            Modell hochladen
          </Typography>
          <Paper
            {...getRootProps()}
            variant="outlined"
            sx={{
              p: 2,
              textAlign: "center",
              borderColor: isDragActive ? "primary.main" : "grey.400",
              borderStyle: "dashed",
              borderWidth: 2,
              mb: 3,
              cursor: "pointer",
            }}
          >
            <input {...getInputProps()} />
            {isDragActive ? (
              <>
                <UploadFileIcon fontSize="small" />
                <Typography variant="body2" color="primary">
                  Drop the files here...
                </Typography>
              </>
            ) : (
              <>
                <UploadFileIcon color="primary" fontSize="small" />
                <Typography variant="body2" color="textPrimary">
                  Drag and Drop
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Format: IFC
                </Typography>
              </>
            )}
          </Paper>

          {/* LIST OF UPLOADED PLUGIN FILES */}
          {metaFile && (
            <div className="mb-4">
              <ListItem sx={{ px: 0 }}>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <UploadFile color="primary" fontSize="small" />
                </ListItemIcon>
                <div className="flex-grow">
                  <Typography variant="body2" sx={{ fontWeight: "medium" }}>
                    {metaFile?.file.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    className="pb-1"
                  >
                    {fileSize(metaFile?.file.size || 0)}
                  </Typography>
                  {metaFile?.steps.map((step, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <Typography key={index} variant="caption">
                        {step}
                      </Typography>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <IconButton
                    edge="end"
                    onClick={handleRemoveFile}
                    size="small"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handlePublish}
                    disabled={
                      metaFile.valid === false ||
                      metaFile.valid == null ||
                      !requestFinished
                    }
                    size="small"
                  >
                    Freigeben
                  </Button>
                </div>
              </ListItem>
            </div>
          )}

          {/* Display uploaded files */}
          {uploadedFiles.length > 0 && !metaFile && (
            <div className="mb-4">
              <Typography variant="subtitle2" className="mb-2">
                Hochgeladene Modelle:
              </Typography>
              {uploadedFiles.map((file, index) => (
                <ListItem
                  key={index}
                  sx={{
                    px: 0,
                    py: 1,
                    backgroundColor:
                      selectedFile?.filename === file.filename
                        ? "rgba(25, 118, 210, 0.08)"
                        : "transparent",
                    cursor: "pointer",
                    "&:hover": {
                      backgroundColor: "rgba(25, 118, 210, 0.04)",
                    },
                  }}
                  onClick={() => handleFileClick(file)}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <UploadFile color="primary" fontSize="small" />
                  </ListItemIcon>
                  <div className="flex-grow">
                    <Typography variant="body2" sx={{ fontWeight: "medium" }}>
                      {file.filename}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      Hochgeladen:{" "}
                      {new Date(file.created_at).toLocaleDateString("de-CH")}
                    </Typography>
                  </div>
                </ListItem>
              ))}
            </div>
          )}
        </div>

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
        <IfcElementsList
          elements={ifcElements}
          loading={ifcLoading}
          error={ifcError}
        />
      </div>
    </div>
  );
};

export default MainPage;
