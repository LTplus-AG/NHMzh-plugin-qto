from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Query, Request, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from fastapi.openapi.utils import get_openapi
import os
import ifcopenshell
import tempfile
import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
import uuid
import traceback
import sys
from functools import lru_cache
from qto_producer import QTOKafkaProducer, format_ifc_elements_for_qto, MongoDBHelper
import re
# Import the new configuration
from ifc_quantities_config import TARGET_QUANTITIES, _get_quantity_value
from datetime import datetime
from bson import ObjectId # Needed for fallback query

# Set up logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Log ifcopenshell version at startup
logger.info(f"Using ifcopenshell version: {ifcopenshell.version}")
logger.info(f"Python version: {sys.version}")

# Initialize MongoDB connection at startup
mongodb = None

def init_mongodb():
    """Initialize MongoDB connection and create necessary collections"""
    global mongodb
    try:
        mongodb = MongoDBHelper()
        return mongodb.db is not None
    except Exception as e:
        logger.error(f"Error initializing MongoDB: {str(e)}")
        logger.error(traceback.format_exc())
        return False

app = FastAPI(
    title="QTO IFC Parser API",
    description="API for parsing IFC files and extracting QTO data",
    version="1.0.0",
    docs_url=None,  # Disable default docs to use custom implementation
    redoc_url=None  # Disable default redoc to use custom implementation
)

# Get CORS settings from environment variables
cors_origins_str = os.getenv("CORS_ORIGINS", "*")
if cors_origins_str == "*":
    cors_origins = ["*"]
else:
    cors_origins = [origin.strip() for origin in cors_origins_str.split(",")]

logger.info(f"CORS origins: {cors_origins}")

# Add CORS middleware with appropriate settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Get the list of target IFC classes from environment variables
TARGET_IFC_CLASSES = os.getenv("TARGET_IFC_CLASSES", "").split(",")
if TARGET_IFC_CLASSES and TARGET_IFC_CLASSES[0]:
    pass
else:
    TARGET_IFC_CLASSES = [
        "IfcBeam", "IfcBeamStandardCase", "IfcBearing", "IfcBuildingElementPart", 
        "IfcBuildingElementProxy", "IfcCaissonFoundation", "IfcChimney", 
        "IfcColumn", "IfcColumnStandardCase", "IfcCovering", "IfcCurtainWall", 
        "IfcDeepFoundation", "IfcDoor", "IfcEarthworksCut", "IfcEarthworksFill", 
        "IfcFooting", "IfcMember", "IfcPile", "IfcPlate", "IfcRailing", "IfcRamp", 
        "IfcRampFlight", "IfcReinforcingBar", "IfcReinforcingElement", 
        "IfcReinforcingMesh", "IfcRoof", "IfcSlab", "IfcSolarDevice", "IfcWall", 
        "IfcWallStandardCase", "IfcWindow"
    ]

class IFCElement(BaseModel):
    """IFC Element data model"""
    id: str
    global_id: Optional[str] = None # Allow None initially from parsing
    type: str # IFC Class (e.g., IfcWall)
    name: str # Instance Name (e.g., Wall_001)
    type_name: Optional[str] = None # Type Name (e.g., CW 200mm Concrete)
    description: Optional[str] = None
    properties: Dict[str, Any] = Field(default_factory=dict)
    material_volumes: Optional[Dict[str, Dict[str, Any]]] = None
    level: Optional[str] = None
    classification_id: Optional[str] = None
    classification_name: Optional[str] = None
    classification_system: Optional[str] = None
    # Main Quantities (potentially edited)
    area: Optional[float] = None
    volume: Optional[float] = None
    length: Optional[float] = None
    # Original Quantities (from initial parse)
    original_area: Optional[float] = None
    original_volume: Optional[float] = None
    original_length: Optional[float] = None
    category: Optional[str] = None # Keep for compatibility if needed elsewhere

class QTOResponse(BaseModel):
    """Response model for QTO operation"""
    message: str
    model_id: str
    element_count: int
    kafka_status: str

class ModelUploadResponse(BaseModel):
    """Response model for model upload"""
    message: str
    model_id: str
    filename: str
    element_count: int
    entity_types: Dict[str, int]

class ModelDeleteResponse(BaseModel):
    """Response model for model deletion"""
    message: str

