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

# Store uploaded IFC models in memory
ifc_models = {}

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
    models_in_memory: int
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

def extract_material_layers_from_string(layers_string: str) -> Dict[str, Dict[str, Any]]:
    """
    Extract material information from the Material.Layers string property.
    This is a fallback for elements that don't have material associations but have this property.
    
    Format is typically: "Material1 (Xmm) | Material2 (Ymm) | ..."
    
    Returns:
    - Dictionary mapping material names to their properties (fraction, etc)
    """
    if not layers_string:
        return {}
    
    material_volumes = {}
    
    # Split the string by pipe character
    layers = [layer.strip() for layer in layers_string.split('|')]
    if not layers:
        return {}
    
    # Extract material names and thickness (if available)
    total_thickness = 0.0
    materials_with_thickness = []
    
    for layer in layers:
        # Try to extract material name and thickness
        if '(' in layer and ')' in layer:
            # Format: "Material (Xmm)"
            name_part = layer[:layer.rfind('(')].strip()
            thickness_part = layer[layer.rfind('(')+1:layer.rfind(')')].strip()
            
            # Try to extract the numeric thickness value
            thickness = 0.0
            if 'mm' in thickness_part:
                try:
                    thickness = float(thickness_part.replace('mm', '').strip())
                except ValueError:
                    thickness = 0.0
            
            materials_with_thickness.append((name_part, thickness))
            total_thickness += thickness
        else:
            # Just a material name without thickness
            materials_with_thickness.append((layer.strip(), 0.0))
    
    # If all thicknesses are zero, assign equal fractions
    if total_thickness <= 0.0:
        fraction = 1.0 / len(materials_with_thickness)
        for name, _ in materials_with_thickness:
            if name:  # Skip empty names
                material_volumes[name] = {
                    "fraction": _round_value(fraction, 5)
                }
    else:
        # Calculate fractions based on thickness
        for name, thickness in materials_with_thickness:
            if name:  # Skip empty names
                fraction = thickness / total_thickness if total_thickness > 0 else 0.0
                material_volumes[name] = {
                    "fraction": _round_value(fraction, 5)
                }
                if thickness > 0:
                    material_volumes[name]["width"] = _round_value(thickness, 5)
    
    return material_volumes

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

