from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
import ifcopenshell
import tempfile
import logging
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import uuid
import traceback
import sys
from functools import lru_cache
from qto_producer import QTOKafkaProducer, format_ifc_elements_for_qto

# Set up logging with more detailed format
logging.basicConfig(level=logging.DEBUG, 
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Log ifcopenshell version at startup
logger.info(f"Using ifcopenshell version: {ifcopenshell.version}")
logger.info(f"Python version: {sys.version}")

app = FastAPI()

# Add CORS middleware with more permissive settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins in development
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Store uploaded IFC models in memory
ifc_models = {}

class IFCElement(BaseModel):
    id: str
    global_id: str
    type: str
    name: str
    description: Optional[str] = None
    properties: Dict[str, Any] = {}
    material_volumes: Optional[Dict[str, Dict[str, Any]]] = None

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
    
    logger.debug(f"Computing fractions for material set type: {constituent_set.is_a()}")
    
    # Handle IfcMaterialConstituentSet
    if constituent_set.is_a('IfcMaterialConstituentSet'):
        constituents = constituent_set.MaterialConstituents or []
        if not constituents:
            logger.debug("No constituents found in IfcMaterialConstituentSet")
            return {}, {}
        
        logger.debug(f"Found {len(constituents)} constituents in IfcMaterialConstituentSet")
        
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
                    logger.debug(f"Using explicit fraction {fraction} for {constituent_name}")
                except (ValueError, TypeError):
                    logger.debug(f"Failed to convert fraction value for {constituent_name}")
        
        # If any explicit fractions were found, normalize and return them
        if has_explicit_fractions:
            total = sum(fractions.values())
            if total > 0:
                fractions = {constituent: fraction / total for constituent, fraction in fractions.items()}
                logger.debug(f"Normalized explicit fractions, total: {total}")
            
            # For constituents without explicit fractions, distribute remaining equally
            constituents_without_fractions = [c for c in constituents if c not in fractions]
            if constituents_without_fractions:
                remaining = 1.0 - sum(fractions.values())
                equal_fraction = remaining / len(constituents_without_fractions)
                for constituent in constituents_without_fractions:
                    fractions[constituent] = equal_fraction
                    logger.debug(f"Assigned remaining fraction {equal_fraction} to {constituent.Name}")
            
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
                            logger.debug(f"Found width {width_mm}mm for {constituent_name} from complex quantity")
                            break
                        except (ValueError, TypeError):
                            logger.debug(f"Failed to convert width value for {constituent_name}")
            
            # If no width found in complex quantities, try standard quantities
            if width_mm == 0.0:
                for quantity in quantities:
                    if quantity.is_a('IfcQuantityLength'):
                        try:
                            quantity_name = (quantity.Name or '').strip().lower()
                            if quantity_name == constituent_name or constituent_name in quantity_name:
                                width_mm = float(quantity.LengthValue) * unit_scale_to_mm
                                logger.debug(f"Found width {width_mm}mm for {constituent_name} from standard quantity")
                                break
                        except (ValueError, TypeError):
                            continue
            
            constituent_widths[constituent] = width_mm
            total_width_mm += width_mm
        
        # Calculate fractions based on widths
        if total_width_mm > 0:
            for constituent, width_mm in constituent_widths.items():
                if constituent not in fractions:  # Skip if fraction already set
                    fractions[constituent] = width_mm / total_width_mm
                    logger.debug(f"Calculated fraction {width_mm / total_width_mm} based on width for {getattr(constituent, 'Name', 'Unnamed')}")
        
        # If no width info available, distribute equally
        if not fractions or sum(fractions.values()) < 0.0001:
            logger.debug(f"No valid width info found, distributing equally among {len(constituents)} constituents")
            fractions = {constituent: 1.0 / len(constituents) for constituent in constituents}
    
    # Handle IfcMaterialLayerSet or IfcMaterialLayerSetUsage
    elif constituent_set.is_a('IfcMaterialLayerSet') or constituent_set.is_a('IfcMaterialLayerSetUsage'):
        layer_set = constituent_set if constituent_set.is_a('IfcMaterialLayerSet') else constituent_set.ForLayerSet
        
        if not layer_set or not layer_set.MaterialLayers:
            logger.debug("No layers found in layer set")
            return {}, {}
        
        total_thickness = 0.0
        layers = layer_set.MaterialLayers
        
        logger.debug(f"Found {len(layers)} layers in material layer set")
        
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
            logger.debug("All layers have zero thickness, using default equal distribution")
            for layer in layers:
                constituent_widths[layer] = default_thickness
                total_thickness += default_thickness
                
                # Get material name for better logging
                material_name = "Unknown"
                if hasattr(layer, 'Material') and layer.Material:
                    material_name = layer.Material.Name
                logger.debug(f"Assigned default thickness {default_thickness} to layer with material {material_name}")
        else:
            # Calculate total thickness from actual values
            for layer in layers:
                if hasattr(layer, 'LayerThickness'):
                    try:
                        thickness = float(layer.LayerThickness or 0) * unit_scale_to_mm
                        
                        # Get material name for better logging
                        material_name = "Unknown"
                        if hasattr(layer, 'Material') and layer.Material:
                            material_name = layer.Material.Name
                            
                        logger.debug(f"Layer material {material_name} has thickness {thickness}mm")
                        constituent_widths[layer] = thickness
                        total_thickness += thickness
                    except (ValueError, TypeError):
                        logger.debug(f"Failed to convert thickness value for layer")
                        # Use default thickness for this layer
                        constituent_widths[layer] = default_thickness
                        total_thickness += default_thickness
        
        # Calculate fractions based on layer thickness
        if total_thickness > 0:
            for layer in layers:
                thickness = constituent_widths.get(layer, 0)
                fraction = thickness / total_thickness
                
                # Get material name for better logging
                material_name = "Unknown"
                if hasattr(layer, 'Material') and layer.Material:
                    material_name = layer.Material.Name
                    
                logger.debug(f"Layer material {material_name}: thickness={thickness}mm, fraction={fraction}")
                fractions[layer] = fraction
        else:
            # Equal distribution if no thickness info
            logger.debug(f"No valid thickness info found, distributing equally among {len(layers)} layers")
            fractions = {layer: 1.0 / len(layers) for layer in layers}
    
    # Normalize fractions to ensure sum is 1.0
    total = sum(fractions.values())
    if total > 0:
        fractions = {constituent: fraction / total for constituent, fraction in fractions.items()}
        
        # Log the final fractions for debugging
        logger.debug("Final normalized fractions:")
        for constituent, fraction in fractions.items():
            name = "Unknown"
            if hasattr(constituent, 'Material') and constituent.Material:
                name = constituent.Material.Name
            elif hasattr(constituent, 'Name'):
                name = constituent.Name
            logger.debug(f"  {name}: {fraction}")
    
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
    
    logger.debug(f"Extracting materials from string: {layers_string}")
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
        logger.debug(f"No valid thicknesses found, using equal distribution for {len(materials_with_thickness)} materials")
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
        logger.debug(f"Calculated fractions based on thickness for {len(materials_with_thickness)} materials")
    
    return material_volumes

@app.get("/")
def read_root():
    logger.info("API root endpoint accessed")
    return {"message": "IFC Parser API is running"}

@app.post("/upload-ifc/", response_model=Dict[str, Any])
async def upload_ifc(file: UploadFile = File(...), background_tasks: BackgroundTasks = None):
    logger.info(f"Received file upload request for {file.filename} with content type {file.content_type}")
    
    if not file.filename.endswith('.ifc'):
        logger.warning(f"Rejected non-IFC file: {file.filename}")
        raise HTTPException(status_code=400, detail="Only IFC files are supported")
    
    try:
        # Create temp directory if it doesn't exist
        temp_dir = os.path.join(os.getcwd(), "temp")
        os.makedirs(temp_dir, exist_ok=True)
        
        # Ensure temp directory is writable
        if not os.access(temp_dir, os.W_OK):
            logger.error(f"Temp directory {temp_dir} is not writable")
            raise HTTPException(status_code=500, detail="Server configuration error: Temp directory is not writable")
        
        # Save uploaded file to a temporary location with readable name
        file_uuid = str(uuid.uuid4())
        temp_file_path = os.path.join(temp_dir, f"{file_uuid}_{file.filename}")
        
        logger.info(f"Saving uploaded file to {temp_file_path}")
        contents = await file.read()
        
        logger.debug(f"File size: {len(contents)} bytes")
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
        logger.info(f"File saved successfully. Size on disk: {file_size} bytes")
        
        # Open the IFC file with ifcopenshell - wrapped in try/except
        try:
            logger.info(f"Opening IFC file with ifcopenshell {ifcopenshell.version}: {temp_file_path}")
            ifc_file = ifcopenshell.open(temp_file_path)
            logger.info(f"IFC file opened successfully with schema: {ifc_file.schema}")
        except Exception as ifc_error:
            logger.error(f"ifcopenshell failed to open the file: {str(ifc_error)}")
            # Add more detailed error info
            error_traceback = traceback.format_exc()
            logger.error(f"Traceback: {error_traceback}")
            
            # Check if file is actually an IFC file by inspecting first few bytes
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
                              detail=f"Error processing IFC file: {str(ifc_error)}. The file may be corrupted or in an unsupported format.")
        
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
            
            logger.info(f"IFC file processed successfully. Found {element_count} elements.")
            logger.info(f"Entity types: {entities_by_type}")
        except Exception as stat_error:
            logger.error(f"Error getting file statistics: {str(stat_error)}")
            # Continue anyway since the file was loaded
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
        # Re-raise HTTP exceptions as they already have status codes
        raise
    except Exception as e:
        logger.error(f"Unexpected error processing IFC file: {str(e)}")
        logger.error(traceback.format_exc())
        
        # Clean up temp file if it was created
        if 'temp_file_path' in locals() and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
                logger.info(f"Temporary file {temp_file_path} removed")
            except Exception as cleanup_error:
                logger.error(f"Error removing temp file: {str(cleanup_error)}")
        
        # Return a more detailed error message
        raise HTTPException(status_code=500, detail=f"Error processing IFC file: {str(e)}")