class HealthResponse(BaseModel):
    """Response model for health check"""
    status: str
    kafka: str
    mongodb: str
    ifcopenshell_version: str

class ModelInfo(BaseModel):
    """Model information"""
    model_id: str
    filename: str
    element_count: int
    entity_counts: Dict[str, int]

# Define the specific input model for elements in the /send-qto request
class ElementInputData(BaseModel):
    id: str
    global_id: Optional[str] = None
    type: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    properties: Optional[Dict[str, Any]] = Field(default_factory=dict)
    material_volumes: Optional[Dict[str, Dict[str, Any]]] = None # Keep if sent from older parsers
    materials: Optional[List[Dict[str, Any]]] = Field(default_factory=list) # Primary way materials might be sent
    level: Optional[str] = None
    classification_id: Optional[str] = None
    classification_name: Optional[str] = None
    classification_system: Optional[str] = None
    ebkph: Optional[str] = None
    area: Optional[float] = None
    length: Optional[float] = None
    volume: Optional[float] = None
    original_area: Optional[float] = None
    original_length: Optional[float] = None
    quantity: Optional[Dict[str, Any]] = None
    original_quantity: Optional[Dict[str, Any]] = None
    category: Optional[str] = None
    is_structural: Optional[bool] = None
    is_external: Optional[bool] = None

    class Config:
        extra = 'ignore'

# Update QTORequestBody to use the new ElementInputData model
class QTORequestBody(BaseModel):
    elements: Optional[List[ElementInputData]] = None
    project: Optional[str] = None

# Custom OpenAPI schema
@app.get("/openapi.json", include_in_schema=False)
async def get_open_api_endpoint():
    return get_openapi(
        title="QTO IFC Parser API",
        version="1.0.0",
        description="API for parsing IFC files and extracting QTO data for Quantity Takeoff",
        routes=app.routes,
    )

@lru_cache(maxsize=1024)
def get_volume_from_properties(element) -> Dict:
    """Get volume quantities from base quantities or properties."""
    net_volume = None
    gross_volume = None
    
    # First, try to get volumes from base quantities
    for rel_def in element.IsDefinedBy:
        if rel_def.is_a("IfcRelDefinesByProperties"):
            prop_set = rel_def.RelatingPropertyDefinition
            if prop_set.is_a("IfcElementQuantity"):
                for quantity in prop_set.Quantities:
                    if quantity.is_a("IfcQuantityVolume"):
                        try:
                            if quantity.Name == "NetVolume":
                                net_volume = float(quantity.VolumeValue)
                            elif quantity.Name == "GrossVolume":
                                gross_volume = float(quantity.VolumeValue)
                        except (ValueError, AttributeError):
                            continue
    
    # If not found in base quantities, try to get from properties
    if net_volume is None and gross_volume is None:
        for rel_def in element.IsDefinedBy:
            if rel_def.is_a("IfcRelDefinesByProperties"):
                prop_set = rel_def.RelatingPropertyDefinition
                if prop_set.is_a("IfcPropertySet"):
                    for prop in prop_set.HasProperties:
                        if prop.is_a("IfcPropertySingleValue") and prop.NominalValue:
                            try:
                                if prop.Name == "NetVolume":
                                    net_volume = float(prop.NominalValue.wrappedValue)
                                elif prop.Name == "GrossVolume":
                                    gross_volume = float(prop.NominalValue.wrappedValue)
                            except (ValueError, AttributeError):
                                continue
    
    return {"net": net_volume, "gross": gross_volume}

