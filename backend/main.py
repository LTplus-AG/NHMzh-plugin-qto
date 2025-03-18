from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
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
        
        # Extract all IfcElements
        logger.info(f"Extracting elements from model ID: {model_id}")
        for element in ifc_file.by_type("IfcElement"):
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
                                        
                # Extract material information
                if hasattr(element, "HasAssociations"):
                    for association in element.HasAssociations:
                        if association.is_a("IfcRelAssociatesMaterial"):
                            relating_material = association.RelatingMaterial
                            if relating_material.is_a("IfcMaterial"):
                                element_data["properties"]["Material.Name"] = relating_material.Name
                            elif relating_material.is_a("IfcMaterialList"):
                                materials = [m.Name for m in relating_material.Materials]
                                element_data["properties"]["Material.Name"] = ", ".join(materials)
                            elif relating_material.is_a("IfcMaterialLayerSetUsage"):
                                if relating_material.ForLayerSet and relating_material.ForLayerSet.MaterialLayers:
                                    layers = []
                                    for layer in relating_material.ForLayerSet.MaterialLayers:
                                        if layer.Material:
                                            layers.append(f"{layer.Material.Name} ({layer.LayerThickness:.0f}mm)")
                                    element_data["properties"]["Material.Layers"] = " | ".join(layers)
            except Exception as prop_error:
                logger.error(f"Error extracting properties for element {element.id()}: {str(prop_error)}")
            
            # Add some common geometric information if possible
            try:
                # Try to get bounding box for volumes/areas (using ifcopenshell utilities if available)
                if hasattr(ifcopenshell, "util") and hasattr(ifcopenshell.util, "geolocation"):
                    # Use modern ifcopenshell 0.8.1 API - only include this if it works with your version
                    # If these utilities aren't available, we'll rely on the property sets instead
                    pass
            except Exception as geom_error:
                logger.warning(f"Could not extract geometry for element {element.id()}: {str(geom_error)}")
            
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
    """Simple health check endpoint"""
    return {
        "status": "healthy", 
        "models_in_memory": len(ifc_models),
        "ifcopenshell_version": ifcopenshell.version
    }

if __name__ == "__main__":
    import uvicorn
    logger.info(f"Starting IFC Parser API server with ifcopenshell {ifcopenshell.version}")
    uvicorn.run(app, host="0.0.0.0", port=8000) 