@app.post("/upload-ifc/", response_model=ModelUploadResponse)
async def upload_ifc(
    file: UploadFile = File(...),
    project: str = Form(...),
    filename: str = Form(...),
    timestamp: str = Form(...),
    background_tasks: BackgroundTasks = None
):
    """
    Upload an IFC file for processing
    
    - **file**: The IFC file to upload
    - **project**: Project identifier
    - **filename**: Filename of the IFC file
    - **timestamp**: Timestamp of the upload
    
    Returns information about the uploaded model including a model_id for future reference.
    """
   
    if not file.filename.endswith('.ifc'):
        raise HTTPException(status_code=400, detail="Only IFC files are supported")
    
    try:
        # Create temp directory if it doesn't exist
        temp_dir = os.path.join(os.getcwd(), "temp")
        os.makedirs(temp_dir, exist_ok=True)
        
        # Ensure temp directory is writable
        if not os.access(temp_dir, os.W_OK):
            raise HTTPException(status_code=500, detail="Server configuration error: Temp directory is not writable")
        
        # Save uploaded file to a temporary location with readable name
        file_uuid = str(uuid.uuid4())
        temp_file_path = os.path.join(temp_dir, f"{file_uuid}_{file.filename}")
        
        contents = await file.read()
        if len(contents) == 0:
            logger.error("Uploaded file is empty")
            raise HTTPException(status_code=400, detail="Uploaded file is empty")
        
        with open(temp_file_path, 'wb') as f:
            f.write(contents)
        
        # Verify file was written correctly
        if not os.path.exists(temp_file_path):
            logger.error(f"Failed to write file to {temp_file_path}")
            raise HTTPException(status_code=500, detail="Failed to save uploaded file")
            
        file_size = os.path.getsize(temp_file_path)
        logger.info(f"File saved successfully. Size: {file_size} bytes")
        
        # Open the IFC file with ifcopenshell
        try:
            ifc_file = ifcopenshell.open(temp_file_path)
            logger.info(f"IFC file opened successfully with schema: {ifc_file.schema}")
        except Exception as ifc_error:
            error_traceback = traceback.format_exc()
            logger.error(f"Traceback: {error_traceback}")
            
            # Check if file is actually an IFC file
            try:
                with open(temp_file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    first_line = f.readline()
                    if not first_line.startswith('ISO-10303-21') and not 'HEADER' in first_line:
                        logger.error("File does not appear to be a valid IFC file")
                        raise HTTPException(status_code=400, 
                                          detail="The uploaded file does not appear to be a valid IFC file")
            except Exception as read_error:
                logger.error(f"Error checking file format: {str(read_error)}")
                
            raise HTTPException(status_code=400, 
                              detail=f"Error processing IFC file: {str(ifc_error)}")
        
        # Generate a unique ID for this IFC model
        model_id = file_uuid
        
        # Store the IFC file in memory
        ifc_models[model_id] = {
            "filename": file.filename,
            "ifc_file": ifc_file,
            "temp_file_path": temp_file_path
        }
        
        # Get basic statistics about the file
        try:
            element_count = len(ifc_file.by_type("IfcElement"))
            entities_by_type = {}
            for entity in ifc_file.by_type("IfcElement"):
                entity_type = entity.is_a()
                if entity_type not in entities_by_type:
                    entities_by_type[entity_type] = 0
                entities_by_type[entity_type] += 1
            
        except Exception as stat_error:
            logger.error(f"Error getting file statistics: {str(stat_error)}")
            element_count = 0
            entities_by_type = {}
        
        return {
            "message": "IFC file uploaded successfully",
            "model_id": model_id,
            "filename": file.filename,
            "element_count": element_count,
            "entity_types": entities_by_type
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error processing IFC file: {str(e)}")
        logger.error(traceback.format_exc())
        
        # Clean up temp file if it was created
        if 'temp_file_path' in locals() and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
            except Exception as cleanup_error:
                logger.error(f"Error removing temp file: {str(cleanup_error)}")
        
        raise HTTPException(status_code=500, detail=f"Error processing IFC file: {str(e)}")

@app.get("/ifc-elements/{model_id}", response_model=List[IFCElement])
def get_ifc_elements(model_id: str):
    """
    Retrieve IFC elements from a previously uploaded model
    
    - **model_id**: ID of the model to retrieve elements from
    
    Returns a list of IFC elements with their properties and classifications.
    """
   
    if model_id not in ifc_models:
        logger.warning(f"Model ID not found: {model_id}")
        raise HTTPException(status_code=404, detail="IFC model not found")
    
    try:
        ifc_file = ifc_models[model_id]["ifc_file"]
        elements = []
        
        # Create a mapping of elements to their building stories
        element_to_storey = {}
        building_storeys = list(ifc_file.by_type("IfcBuildingStorey"))
        
        # Process spatial containment relationship
        for rel in ifc_file.by_type("IfcRelContainedInSpatialStructure"):
            if rel.RelatingStructure and rel.RelatingStructure.is_a("IfcBuildingStorey"):
                storey_name = rel.RelatingStructure.Name if hasattr(rel.RelatingStructure, "Name") and rel.RelatingStructure.Name else "Unknown Level"
                for element in rel.RelatedElements:
                    if element is not None:
                        try:
                            element_to_storey[element.id()] = storey_name
                        except Exception as e:
                            logger.warning(f"Error mapping element to storey: {e}")
        
        # Filter elements by TARGET_IFC_CLASSES
        if TARGET_IFC_CLASSES:
            all_elements = []
            for element_type in TARGET_IFC_CLASSES:
                if element_type and element_type.strip():
                    try:
                        type_elements = list(ifc_file.by_type(element_type.strip()))
                        all_elements.extend(type_elements)
                    except Exception as type_error:
                        logger.warning(f"Error getting elements of type {element_type}: {str(type_error)}")
            
            logger.info(f"Filtered to {len(all_elements)} elements of targeted types")
        else:
            all_elements = list(ifc_file.by_type("IfcElement"))
            logger.info(f"Processing all {len(all_elements)} elements")
        
        # Process elements in chunks
        chunk_size = 100
        for i in range(0, len(all_elements), chunk_size):
            chunk = all_elements[i:i+chunk_size]
            
            for element in chunk:
                try:
                    # Extract basic properties
                    element_id_str = str(element.id())
                    element_global_id = element.GlobalId
                    element_type_class = element.is_a()
                    element_instance_name = element.Name if hasattr(element, "Name") and element.Name else "Unnamed"                 
                    element_data = {
                        "id": element_id_str,
                        "global_id": element_global_id,
                        "type": element_type_class,
                        "name": element_instance_name,
                        "type_name": None,
                        "description": element.Description if hasattr(element, "Description") and element.Description else None,
                        "properties": {},
                        "classification_id": None,
                        "classification_name": None,
                        "classification_system": None,
                        "area": 0.0,
                        "volume": None,
                        "length": 0.0,
                        "original_area": 0.0,
                        "original_volume": None,
                        "original_length": 0.0
                    }
                    
                    # Add building storey information
                    if element.id() in element_to_storey:
                        element_data["properties"]["Pset_BuildingStoreyElevation"] = {"Name": element_to_storey[element.id()]}
                        element_data["level"] = element_to_storey[element.id()]
                    else:
                        # If we couldn't find a storey, try to extract from any containment relationship
                        for rel in element.ContainedInStructure or []:
                            if hasattr(rel, "RelatingStructure") and rel.RelatingStructure.is_a("IfcBuildingStorey"):
                                storey_name = rel.RelatingStructure.Name or "Unknown Level"
                                element_data["properties"]["Pset_BuildingStoreyElevation"] = {"Name": storey_name}
                                element_data["level"] = storey_name
                                break
                    
                    # --- Extract Type Name --- START ---
                    type_object = None
                    # Check IfcRelDefinesByType relationship via IsTypedBy inverse attribute
                    if hasattr(element, "IsTypedBy") and element.IsTypedBy:
                        for rel in element.IsTypedBy:
                            if rel.is_a("IfcRelDefinesByType") and hasattr(rel, "RelatingType") and rel.RelatingType:
                                type_object = rel.RelatingType
                                break # Assume only one type definition relationship is primary
                    
                    # Alternative check via IsDefinedBy (less common for type but possible)
                    if not type_object and hasattr(element, "IsDefinedBy"):
                         for definition in element.IsDefinedBy:
                             if definition.is_a("IfcRelDefinesByType") and hasattr(definition, "RelatingType") and definition.RelatingType:
                                 type_object = definition.RelatingType
                                 break
                    
                    # Get the name from the type object if found
                    if type_object and hasattr(type_object, "Name") and type_object.Name:
                        element_data["type_name"] = type_object.Name
                                        
                    # Extract Pset properties if available
                    if hasattr(element, "IsDefinedBy"):
                        for definition in element.IsDefinedBy:
                            # Get property sets
                            if definition.is_a('IfcRelDefinesByProperties'):
                                property_set = definition.RelatingPropertyDefinition
                                
                                # Handle regular property sets
                                if property_set.is_a('IfcPropertySet'):
                                    pset_name = property_set.Name or "PropertySet"
                                    for prop in property_set.HasProperties:
                                        if prop.is_a('IfcPropertySingleValue') and prop.NominalValue:
                                            prop_name = f"{pset_name}.{prop.Name}"
                                            prop_value = str(prop.NominalValue.wrappedValue)
                                            element_data["properties"][prop_name] = prop_value
                                
                                # Handle quantity sets
                                elif property_set.is_a('IfcElementQuantity'):
                                    qset_name = property_set.Name or "QuantitySet"
                                    element_type = element_data["type"]

                                    found_area = False
                                    found_length = False
                                    
                                    if element_type in TARGET_QUANTITIES:
                                        target_config = TARGET_QUANTITIES[element_type]
                                        target_qset_name = target_config.get("qset")
                                        target_area_name = target_config.get("area")
                                        target_length_name = target_config.get("length")

                                        # 1. Check if the current qset matches the target qset name from config
                                        if qset_name == target_qset_name:
                                            for quantity in property_set.Quantities:
                                                # Extract area based on TARGET_QUANTITIES config
                                                if not found_area and quantity.is_a('IfcQuantityArea') and target_area_name and quantity.Name == target_area_name:
                                                    try:
                                                        parsed_area = float(quantity.AreaValue)
                                                        element_data["area"] = parsed_area
                                                        element_data["original_area"] = parsed_area # Store original
                                                        found_area = True
                                                    except (ValueError, TypeError):
                                                        logger.warning(f"Could not convert area value '{quantity.Name}' in '{qset_name}' for {element_type}")
                                                
                                                # Extract length based on TARGET_QUANTITIES config
                                                if not found_length and quantity.is_a('IfcQuantityLength') and target_length_name and quantity.Name == target_length_name:
                                                    try:
                                                        parsed_length = float(quantity.LengthValue)
                                                        element_data["length"] = parsed_length
                                                        element_data["original_length"] = parsed_length # Store original
                                                        found_length = True
                                                    except (ValueError, TypeError):
                                                        logger.warning(f"Could not convert length value '{quantity.Name}' in '{qset_name}' for {element_type}")
                                                        
                                        # 2. Fallback: Check if the current qset is exactly "BaseQuantities"
                                        # Only check if the target quantity wasn't found in the specific qset
                                        elif qset_name == "BaseQuantities" and (not found_area or not found_length):
                                            for quantity in property_set.Quantities:
                                                # Extract area based on TARGET_QUANTITIES config (if not already found)
                                                if not found_area and quantity.is_a('IfcQuantityArea') and target_area_name and quantity.Name == target_area_name:
                                                    try:
                                                        parsed_area = float(quantity.AreaValue)
                                                        element_data["area"] = parsed_area
                                                        element_data["original_area"] = parsed_area # Store original
                                                        found_area = True
                                                    except (ValueError, TypeError):
                                                        logger.warning(f"Could not convert area value '{quantity.Name}' in '{qset_name}' (fallback) for {element_type}")
                                                
                                                # Extract length based on TARGET_QUANTITIES config (if not already found)
                                                if not found_length and quantity.is_a('IfcQuantityLength') and target_length_name and quantity.Name == target_length_name:
                                                    try:
                                                        parsed_length = float(quantity.LengthValue)
                                                        element_data["length"] = parsed_length
                                                        element_data["original_length"] = parsed_length # Store original
                                                        found_length = True
                                                    except (ValueError, TypeError):
                                                        logger.warning(f"Could not convert length value '{quantity.Name}' in '{qset_name}' (fallback) for {element_type}")

                                    # --- Process All Quantities for Properties (Independent of target finding) ---
                                    for quantity in property_set.Quantities:
                                        if quantity.is_a('IfcQuantityLength'):
                                            prop_name = f"{qset_name}.{quantity.Name}"
                                            prop_value = f"{quantity.LengthValue:.3f}"
                                            element_data["properties"][prop_name] = prop_value
                                        
                                        elif quantity.is_a('IfcQuantityArea'):
                                            prop_name = f"{qset_name}.{quantity.Name}"
                                            prop_value = f"{quantity.AreaValue:.3f}"
                                            element_data["properties"][prop_name] = prop_value
                                            # NO FALLBACK FOR AREA assignment here - Only use TARGET_QUANTITIES logic above
                                        
                                        elif quantity.is_a('IfcQuantityVolume'): # Keep volume processing as is
                                            prop_name = f"{qset_name}.{quantity.Name}"
                                            prop_value = f"{quantity.VolumeValue:.3f}"
                                            element_data["properties"][prop_name] = prop_value
                    
                    # Extract classification information
                    temp_classification_id = None
                    temp_classification_name = None
                    temp_classification_system = None
                    found_association = False

                    if hasattr(element, "HasAssociations"):
                        for relation in element.HasAssociations:
                            if relation.is_a("IfcRelAssociatesClassification"):
                                classification_ref = relation.RelatingClassification
                                if classification_ref.is_a("IfcClassificationReference"):
                                    # Handle IFC2X3 schema differences
                                    schema_version = ifc_file.schema
                                    if "2X3" in schema_version:
                                        temp_classification_id = classification_ref.ItemReference if hasattr(classification_ref, "ItemReference") else None
                                        temp_classification_name = classification_ref.Name if hasattr(classification_ref, "Name") else None
                                    else:
                                        temp_classification_id = classification_ref.Identification if hasattr(classification_ref, "Identification") else None
                                        temp_classification_name = classification_ref.Name if hasattr(classification_ref, "Name") else None
                                    
                                    # Get classification system name if available
                                    if hasattr(classification_ref, "ReferencedSource") and classification_ref.ReferencedSource:
                                        referenced_source = classification_ref.ReferencedSource
                                        if hasattr(referenced_source, "Name"):
                                            temp_classification_system = referenced_source.Name
                                    found_association = True
                                    
                                # If directly using IfcClassification (less common)
                                elif classification_ref.is_a("IfcClassification"):
                                    temp_classification_system = classification_ref.Name if hasattr(classification_ref, "Name") else None
                                    temp_classification_name = classification_ref.Edition if hasattr(classification_ref, "Edition") else None
                                    found_association = True

                                # Break after finding the first valid association
                                if found_association:
                                    break
                    
                    # Check properties for an overriding eBKP/Classification
                    property_override_found = False
                    for prop_name, prop_value in element_data["properties"].items():
                        if isinstance(prop_value, str) and ("ebkp" in prop_name.lower() or "classification" in prop_name.lower()):
                            # Override ID and System with property value
                            element_data["classification_id"] = prop_value
                            element_data["classification_system"] = "EBKP" # Explicitly set system based on property name convention
                            # Keep the name found via association (if any)
                            element_data["classification_name"] = temp_classification_name 
                            property_override_found = True
                            break # Stop searching properties once an override is found

                    # If no property override was found, use the values from the association (if any)
                    if not property_override_found:
                        element_data["classification_id"] = temp_classification_id
                        element_data["classification_name"] = temp_classification_name
                        element_data["classification_system"] = temp_classification_system

                    # Get volume information for the element
                    element_volume_dict = get_volume_from_properties(element)
                    element_volume_value = None # Initialize volume value
                    if element_volume_dict:
                        # Prefer net volume, fall back to gross volume
                        element_volume_value = element_volume_dict.get("net")
                        if element_volume_value is None:
                            element_volume_value = element_volume_dict.get("gross")
                    
                    # Assign the extracted float value to element_data["volume"]
                    element_data["volume"] = element_volume_value
                    element_data["original_volume"] = element_volume_value # Store original volume
                    
                    # Calculate material volumes
                    element_data["material_volumes"] = {}
                    
                    # Process material associations (uses element_volume_value which is now correctly a float or None)
                    if hasattr(element, "HasAssociations"):
                        for association in element.HasAssociations:
                            if association.is_a("IfcRelAssociatesMaterial"):
                                relating_material = association.RelatingMaterial
                                
                                unit_scale = 1.0  # Default scale factor
                                
                                # Handle different material types
                                if relating_material.is_a("IfcMaterial"):
                                    # Single material case
                                    material_name = relating_material.Name
                                    element_data["material_volumes"][material_name] = {
                                        "fraction": 1.0,
                                        "volume": _round_value(element_volume_value, 5) if element_volume_value else None
                                    }
                                    
                                elif relating_material.is_a("IfcMaterialList"):
                                    # Material list case - distribute equally
                                    materials = relating_material.Materials
                                    if materials:
                                        fraction = 1.0 / len(materials)
                                        for material in materials:
                                            material_name = material.Name
                                            element_data["material_volumes"][material_name] = {
                                                "fraction": _round_value(fraction, 5),
                                                "volume": _round_value(element_volume_value * fraction, 5) if element_volume_value else None
                                            }
                                
                                elif relating_material.is_a("IfcMaterialLayerSetUsage") or relating_material.is_a("IfcMaterialLayerSet"):
                                    # Layer set case - calculate based on layer thickness
                                    constituent_fractions, constituent_widths = compute_constituent_fractions(
                                        ifc_file, 
                                        relating_material,
                                        [element],
                                        unit_scale
                                    )
                                    
                                    layer_set = relating_material if relating_material.is_a("IfcMaterialLayerSet") else relating_material.ForLayerSet
                                    
                                    if layer_set and layer_set.MaterialLayers:
                                        total_fraction = 0.0
                                        
                                        for layer, fraction in constituent_fractions.items():
                                            if hasattr(layer, "Material") and layer.Material:
                                                material_name = layer.Material.Name
                                                layer_volume = element_volume_value * fraction if element_volume_value else None
                                                
                                                # Handle duplicate material names
                                                counter = 1
                                                unique_name = material_name
                                                while unique_name in element_data["material_volumes"]:
                                                    unique_name = f"{material_name} ({counter})"
                                                    counter += 1
                                                
                                                volume_data = {
                                                    "fraction": _round_value(fraction, 5)
                                                }
                                                
                                                if layer_volume is not None:
                                                    volume_data["volume"] = _round_value(layer_volume, 5)
                                                
                                                # Add width/thickness if available
                                                if layer in constituent_widths and constituent_widths[layer] > 0:
                                                    volume_data["width"] = _round_value(constituent_widths[layer], 5)
                                                
                                                element_data["material_volumes"][unique_name] = volume_data
                                                total_fraction += fraction
                                
                                elif relating_material.is_a("IfcMaterialConstituentSet"):
                                    # Constituent set case
                                    constituent_fractions, constituent_widths = compute_constituent_fractions(
                                        ifc_file,
                                        relating_material,
                                        [element],
                                        unit_scale
                                    )
                                    
                                    if constituent_fractions:
                                        total_fraction = 0.0
                                        
                                        for constituent, fraction in constituent_fractions.items():
                                            if hasattr(constituent, "Material") and constituent.Material:
                                                material_name = constituent.Material.Name
                                                constituent_volume = element_volume_value * fraction if element_volume_value else None
                                                
                                                # Handle duplicate material names
                                                counter = 1
                                                unique_name = material_name
                                                while unique_name in element_data["material_volumes"]:
                                                    unique_name = f"{material_name} ({counter})"
                                                    counter += 1
                                                
                                                volume_data = {
                                                    "fraction": _round_value(fraction, 5)
                                                }
                                                
                                                if constituent_volume is not None:
                                                    volume_data["volume"] = _round_value(constituent_volume, 5)
                                                
                                                # Add width/thickness if available
                                                if constituent in constituent_widths and constituent_widths[constituent] > 0:
                                                    volume_data["width"] = _round_value(constituent_widths[constituent], 5)
                                                
                                                element_data["material_volumes"][unique_name] = volume_data
                                                total_fraction += fraction
                    
                    # Remove material_volumes if empty
                    if not element_data["material_volumes"]:
                        element_data.pop("material_volumes")
                                            
                    elements.append(IFCElement(**element_data))
                except Exception as prop_error:
                    logger.error(f"Error extracting properties for element {element.id()}: {str(prop_error)}")
                    logger.error(traceback.format_exc())
        
        logger.info(f"Successfully extracted {len(elements)} elements from model ID: {model_id}")
        
        # Log summary statistics
        elements_with_area = [e for e in elements if hasattr(e, "area") and e.area and e.area > 0]
        elements_with_materials = [e for e in elements if hasattr(e, "material_volumes") and e.material_volumes]
        logger.info(f"Summary: {len(elements_with_area)} elements with area, {len(elements_with_materials)} elements with materials")
        
        return elements
    
    except Exception as e:
        logger.error(f"Error retrieving elements for model ID {model_id}: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error retrieving elements: {str(e)}")

@app.get("/models", response_model=List[ModelInfo])
def list_models():
    """
    List all uploaded models
    
    Returns information about all models uploaded to the server.
    """
    logger.info("Retrieving list of models")
    
    try:
        result = []
        for model_id, model_data in ifc_models.items():
            ifc_file = model_data["ifc_file"]
            
            # Get entity counts by type
            entity_counts = {}
            for entity_type in set(e.is_a() for e in ifc_file.by_type("IfcElement")):
                entity_counts[entity_type] = len(ifc_file.by_type(entity_type))
            
            result.append({
                "model_id": model_id,
                "filename": model_data["filename"],
                "element_count": len(ifc_file.by_type("IfcElement")),
                "entity_counts": entity_counts
            })
        
        logger.info(f"Successfully retrieved {len(result)} models")
        return result
    
    except Exception as e:
        logger.error(f"Error retrieving model list: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error retrieving model list: {str(e)}")

@app.delete("/models/{model_id}", response_model=ModelDeleteResponse)
def delete_model(model_id: str):
    """
    Delete a previously uploaded model
    
    - **model_id**: ID of the model to delete
    
    Returns a confirmation message.
    """
    logger.info(f"Deleting model ID: {model_id}")
    
    if model_id not in ifc_models:
        logger.warning(f"Model ID not found for deletion: {model_id}")
        raise HTTPException(status_code=404, detail="IFC model not found")
    
    try:
        # Delete temporary file
        temp_file_path = ifc_models[model_id]["temp_file_path"]
        if os.path.exists(temp_file_path):
            os.unlink(temp_file_path)
            logger.info(f"Temporary file {temp_file_path} removed")
        
        # Remove from memory
        del ifc_models[model_id]
        logger.info(f"Model ID {model_id} successfully deleted")
        
        return {"message": "IFC model deleted successfully"}
    
    except Exception as e:
        logger.error(f"Error deleting model ID {model_id}: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error deleting model: {str(e)}")

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
    
    # Check models in memory
    models_count = len(ifc_models)
    
    # The service is healthy if at least Kafka or MongoDB is connected
    # as the API can still process uploads and analyze IFC files
    return {
        "status": "healthy", 
        "kafka": kafka_status,
        "mongodb": mongodb_status,
        "models_in_memory": models_count,
        "ifcopenshell_version": ifcopenshell.version
    }

@app.post("/send-qto/", response_model=QTOResponse)
async def send_qto(
    model_id: str = Query(..., description="The ID of the model to send to Kafka"),
    body: Optional[QTORequestBody] = None
):
    """
    Send QTO data from an IFC model to Kafka
    
    - **model_id**: ID of the model to process and send
    - **body**: Optional request body with updated elements and project name
    
    Returns confirmation of the data being sent to Kafka.
    """
    
    if model_id not in ifc_models:
        logger.warning(f"Model ID not found: {model_id}")
        raise HTTPException(status_code=404, detail="IFC model not found")
    
    try:
        # --- Always get fresh data from the IFC model for saving --- 
        elements_input = get_ifc_elements(model_id) # Always use freshly parsed data
        
        # Log if body elements were provided but are being ignored for the base data
        if body and body.elements:
            pass

        # --- Convert elements to dictionaries consistently --- 
        element_dicts = []
        for element_model in elements_input: # Process either ElementInputData or IFCElement
            if not element_model:
                continue # Skip if element_model is None for some reason
            try:
                # Use .model_dump() for Pydantic v2+ models
                # exclude_none=True cleans up the dict for downstream processing
                element_dict = element_model.model_dump(exclude_none=True) 
            except AttributeError:
                # Fallback to .dict() for older Pydantic versions
                try:
                    element_dict = element_model.dict(exclude_none=True)
                except AttributeError:
                    logger.error(f"Could not convert element model to dict: {type(element_model)}")
                    element_dict = {} # Use empty dict as fallback
            except Exception as dump_error:
                 logger.error(f"Error dumping element model to dict: {dump_error}")
                 element_dict = {} # Use empty dict as fallback
                 
            element_dicts.append(element_dict)
        
        if body and body.elements:
            # Create a lookup map from the input ElementInputData models
            edited_elements_map = {el.id: el.model_dump(exclude_none=True) for el in body.elements if el and el.id}
            
            updated_count = 0
            # Define fields that can be updated from the request
            # ONLY allow quantity fields to be updated for now
            EDITABLE_FIELDS = ["area", "length", "volume"]

            # Iterate through the original dictionaries
            for i in range(len(element_dicts)):
                parsed_dict = element_dicts[i]
                element_id = parsed_dict.get("id")
                if element_id and element_id in edited_elements_map:
                    edited_dict = edited_elements_map[element_id]
                    updated = False
                    # Only update allowed fields if they exist in the edited data
                    for field in EDITABLE_FIELDS:
                        if field in edited_dict and edited_dict[field] is not None:
                            # Special check for quantities to avoid overwriting with 0 if not intended?
                            # Or just trust frontend sends valid numbers?
                            # For now, directly update:
                            parsed_dict[field] = edited_dict[field]
                            updated = True
                            
                    # Handle potential nested quantity update if frontend sends it
                    if 'quantity' in edited_dict and isinstance(edited_dict['quantity'], dict):
                        # Decide how to merge/update nested quantity
                        # Simplest: overwrite if present
                        parsed_dict['quantity'] = edited_dict['quantity'] 
                        updated = True
                        
                    if updated:
                        updated_count += 1
            
            if updated_count > 0:
                logger.info(f"Updated {updated_count} elements with data from the request body.")

        # Get project info
        filename = ifc_models[model_id]["filename"]
        
        # Use the project name from the request if available, otherwise use filename
        if body and body.project:
            project_name = body.project
        else:
            project_name = filename.split('.')[0]
            
        file_id = f"{project_name}/{filename}"
        
        # --- Prepare data for the producer ---
        # Pass raw elements and metadata directly
        project_update_data = {
            "project": project_name,
            "filename": filename,
            "file_id": file_id,
            "elements": element_dicts,
            "timestamp": datetime.utcnow().isoformat() + "Z" # Add timestamp here
        }
        # Remove the call to format_ifc_elements_for_qto as it's no longer needed here
        # qto_data = format_ifc_elements_for_qto( ... )

        # Save to MongoDB if available (Consider moving this inside the producer logic if needed)
        # This part might be redundant if the producer handles project saving
        if mongodb is not None and mongodb.db is not None:
            project_id = mongodb.save_project({
                "name": project_name,
                "description": f"Project for {filename}",
                "metadata": {
                    "file_id": file_id,
                    "filename": filename
                }
            })
            if project_id:
                # Add project_id to the data payload if needed downstream
                project_update_data["project_id_mongodb"] = str(project_id)

        # Send data to Kafka
        producer = QTOKafkaProducer()
        # Pass the new structure containing raw elements
        send_success = producer.send_qto_message(project_update_data)
        flush_success = producer.flush()

        if not send_success or not flush_success:
            logger.warning("Data was processed but could not be sent to Kafka")
            return {
                "message": "QTO data processed but not sent to Kafka (service unavailable)",
                "model_id": model_id,
                "element_count": len(elements_input),
                "kafka_status": "unavailable"
            }
        
       
        return {
            "message": "QTO data sent to Kafka successfully",
            "model_id": model_id,
            "element_count": len(elements_input),
            "kafka_status": "connected"
        }
    
    except Exception as e:
        logger.error(f"Error sending QTO data: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error sending QTO data: {str(e)}")

@app.get("/qto-elements/{model_id}")
def get_qto_elements(model_id: str):
    """
    Get elements in QTO format for display in the frontend
    
    - **model_id**: ID of the model to retrieve QTO elements from
    
    Returns elements formatted for QTO visualization.
    """
   
    if model_id not in ifc_models:
        logger.warning(f"Model ID not found: {model_id}")
        raise HTTPException(status_code=404, detail="IFC model not found")
    
    try:
        # Get elements using existing function that already applies filtering
        elements = get_ifc_elements(model_id)
        
        elements_with_area = [e for e in elements if hasattr(e, "area") and e.area and e.area > 0]
        
        # Convert IFCElement model instances to dictionaries
        element_dicts = []
        for element in elements:
            element_dict = element.model_dump()
            element_dicts.append(element_dict)
        
        # Get project info
        filename = ifc_models[model_id]["filename"]
        project_name = filename.split('.')[0]  # Use filename without extension as project name
        
        # Format the data for QTO
        qto_data = format_ifc_elements_for_qto(
            project_name=project_name,
            filename=filename,
            file_id=f"{project_name}/{filename}",
            elements=element_dicts
        )
        
        # Return just the elements part of the QTO data
        return qto_data["elements"]
    
    except Exception as e:
        logger.error(f"Error retrieving QTO elements for model ID {model_id}: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error retrieving QTO elements: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    logger.info(f"Starting IFC Parser API server with ifcopenshell {ifcopenshell.version}")
    uvicorn.run(app, host="0.0.0.0", port=8000) 