def compute_constituent_fractions(ifc_file, constituent_set, associated_elements, unit_scale_to_mm=1.0):
    """
    Computes fractions for each material constituent based on their widths/volumes.
    
    Parameters:
    - ifc_file: The opened IFC file
    - constituent_set: Either IfcMaterialConstituentSet, IfcMaterialLayerSet, or IfcMaterialLayerSetUsage
    - associated_elements: List of elements associated with the constituent set
    - unit_scale_to_mm: Scaling factor to convert units to millimeters
    
    Returns:
    - A tuple of (fractions, widths) where:
      - fractions: Dictionary mapping each constituent to its fraction
      - widths: Dictionary mapping each constituent to its width in mm
    """
    fractions = {}
    constituent_widths = {}
    
   
    # Handle IfcMaterialConstituentSet
    if constituent_set.is_a('IfcMaterialConstituentSet'):
        constituents = constituent_set.MaterialConstituents or []
        if not constituents:
            return {}, {}
        
        
        # Collect all quantities associated with the elements
        quantities = []
        for element in associated_elements:
            for rel in getattr(element, 'IsDefinedBy', []):
                if rel.is_a('IfcRelDefinesByProperties'):
                    prop_def = rel.RelatingPropertyDefinition
                    if prop_def.is_a('IfcElementQuantity'):
                        quantities.extend(prop_def.Quantities)
        
        # Build a mapping of quantity names to quantities
        quantity_name_map = {}
        for q in quantities:
            if q.is_a('IfcPhysicalComplexQuantity'):
                q_name = (q.Name or '').strip().lower()
                quantity_name_map.setdefault(q_name, []).append(q)
        
        # Handle constituents with duplicate names by order of appearance
        constituent_indices = {}
        total_width_mm = 0.0
        
        # First try to get explicit fractions
        has_explicit_fractions = False
        for constituent in constituents:
            constituent_name = (constituent.Name or "Unnamed Constituent").strip().lower()
            
            # Try to get fraction from constituent definition
            if hasattr(constituent, 'Fraction') and constituent.Fraction:
                try:
                    fraction = float(constituent.Fraction)
                    fractions[constituent] = fraction
                    has_explicit_fractions = True
                except (ValueError, TypeError):
                    pass
        
        # If any explicit fractions were found, normalize and return them
        if has_explicit_fractions:
            total = sum(fractions.values())
            if total > 0:
                fractions = {constituent: fraction / total for constituent, fraction in fractions.items()}
            
            # For constituents without explicit fractions, distribute remaining equally
            constituents_without_fractions = [c for c in constituents if c not in fractions]
            if constituents_without_fractions:
                remaining = 1.0 - sum(fractions.values())
                equal_fraction = remaining / len(constituents_without_fractions)
                for constituent in constituents_without_fractions:
                    fractions[constituent] = equal_fraction
            
            # Set widths to 0 since we don't need them
            constituent_widths = {constituent: 0.0 for constituent in constituents}
            return fractions, constituent_widths
        
        # Otherwise, try to get widths from quantities
        for constituent in constituents:
            constituent_name = (constituent.Name or "Unnamed Constituent").strip().lower()
            count = constituent_indices.get(constituent_name, 0)
            constituent_indices[constituent_name] = count + 1
            
            width_mm = 0.0
            quantities_with_name = quantity_name_map.get(constituent_name, [])
            
            # Try to find matching quantity by name and index
            if count < len(quantities_with_name):
                matched_quantity = quantities_with_name[count]
                # Extract 'Width' sub-quantity
                for sub_q in getattr(matched_quantity, 'HasQuantities', []):
                    if sub_q.is_a('IfcQuantityLength') and (sub_q.Name or '').strip().lower() == 'width':
                        try:
                            raw_length_value = getattr(sub_q, 'LengthValue', 0.0)
                            width_mm = raw_length_value * unit_scale_to_mm
                            break
                        except (ValueError, TypeError):
                            pass
            
            # If no width found in complex quantities, try standard quantities
            if width_mm == 0.0:
                for quantity in quantities:
                    if quantity.is_a('IfcQuantityLength'):
                        try:
                            quantity_name = (quantity.Name or '').strip().lower()
                            if quantity_name == constituent_name or constituent_name in quantity_name:
                                width_mm = float(quantity.LengthValue) * unit_scale_to_mm
                                break
                        except (ValueError, TypeError):
                            pass
            
            constituent_widths[constituent] = width_mm
            total_width_mm += width_mm
        
        # Calculate fractions based on widths
        if total_width_mm > 0:
            for constituent, width_mm in constituent_widths.items():
                if constituent not in fractions:  # Skip if fraction already set
                    fractions[constituent] = width_mm / total_width_mm
        
        # If no width info available, distribute equally
        if not fractions or sum(fractions.values()) < 0.0001:
            fractions = {constituent: 1.0 / len(constituents) for constituent in constituents}
    
    # Handle IfcMaterialLayerSet or IfcMaterialLayerSetUsage
    elif constituent_set.is_a('IfcMaterialLayerSet') or constituent_set.is_a('IfcMaterialLayerSetUsage'):
        layer_set = constituent_set if constituent_set.is_a('IfcMaterialLayerSet') else constituent_set.ForLayerSet
        
        if not layer_set or not layer_set.MaterialLayers:
            return {}, {}
        
        total_thickness = 0.0
        layers = layer_set.MaterialLayers
        
        
        # Find any layers with non-zero thickness
        has_nonzero_thickness = False
        for layer in layers:
            if hasattr(layer, 'LayerThickness') and layer.LayerThickness:
                try:
                    thickness = float(layer.LayerThickness)
                    if thickness > 0:
                        has_nonzero_thickness = True
                        break
                except (ValueError, TypeError):
                    pass
        
        # If all layers have zero thickness, assign default thickness of 1.0
        default_thickness = 1.0
        if not has_nonzero_thickness:
            for layer in layers:
                constituent_widths[layer] = default_thickness
                total_thickness += default_thickness

        else:
            # Calculate total thickness from actual values
            for layer in layers:
                if hasattr(layer, 'LayerThickness'):
                    try:
                        thickness = float(layer.LayerThickness or 0) * unit_scale_to_mm
                     
                            
                        constituent_widths[layer] = thickness
                        total_thickness += thickness
                    except (ValueError, TypeError):
                        # Use default thickness for this layer
                        constituent_widths[layer] = default_thickness
                        total_thickness += default_thickness
        
        # Calculate fractions based on layer thickness
        if total_thickness > 0:
            for layer in layers:
                thickness = constituent_widths.get(layer, 0)
                fraction = thickness / total_thickness                  
                fractions[layer] = fraction
        else:
            # Equal distribution if no thickness info
            fractions = {layer: 1.0 / len(layers) for layer in layers}
    
    # Normalize fractions to ensure sum is 1.0
    total = sum(fractions.values())
    if total > 0:
        fractions = {constituent: fraction / total for constituent, fraction in fractions.items()}
        
        # Log the final fractions for debugging
        for constituent, fraction in fractions.items():
            name = "Unknown"
            if hasattr(constituent, 'Material') and constituent.Material:
                name = constituent.Material.Name
            elif hasattr(constituent, 'Name'):
                name = constituent.Name
    
    return fractions, constituent_widths

