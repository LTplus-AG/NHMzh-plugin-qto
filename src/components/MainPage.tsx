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
  Tabs,
  Tab,
  Table,
  TableContainer,
  TableBody,
  TableCell,
  TableRow,
  CircularProgress,
} from "@mui/material";
import { ReactElement, useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Delete as DeleteIcon } from "@mui/icons-material";
import UploadFileIcon from "@mui/icons-material/UploadFile";

type MetaFile = {
  file: File;
  steps: ReactElement[];
  valid: boolean | null;
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
  const TabsTexts = ["Architektur", "Statik", "Haustechnik"];
  const [activeTab, setActiveTab] = useState(0);

  const [metaFile, setMetaFile] = useState<MetaFile>();
  const [requestFinished, setRequestFinished] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<
    Array<{ filename: string; created_at: string }>
  >([]);

  // Mock file list - this simulates what we'd get from an API
  useEffect(() => {
    // Mock API response with sample uploaded files
    const mockFiles = [
      { filename: "Beispiel_Modell.ifc", created_at: new Date().toISOString() },
    ];
    setUploadedFiles(mockFiles);
  }, []);

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
  };

  const handlePublish = async () => {
    // Mock implementation
    updateStep(0, "Datei wird veröffentlicht", "loading");

    // Simulate API call with timeout
    setTimeout(() => {
      updateStep(0, "Datei wurde erfolgreich veröffentlicht", "success");

      // Add to uploaded files for demo
      if (metaFile?.file) {
        setUploadedFiles((prev) => [
          ...prev,
          {
            filename: metaFile.file.name,
            created_at: new Date().toISOString(),
          },
        ]);

        // Reset after successful upload
        setTimeout(() => {
          setMetaFile(undefined);
        }, 1000);
      }
    }, 1500);
  };

  const onDropFile = useCallback(async (acceptedFiles: File[]) => {
    // Initialize with loading state
    setRequestFinished(false);
    setMetaFile({
      file: acceptedFiles[0],
      steps: Instructions.map(() => <></>),
      valid: null,
    });

    // Step 1: File upload
    updateStep(0, "Datei wird hochgeladen", "loading");

    // Simulate API call with timeout
    setTimeout(() => {
      updateStep(0, "Datei wurde hochgeladen", "success");

      // Step 2: File validation
      updateStep(1, "Datei wird geprüft", "loading");

      // Simulate validation with timeout
      setTimeout(() => {
        updateStep(1, "Datei wurde erfolgreich geprüft", "success");

        // Mark as valid and ready
        setMetaFile((prev) => {
          if (!prev) return prev;
          return { ...prev, valid: true };
        });

        setRequestFinished(true);
      }, 1500);
    }, 1000);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onDropFile,
    multiple: false,
    accept: {
      "application/ifc": [".ifc"],
    },
  });

  return (
    <div
      className="w-full flex h-full overflow-hidden"
      style={{ height: "100vh" }}
    >
      {/* Sidebar */}
      <div className="sidebar text-primary">
        {/* Header und Inhalte */}
        <div>
          <Typography variant="h3" className="text-5xl mb-2">
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
                <MenuItem value={"Projekt 3"}>
                  Gemeinschaftszentrum Wipkingen
                </MenuItem>
              </Select>
            </FormControl>
          </div>
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

      {/* Hauptbereich */}
      <div className="main-content">
        <div className="flex-grow overflow-y-auto p-10">
          <Typography variant="h2" className="text-5xl">
            Modell hochladen
          </Typography>

          <div className="flex mt-5 w-full mb-10">
            <Tabs
              value={activeTab}
              onChange={(_, value) => setActiveTab(value)}
              className="w-full"
            >
              {TabsTexts.map((tab, index) => (
                <Tab key={index} label={tab} disabled={index > 0} />
              ))}
            </Tabs>
          </div>

          {/* MAIN FILES DROPZONE */}
          <Paper
            {...getRootProps()}
            variant="outlined"
            sx={{
              p: 4,
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
                <UploadFileIcon />
                <Typography variant="body1" color="primary">
                  Drop the files here...
                </Typography>
              </>
            ) : (
              <>
                <UploadFileIcon color="primary" />
                <Typography variant="body1" color="textPrimary">
                  Drag and Drop
                </Typography>
                <Typography variant="body2" color="textSecondary">
                  Format: IFC
                </Typography>
              </>
            )}
          </Paper>

          {/* LIST OF UPLOADED PLUGIN FILES */}
          {metaFile && (
            <div>
              <ListItem>
                <ListItemIcon>
                  <UploadFile color="primary" />
                </ListItemIcon>
                <div className="flex-grow">
                  <Typography variant="body1">{metaFile?.file.name}</Typography>
                  <Typography
                    variant="body2"
                    color="textSecondary"
                    className="pb-2"
                  >
                    {fileSize(metaFile?.file.size || 0)}
                  </Typography>
                  {metaFile?.steps.map((step, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <Typography key={index} variant="body2">
                        {step}
                      </Typography>
                    </div>
                  ))}
                </div>
                <ListItemIcon className="flex gap-6">
                  <IconButton edge="end" onClick={handleRemoveFile}>
                    <DeleteIcon />
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
                  >
                    Freigeben
                  </Button>
                </ListItemIcon>
              </ListItem>
            </div>
          )}

          {/* Table with all Files */}
          <Typography variant="h2" className="text-4xl mt-10">
            Hochgeladene Modelle
          </Typography>
          <TableContainer>
            <Table>
              <TableBody>
                {uploadedFiles.map((file, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <div className="font-medium">{file.filename}</div>
                      <div className="text-sm text-gray-500">
                        {new Date(file.created_at).toLocaleString()}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </div>
      </div>
    </div>
  );
};

export default MainPage;