@app.get("/ifc-elements/{model_id}", response_model=List[IFCElement])
def get_ifc_elements(model_id: str):
    logger.info(f"Retrieving elements for model ID: {model_id}")
    
    if model_id not in ifc_models:
        logger.warning(f"Model ID not found: {model_id}")
        raise HTTPException(status_code=404, detail="IFC model not found")
    
    try:
        ifc_file = ifc_models[model_id]["ifc_file"]
        elements = []
        
        # Process IfcElements in chunks to avoid memory issues
        chunk_size = 100
        all_elements = list(ifc_file.by_type("IfcElement"))
        
        for i in range(0, len(all_elements), chunk_size):
            chunk = all_elements[i:i+chunk_size]
            
            for element in chunk:
                # Extract basic properties
                element_data = {
                    "id": str(element.id()),
                    "global_id": element.GlobalId,
                    "type": element.is_a(),
                    "name": element.Name if hasattr(element, "Name") and element.Name else "Unnamed",
                    "description": element.Description if hasattr(element, "Description") and element.Description else None,
                    "properties": {}
                }
                
                # Extract Pset properties if available
                try:
                    # Extract quantities (using 0.8.1 API)
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
                                    for quantity in property_set.Quantities:
                                        if quantity.is_a('IfcQuantityLength'):
                                            prop_name = f"{qset_name}.{quantity.Name}"
                                            prop_value = f"{quantity.LengthValue:.3f}"
                                            element_data["properties"][prop_name] = prop_value
                                        
                                        elif quantity.is_a('IfcQuantityArea'):
                                            prop_name = f"{qset_name}.{quantity.Name}"
                                            prop_value = f"{quantity.AreaValue:.3f}"
                                            element_data["properties"][prop_name] = prop_value
                                        
                                        elif quantity.is_a('IfcQuantityVolume'):
                                            prop_name = f"{qset_name}.{quantity.Name}"
                                            prop_value = f"{quantity.VolumeValue:.3f}"
                                            element_data["properties"][prop_name] = prop_value
                                        
                                        elif quantity.is_a('IfcQuantityCount'):
                                            prop_name = f"{qset_name}.{quantity.Name}"
                                            prop_value = f"{quantity.CountValue}"
                                            element_data["properties"][prop_name] = prop_value
                
                    # Get volume information for the element
                    element_volume = get_volume_from_properties(element)
                    if element_volume:
                        element_data["volume"] = element_volume
                    
                    # Calculate material volumes
                    element_data["material_volumes"] = {}
                    
                    # Get element volume for calculations (prefer net over gross)
                    element_volume_value = None
                    if element_volume:
                        element_volume_value = element_volume.get("net") or element_volume.get("gross")
                                        
                    # Process material associations
                    has_material_volumes = False
                    if hasattr(element, "HasAssociations"):
                        for association in element.HasAssociations:
                            if association.is_a("IfcRelAssociatesMaterial"):
                                has_material_volumes = True
                                relating_material = association.RelatingMaterial
                                logger.debug(f"Processing material association type: {relating_material.is_a()} for element {element.GlobalId}")
                                
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
                    
                    # Fallback: For elements with Material.Layers property but no material associations
                    if not has_material_volumes and "Material.Layers" in element_data["properties"]:
                        logger.debug(f"Using Material.Layers fallback for element {element.GlobalId}")
                        material_layers_string = element_data["properties"]["Material.Layers"]
                        
                        # Try to get actual layer thicknesses from any material layer set in the project
                        material_names = []
                        material_layers_map = {}
                        
                        # Extract material names from the Material.Layers string
                        layers = [layer.strip() for layer in material_layers_string.split('|')]
                        for layer in layers:
                            if '(' in layer and ')' in layer:
                                name_part = layer[:layer.rfind('(')].strip()
                                material_names.append(name_part)
                            else:
                                material_names.append(layer.strip())
                        
                        # Look for corresponding material layer sets in the project
                        material_layer_sets = []
                        all_rel_materials = list(ifc_file.by_type("IfcRelAssociatesMaterial"))
                        
                        for rel_material in all_rel_materials:
                            relating_material = rel_material.RelatingMaterial
                            if relating_material.is_a('IfcMaterialLayerSet') or relating_material.is_a('IfcMaterialLayerSetUsage'):
                                layer_set = relating_material if relating_material.is_a('IfcMaterialLayerSet') else relating_material.ForLayerSet
                                if layer_set and layer_set.MaterialLayers:
                                    material_layer_sets.append(layer_set)
                        
                        logger.debug(f"Found {len(material_layer_sets)} material layer sets in the project")
                        
                        # Try to match material names to layer sets
                        for material_name in material_names:
                            for layer_set in material_layer_sets:
                                for layer in layer_set.MaterialLayers:
                                    if layer.Material and layer.Material.Name == material_name:
                                        material_layers_map[material_name] = layer
                                        logger.debug(f"Matched material {material_name} to layer with thickness {layer.LayerThickness}")
                                        break
                        
                        # If we found any matches, use those for calculating fractions
                        if material_layers_map:
                            logger.debug(f"Using actual layer thicknesses for {len(material_layers_map)} materials")
                            total_thickness = sum(layer.LayerThickness for layer in material_layers_map.values() if hasattr(layer, 'LayerThickness'))
                            
                            if total_thickness > 0:
                                material_volumes = {}
                                for name, layer in material_layers_map.items():
                                    if hasattr(layer, 'LayerThickness'):
                                        fraction = layer.LayerThickness / total_thickness
                                        material_volumes[name] = {
                                            "fraction": _round_value(fraction, 5),
                                            "width": _round_value(layer.LayerThickness, 5)
                                        }
                                        logger.debug(f"Material {name}: thickness={layer.LayerThickness}, fraction={fraction}")
                                
                                # For materials without matches, distribute the remaining fraction equally
                                unmatched_materials = [name for name in material_names if name not in material_layers_map]
                                if unmatched_materials:
                                    remaining_fraction = 1.0 - sum(info["fraction"] for info in material_volumes.values())
                                    equal_fraction = remaining_fraction / len(unmatched_materials) if unmatched_materials else 0
                                    
                                    for name in unmatched_materials:
                                        material_volumes[name] = {
                                            "fraction": _round_value(equal_fraction, 5)
                                        }
                                        logger.debug(f"Unmatched material {name}: assigned equal fraction {equal_fraction}")
                                
                                # Add volumes if we have element volume
                                if element_volume_value:
                                    for material_name, info in material_volumes.items():
                                        fraction = info["fraction"]
                                        material_volumes[material_name]["volume"] = _round_value(element_volume_value * fraction, 5)
                                
                                element_data["material_volumes"] = material_volumes
                                logger.debug(f"Created material volumes with actual thicknesses: {material_volumes}")
                            else:
                                # Fall back to string parsing
                                material_volumes = extract_material_layers_from_string(material_layers_string)
                                
                                if material_volumes and element_volume_value:
                                    for material_name, info in material_volumes.items():
                                        fraction = info["fraction"]
                                        material_volumes[material_name]["volume"] = _round_value(element_volume_value * fraction, 5)
                                
                                element_data["material_volumes"] = material_volumes
                                logger.debug(f"Extracted {len(material_volumes)} materials from Material.Layers string (fallback)")
                        else:
                            # Fall back to string parsing
                            material_volumes = extract_material_layers_from_string(material_layers_string)
                            
                            if material_volumes and element_volume_value:
                                for material_name, info in material_volumes.items():
                                    fraction = info["fraction"]
                                    material_volumes[material_name]["volume"] = _round_value(element_volume_value * fraction, 5)
                            
                            element_data["material_volumes"] = material_volumes
                            logger.debug(f"Extracted {len(material_volumes)} materials from Material.Layers string (no matches found)")
                    
                    # Remove material_volumes if empty
                    if not element_data["material_volumes"]:
                        element_data.pop("material_volumes")
                    else:
                        logger.debug(f"Material volumes for {element.GlobalId}: {element_data['material_volumes']}")
                                            
                except Exception as prop_error:
                    logger.error(f"Error extracting properties for element {element.id()}: {str(prop_error)}")
                    logger.error(traceback.format_exc())
                
                elements.append(IFCElement(**element_data))
        
        logger.info(f"Successfully extracted {len(elements)} elements from model ID: {model_id}")
        return elements
    
    except Exception as e:
        logger.error(f"Error retrieving elements for model ID {model_id}: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error retrieving elements: {str(e)}")