def _round_value(value, digits=3):
    """Round a value to the specified number of digits."""
    if value is None:
        return None
    try:
        return round(float(value), digits)
    except (ValueError, TypeError):
        return value

@app.on_event("startup")
async def startup_event():
    """Run startup tasks"""
    # Initialize MongoDB
    mongodb_status = init_mongodb()
    logger.info(f"MongoDB initialization status: {'success' if mongodb_status else 'failed'}")

@app.get("/", response_model=Dict[str, str])
def read_root():
    """API root endpoint that confirms the service is running"""
    logger.info("API root endpoint accessed")
    return {"message": "IFC Parser API is running"}

# Keep upload_ifc but modify its logic
# Change response model to a simple confirmation
class ProcessResponse(BaseModel):
    message: str
    project: str
    filename: str
    element_count: int
    kafka_status: Optional[str] = None # Keep Kafka status optional

@app.post("/upload-ifc/", response_model=ProcessResponse)
async def upload_ifc(
    file: UploadFile = File(...),
    project: str = Form(...),
    filename: str = Form(...),
    timestamp: str = Form(...),
    background_tasks: BackgroundTasks = None # Keep background tasks if needed later
):
    """
    Receives an IFC file (usually from qto_ifc-msg),
    parses it, saves the parsed data to MongoDB,
    and triggers a Kafka notification.
    """
    logger.info(f"Received file upload request for project '{project}', filename '{filename}'")
   
    if not file.filename.endswith('.ifc'):
        raise HTTPException(status_code=400, detail="Only IFC files are supported")
    
    temp_file_path = None # Initialize path
    ifc_file = None
    try:
        # --- Save Temp File --- (Similar to before)
        temp_dir = os.path.join(os.getcwd(), "temp")
        os.makedirs(temp_dir, exist_ok=True)
        if not os.access(temp_dir, os.W_OK):
            raise HTTPException(status_code=500, detail="Server configuration error: Temp directory not writable")
        
        # Use a more predictable temp name if needed, or keep UUID
        file_uuid = str(uuid.uuid4())
        # Ensure the original filename from the form is used for the temp file name part
        temp_file_path = os.path.join(temp_dir, f"{file_uuid}_{filename}")
        
        contents = await file.read()
        if not contents:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")
        
        with open(temp_file_path, 'wb') as f:
            f.write(contents)
        
        if not os.path.exists(temp_file_path):
            raise HTTPException(status_code=500, detail="Failed to save uploaded file")
            
        logger.info(f"Temporary file saved: {temp_file_path}")
        
        # --- Open IFC File --- (Similar to before)
        try:
            ifc_file = ifcopenshell.open(temp_file_path)
            logger.info(f"IFC file opened successfully with schema: {ifc_file.schema}")
        except Exception as ifc_error:
            logger.error(f"Error opening IFC file {temp_file_path}: {ifc_error}")
            # Add more checks like before if needed
            raise HTTPException(status_code=400, detail=f"Error processing IFC file: {str(ifc_error)}")

        # --- Parse IFC Data using the new function --- << NEW
        logger.info(f"Starting IFC parsing for {filename}...")
        parsed_elements: List[IFCElement] = _parse_ifc_data(ifc_file)
        logger.info(f"Finished parsing. Found {len(parsed_elements)} elements.")

        if not parsed_elements:
             logger.warning(f"Parsing completed, but no elements were extracted from {filename}. Check IFC structure and filters.")
             # Decide if this is an error or just an empty file case
             # For now, proceed but log warning.

        # --- Convert Pydantic models to dicts for saving --- << NEW
        element_dicts = []
        for elem_model in parsed_elements:
            try:
                # Use model_dump for Pydantic v2
                element_dicts.append(elem_model.model_dump(exclude_none=True))
            except AttributeError:
                # Fallback for older Pydantic
                element_dicts.append(elem_model.dict(exclude_none=True))
            except Exception as dump_error:
                logger.error(f"Error converting element {getattr(elem_model, 'id', '?')} to dict: {dump_error}")
                # Optionally skip this element or add placeholder

        # --- Save Parsed Data to MongoDB --- << NEW
        if mongodb is not None and mongodb.db is not None:
            logger.info(f"Saving {len(element_dicts)} parsed elements to MongoDB for project '{project}', filename '{filename}'")
            save_success = mongodb.save_parsed_data(project, filename, element_dicts)
            if not save_success:
                # Log error but potentially continue to Kafka if needed?
                # Or raise exception? For now, log and continue.
                logger.error("Failed to save parsed data to MongoDB.")
                # Consider raising HTTPException(500, "Failed to save processing results")
        else:
            logger.warning("MongoDB not connected. Parsed data not saved.")
            # Consider raising HTTPException(503, "Database unavailable, cannot save results")

        # --- Send Project Update Notification to Kafka --- << MODIFIED
        kafka_status = "unavailable"
        try:
            # Prepare data structure expected by send_project_update_notification
            project_update_data = {
                "project": project,
                "filename": filename,
                "file_id": f"{project}/{filename}", # Consistent file ID
                "elements": element_dicts, # Pass the raw dicts
                "timestamp": timestamp # Use the timestamp from the request
            }

            producer = QTOKafkaProducer()
            if producer.producer: # Check if producer connected successfully
                 send_success = producer.send_project_update_notification(project_update_data)
                 # Flush is handled within send_project_update_notification now
                 # flush_success = producer.flush()
                 if send_success:
                     kafka_status = "sent"
                     logger.info(f"Kafka notification sent successfully for {filename}")
                 else:
                     kafka_status = "failed"
                     logger.warning(f"Kafka notification failed for {filename}")
            else:
                logger.warning("Kafka producer not available, notification not sent.")

        except Exception as kafka_error:
            logger.error(f"Error sending Kafka notification: {kafka_error}")
            kafka_status = "error"

        # --- Return Success Response --- << MODIFIED
        return ProcessResponse(
            message="IFC file processed successfully",
            project=project,
            filename=filename,
            element_count=len(parsed_elements),
            kafka_status=kafka_status
        )
    
    except HTTPException:
        # If an HTTPException was raised, clean up and re-raise
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
            except Exception as cleanup_error:
                logger.error(f"Error removing temp file during HTTP exception: {str(cleanup_error)}")
        raise
    except Exception as e:
        # General error handling
        logger.error(f"Unexpected error processing IFC file {filename}: {str(e)}")
        logger.error(traceback.format_exc())
        # Clean up temp file
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
            except Exception as cleanup_error:
                logger.error(f"Error removing temp file during general exception: {str(cleanup_error)}")
        raise HTTPException(status_code=500, detail=f"Error processing IFC file: {str(e)}")
    finally:
        # --- Clean up --- (Ensure temp file is removed)
        # The ifc_file object might hold a lock on the file on some systems
        if 'ifc_file' in locals() and ifc_file is not None:
            # Explicitly close or delete the ifc_file object if necessary
            # Although ifcopenshell usually doesn't hold a persistent lock after opening
            del ifc_file # Remove reference

        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
                logger.info(f"Cleaned up temporary file: {temp_file_path}")
            except Exception as cleanup_error:
                # Log error but don't crash the response if cleanup fails
                logger.error(f"Error removing temp file during final cleanup: {str(cleanup_error)}")

@app.get("/projects/", response_model=List[str])
async def list_projects():
    """Returns a list of available project names from the parsed data.""" # Docstring updated
    if mongodb is None or mongodb.db is None:
        raise HTTPException(status_code=503, detail="Database not available")
    try:
        # Use the new MongoDBHelper method
        project_names = mongodb.list_distinct_projects()
        return project_names
    except Exception as e:
        logger.error(f"Error listing projects from DB: {e}")
        raise HTTPException(status_code=500, detail="Error retrieving project list")

@app.get("/projects/{project_name}/elements/", response_model=List[IFCElement])
async def get_project_elements(project_name: str):
    """Retrieves element data for a given project name.
    
    Tries to fetch data from the parsed_ifc_data collection first.
    If not found, falls back to querying the raw elements collection.
    """
    if mongodb is None or mongodb.db is None:
        raise HTTPException(status_code=503, detail="Database not available")

    elements_data = None
    source = "parsed_ifc_data" # Track the source of the data

    try:
        # 1. Attempt primary data fetch from parsed_ifc_data
        logger.info(f"Attempting primary data fetch from parsed_ifc_data for '{project_name}'")
        elements_data = mongodb.get_parsed_data_by_project(project_name)
        
        if elements_data:
            logger.info(f"Found {len(elements_data)} elements in parsed_ifc_data for '{project_name}'")
        else:
            logger.info(f"No data found in parsed_ifc_data for '{project_name}'. Attempting fallback.")

        # 2. Fallback: If primary fetch failed or returned empty, try raw elements collection
        if not elements_data:
            source = "elements_collection (fallback)"
            logger.info(f"Attempting fallback fetch from elements collection for '{project_name}'")
            
            # Find project ID (case-insensitive, partial match)
            project = mongodb.db.projects.find_one({"name": {"$regex": re.escape(project_name), "$options": "i"}})
            
            if not project:
                logger.warning(f"Fallback failed: Project matching '{project_name}' not found in projects collection.")
                raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found")
            
            project_id = project["_id"]
            logger.info(f"Fallback: Found project '{project.get('name')}' with ID: {project_id}")
            
            # Get raw elements
            elements_data = list(mongodb.db.elements.find({"project_id": project_id}))
            logger.info(f"Fallback: Found {len(elements_data)} raw elements for project ID {project_id}")
            
            # Adapt raw element structure to match IFCElement (if necessary)
            adapted_elements = []
            for elem in elements_data:
                # Convert ObjectId to string
                if "_id" in elem: elem["_id"] = str(elem["_id"])
                if "project_id" in elem: elem["project_id"] = str(elem["project_id"])
                
                # Map potential field name differences
                mapped_elem = {
                    "id": elem.get("ifc_id", str(elem.get("_id"))), # Use ifc_id if present, else _id
                    "global_id": elem.get("global_id"),
                    "type": elem.get("ifc_class", "Unknown"), # Use ifc_class if present
                    "name": elem.get("name", "Unnamed"),
                    "type_name": elem.get("type_name"),
                    "description": elem.get("description"),
                    "properties": elem.get("properties", {}),
                    "material_volumes": elem.get("material_volumes"),
                    "level": elem.get("level"),
                    "classification_id": None,
                    "classification_name": None,
                    "classification_system": None,
                    "area": None,
                    "volume": elem.get("volume"), # Direct mapping if available
                    "length": None,
                    # No original quantities in raw elements typically
                    "original_area": None, 
                    "original_volume": None,
                    "original_length": None, 
                    "category": elem.get("category")
                }

                # Handle nested classification
                if "classification" in elem and isinstance(elem["classification"], dict):
                    mapped_elem["classification_id"] = elem["classification"].get("id")
                    mapped_elem["classification_name"] = elem["classification"].get("name")
                    mapped_elem["classification_system"] = elem["classification"].get("system")
                
                # Handle nested quantity (assuming simple area/length)
                if "quantity" in elem and isinstance(elem["quantity"], dict):
                    q_type = elem["quantity"].get("type")
                    q_value = elem["quantity"].get("value")
                    if q_value is not None:
                        try:
                            if q_type == "area":
                                mapped_elem["area"] = float(q_value)
                            elif q_type == "length":
                                mapped_elem["length"] = float(q_value)
                        except (ValueError, TypeError):
                             logger.warning(f"Could not convert fallback quantity value '{q_value}' for element {mapped_elem['id']}")
                
                adapted_elements.append(mapped_elem)
            elements_data = adapted_elements # Use the adapted data for validation

        # If still no data after fallback
        if not elements_data:
            logger.warning(f"No element data found for '{project_name}' from any source.")
            raise HTTPException(status_code=404, detail=f"Element data not found for project '{project_name}'")

        # 3. Validate and convert data (from either source) to IFCElement models
        validated_elements = []
        validation_errors = 0
        logger.info(f"Starting validation/conversion for {len(elements_data)} elements from source: {source}")
        
        for i, elem_data in enumerate(elements_data):
            try:
                # Ensure required fields have defaults if missing before validation
                if not elem_data.get("id"):
                    elem_data["id"] = f"missing-id-{i}"
                if not elem_data.get("type"):
                     elem_data["type"] = "Unknown"
                if not elem_data.get("name"):
                    elem_data["name"] = f"Unnamed-{i}"
                if "properties" not in elem_data or elem_data["properties"] is None:
                     elem_data["properties"] = {} # Ensure properties is a dict
                
                # Add other potential defaults if needed based on IFCElement definition

                element_model = IFCElement(**elem_data)
                validated_elements.append(element_model)
            except Exception as validation_error:
                validation_errors += 1
                logger.warning(f"Skipping element {i+1} in project '{project_name}' (source: {source}) due to validation error: {validation_error}. Data snippet: {str(elem_data)[:200]}...")
                # Optionally log full data for debugging first few errors
                # if validation_errors <= 5:
                #     logger.debug(f"Full problematic data: {elem_data}")
        
        logger.info(f"Finished validation. Converted {len(validated_elements)} elements (skipped {validation_errors}) from {source} for project '{project_name}'.")
        return validated_elements

    except HTTPException as http_exc:
        # Log specific HTTP errors like 404 before re-raising
        logger.warning(f"HTTPException occurred for project '{project_name}': {http_exc.status_code} - {http_exc.detail}")
        raise http_exc
    except Exception as e:
        logger.error(f"Unexpected error retrieving elements for project '{project_name}': {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal server error retrieving project elements: {str(e)}")