@app.get("/models", response_model=List[Dict[str, Any]])
def list_models():
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

@app.delete("/models/{model_id}")
def delete_model(model_id: str):
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

@app.get("/health")
def health_check():
    """Health check endpoint for Docker healthcheck."""
    kafka_status = "unknown"
    
    try:
        # Check Kafka connection
        producer = QTOKafkaProducer(max_retries=1, retry_delay=1)
        # If producer was initialized successfully, set status to connected
        kafka_status = "connected" if producer.producer else "disconnected"
    except Exception as e:
        logger.warning(f"Kafka health check failed: {str(e)}")
        kafka_status = "disconnected"
    
    # Check models in memory
    models_count = len(ifc_models)
    
    # The service is healthy even if Kafka is disconnected
    # as the API can still process uploads and analyze IFC files
    return {
        "status": "healthy", 
        "kafka": kafka_status,
        "models_in_memory": models_count,
        "ifcopenshell_version": ifcopenshell.version
    }

@app.post("/send-qto/", response_model=Dict[str, Any])
async def send_qto(model_id: str = Query(..., description="The ID of the model to send to Kafka")):
    """Send QTO data to Kafka using the QTOKafkaProducer."""
    logger.info(f"Sending QTO data to Kafka for model ID: {model_id}")
    
    if model_id not in ifc_models:
        logger.warning(f"Model ID not found: {model_id}")
        raise HTTPException(status_code=404, detail="IFC model not found")
    
    try:
        # Get elements using existing function to avoid duplicating parsing logic
        elements = get_ifc_elements(model_id)
        
        # Convert IFCElement model instances to dictionaries
        element_dicts = [element.model_dump() for element in elements]
        
        # Get project info
        filename = ifc_models[model_id]["filename"]
        project_name = filename.split('.')[0]  # Use filename without extension as project name
        file_id = f"{project_name}/{filename}"
        
        # Format the data for QTO message
        qto_data = format_ifc_elements_for_qto(
            project_name=project_name,
            filename=filename,
            file_id=file_id,
            elements=element_dicts
        )
        
        # Send data to Kafka
        producer = QTOKafkaProducer()
        send_success = producer.send_qto_message(qto_data)
        flush_success = producer.flush()
        
        if not send_success or not flush_success:
            logger.warning("Data was processed but could not be sent to Kafka. The service may be unavailable.")
            return {
                "message": "QTO data processed but not sent to Kafka (service unavailable)",
                "model_id": model_id,
                "element_count": len(elements),
                "kafka_status": "unavailable"
            }
        
        logger.info(f"Successfully sent QTO data for {len(elements)} elements to Kafka")
        
        return {
            "message": "QTO data sent to Kafka successfully",
            "model_id": model_id,
            "element_count": len(elements),
            "kafka_status": "connected"
        }
    
    except Exception as e:
        logger.error(f"Error sending QTO data for model ID {model_id}: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error sending QTO data: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    logger.info(f"Starting IFC Parser API server with ifcopenshell {ifcopenshell.version}")
    uvicorn.run(app, host="0.0.0.0", port=8000) 