@app.get("/health", response_model=HealthResponse)
def health_check():
    """
    Health check endpoint for monitoring service status
    
    Returns the status of the service, Kafka connection, and other diagnostics.
    """
    kafka_status = "unknown"
    mongodb_status = "unknown"
    
    try:
        producer = QTOKafkaProducer(max_retries=1, retry_delay=1)
        kafka_status = "connected" if producer.producer else "disconnected"
    except Exception as e:
        logger.warning(f"Kafka health check failed: {str(e)}")
        kafka_status = "disconnected"
    
    try:
        # Check MongoDB connection
        if mongodb is not None and mongodb.db is not None:
            # Try a simple operation to verify connection is working
            mongodb.db.command('ping')
            mongodb_status = "connected"
        else:
            mongodb_status = "disconnected"
    except Exception as e:
        logger.warning(f"MongoDB health check failed: {str(e)}")
        mongodb_status = "disconnected"
    
    # The service is healthy if at least Kafka or MongoDB is connected
    return {
        "status": "healthy", 
        "kafka": kafka_status,
        "mongodb": mongodb_status,
        "ifcopenshell_version": ifcopenshell.version
    }

if __name__ == "__main__":
    import uvicorn
    logger.info(f"Starting IFC Parser API server with ifcopenshell {ifcopenshell.version}")
    uvicorn.run(app, host="0.0.0.0", port=8000) 