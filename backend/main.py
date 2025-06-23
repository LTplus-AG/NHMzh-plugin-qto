from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Query, Request, Form, status, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.openapi.docs import get_swagger_ui_html, get_redoc_html
from fastapi.openapi.utils import get_openapi
import os
import ifcopenshell
import tempfile
import logging
from typing import List, Dict, Any, Optional
import uuid
import traceback
import sys
from functools import lru_cache
from pathlib import Path
from qto_producer import MongoDBHelper
import re
from pymongo.database import Database
from bson.objectid import ObjectId
from ifc_quantities_config import TARGET_QUANTITIES, _get_quantity_value
from datetime import datetime, timezone
from ifc_materials_parser import parse_element_materials
from models import (
    QuantityData, ClassificationData, MaterialData,
    ManualQuantityInput, ClassificationNested, ManualMaterialInput, ManualClassificationInput,
    IFCElement, # Import directly
    ElementListResponse, BatchUpdateResponse, QTOResponse, ModelUploadResponse,
    ProcessResponse, ModelDeleteResponse, HealthResponse, ModelInfo,
    ElementQuantityUpdate, ManualElementInput, BatchElementData, BatchUpdateRequest,
    ElementInputData, QTORequestBody,
    Job, JobStatusResponse, JobAcceptedResponse # <<< ADDED Job models
)

# Set up logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Also configure the logger used by the materials parser if it's separate
logging.getLogger("ifc_materials_parser")
logging.getLogger("qto_producer")

# Log ifcopenshell version at startup
logger.info(f"Using ifcopenshell version: {ifcopenshell.version}")
logger.info(f"Python version: {sys.version}")

# Initialize MongoDB connection at startup
mongodb: Optional[MongoDBHelper] = None # Type hint for clarity

async def get_db() -> Database:
    """FastAPI dependency to get the MongoDB database instance."""
    if mongodb is None or mongodb.db is None:
        # This should ideally not happen if startup was successful, but handles edge cases
        logger.error("Database dependency requested, but connection is not available.")
        raise HTTPException(status_code=503, detail="Database service not available.")
    return mongodb.db

def init_mongodb():
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
    docs_url=None,
    redoc_url=None
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
    allow_methods=["*"],
    allow_headers=["*"],
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

def _parse_ifc_data(ifc_file: ifcopenshell.file) -> List[IFCElement]:
    """
    Parses the provided IFC file object and extracts element data.

    Args:
        ifc_file: An opened ifcopenshell file object.

    Returns:
        A list of IFCElement objects containing the parsed data.
    """
    elements = []
    try:
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
                        logger.debug(f"Could not get elements of type {element_type} (likely not in schema {ifc_file.schema}): {str(type_error)}")

        else:
            all_elements = list(ifc_file.by_type("IfcElement"))

        # Process elements
        for element in all_elements: # Use all_elements instead of chunking for simplicity here
            try:
                # Extract basic properties
                # Use the IFC GUID as the primary identifier
                element_global_id = element.GlobalId
                element_type_class = element.is_a()
                element_instance_name = element.Name if hasattr(element, "Name") and element.Name else "Unnamed"
                element_data = {
                    "global_id": element_global_id,
                    "type": element_type_class,
                    "name": element_instance_name,
                    "type_name": None,
                    "description": element.Description if hasattr(element, "Description") and element.Description else None,
                    "properties": {},
                    # Use nested structure for classification
                    "classification": None, # <<< ADDED: For nested object
                    "area": 0.0,
                    "volume": None, # Will be populated by get_volume_from_properties
                    "length": 0.0,
                    "original_area": 0.0,
                    "original_volume": None,
                    "original_length": 0.0,
                    "status": "pending",
                    "is_manual": False # <<< ADDED: Mark parsed elements as NOT manual
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

                # --- Create Nested Classification Object --- <<< RE-ADDED >>>
                # Pop the temporary flat fields and create the nested object if data exists
                c_id = element_data.pop("classification_id", None)
                c_name = element_data.pop("classification_name", None)
                c_system = element_data.pop("classification_system", None)
                if c_id or c_name or c_system:
                    element_data["classification"] = {
                        "id": c_id,
                        "name": c_name,
                        "system": c_system
                    }
                # else: element_data["classification"] remains None (as initialized)

                # --- Get Element's Total Volume ---
                element_volume_dict = get_volume_from_properties(element)
                element_total_volume = None
                if element_volume_dict:
                    # Prefer net volume, fall back to gross volume
                    element_total_volume = element_volume_dict.get("net")
                    if element_total_volume is None:
                        element_total_volume = element_volume_dict.get("gross")

                # Assign the extracted TOTAL volume to element_data["volume"]
                element_data["volume"] = element_total_volume
                element_data["original_volume"] = element_total_volume # Store original total volume


                # --- Parse Materials (Name and Fraction) ---
                # This function should return a list of dicts like [{'name': '...', 'fraction': 0.x}]
                parsed_materials_list = parse_element_materials(element, ifc_file)

                # --- Calculate and Add Volume to Each Material --- <<< MODIFIED SECTION >>>
                materials_with_volume = []
                if isinstance(parsed_materials_list, list) and element_total_volume is not None and element_total_volume > 0:
                    for mat_data in parsed_materials_list:
                        if isinstance(mat_data, dict) and 'name' in mat_data and 'fraction' in mat_data:
                            try:
                                fraction = float(mat_data['fraction'])
                                if 0 <= fraction <= 1: # Ensure fraction is valid
                                    calculated_volume = element_total_volume * fraction
                                    # Add the calculated volume to the material dict
                                    mat_data['volume'] = _round_value(calculated_volume, 5) # Use rounding helper
                                    # Optionally add default unit if needed by downstream processes
                                    if 'unit' not in mat_data:
                                         mat_data['unit'] = 'm³' # Assuming cubic meters
                                    materials_with_volume.append(mat_data)
                                else:
                                    logger.warning(f"Invalid fraction ({fraction}) for material '{mat_data['name']}' in element {element.id()}. Skipping volume calculation.")
                                    # Append material without volume? Or skip entirely? Appending without volume for now.
                                    mat_data.pop('volume', None) # Ensure no incorrect volume is present
                                    materials_with_volume.append(mat_data)

                            except (ValueError, TypeError) as e:
                                logger.warning(f"Error processing fraction for material '{mat_data.get('name', 'N/A')}' in element {element.id()}: {e}. Skipping volume calc.")
                                mat_data.pop('volume', None)
                                materials_with_volume.append(mat_data)
                        else:
                             logger.warning(f"Skipping invalid material data format during volume calculation: {mat_data}")
                             # Decide if you want to append invalid entries without volume
                             if isinstance(mat_data, dict):
                                 mat_data.pop('volume', None)
                                 materials_with_volume.append(mat_data)
                elif isinstance(parsed_materials_list, list):
                     # If element total volume is missing/zero, or list is empty, just add materials without volume
                     logger.debug(f"Element {element.id()} has total volume {element_total_volume} or empty parsed list. Adding materials without calculated volume.")
                     materials_with_volume = [m for m in parsed_materials_list if isinstance(m, dict)] # Keep valid dicts
                     for m in materials_with_volume: m.pop('volume', None) # Ensure no volume key

                # Assign the list (now potentially with volumes) to element_data
                element_data["materials"] = materials_with_volume
                # <<< END MODIFIED SECTION >>>

                # Log the final materials list for this element for debugging
                logger.debug(f"Element ID {element.id()} Final Materials for DB: {element_data.get('materials')}")

                # Append the complete element data using the Pydantic model
                elements.append(IFCElement(**element_data))

            except Exception as prop_error:
                logger.error(f"Error processing element {element.id()}: {str(prop_error)}")
                logger.error(traceback.format_exc()) # Log full traceback for element errors


        # Log summary statistics
        elements_with_area = [e for e in elements if hasattr(e, "area") and e.area and e.area > 0]
        elements_with_materials = [e for e in elements if hasattr(e, "materials") and e.materials]

        return elements

    except Exception as e:
        logger.error(f"Error parsing IFC file: {str(e)}")
        logger.error(traceback.format_exc())
        # Decide how to handle parsing errors: return empty list or raise?
        # Returning empty list for now to avoid breaking the flow, but log indicates failure.
        return []

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

# <<< ADDED: Background task function for IFC processing >>>
def process_ifc_file_in_background(
    job_id: str,
    temp_file_path: str,
    original_filename: str,
    project_name: str,
    upload_timestamp_str: str # Pass as string, convert inside
):
    """The actual long-running IFC processing logic to be run in the background."""
    ifc_file_obj = None # For proper cleanup if ifcopenshell.open fails
    try:
        logger.info(f"[Job: {job_id}] Background processing started for {original_filename}")
        if mongodb is None or mongodb.db is None:
            logger.error(f"[Job: {job_id}] MongoDB not available. Aborting background task.")
            # No easy way to update job status if DB is down at this point
            return

        mongodb.update_ifc_processing_job_status(job_id, status="processing")

        # --- Open IFC File ---
        try:
            ifc_file_obj = ifcopenshell.open(temp_file_path)
            logger.info(f"[Job: {job_id}] IFC file opened successfully with schema: {ifc_file_obj.schema}")
        except Exception as ifc_error:
            logger.error(f"[Job: {job_id}] Error opening IFC file {temp_file_path}: {ifc_error}")
            mongodb.update_ifc_processing_job_status(job_id, status="failed", error_message=f"Error opening IFC: {str(ifc_error)}")
            return

        # --- Parse IFC Data ---
        parsed_elements_models: List[IFCElement] = _parse_ifc_data(ifc_file_obj) # _parse_ifc_data returns list of Pydantic models
        logger.info(f"[Job: {job_id}] Finished parsing. Found {len(parsed_elements_models)} elements.")

        if not parsed_elements_models:
            logger.warning(f"[Job: {job_id}] Parsing completed, but no elements were extracted from {original_filename}.")

        # --- Convert Pydantic models to dicts for saving to MongoDB ---
        element_dicts_for_db = []
        for elem_model in parsed_elements_models:
            try:
                element_dicts_for_db.append(elem_model.model_dump(exclude_none=True))
            except AttributeError:
                element_dicts_for_db.append(elem_model.dict(exclude_none=True)) # Fallback for older Pydantic
            except Exception as dump_error:
                logger.error(f"[Job: {job_id}] Error converting element {getattr(elem_model, 'id', '?')} to dict: {dump_error}")

        # --- Save Parsed Data to MongoDB (Elements Collection) ---
        # 1. Find or create the project and get its ID
        project_data_for_db = {
            "name": project_name,
            "metadata": { 
                "filename": original_filename,
                "upload_timestamp": upload_timestamp_str # Use the original upload timestamp string
            }
        }
        project_db_id = mongodb.save_project(project_data_for_db)

        if not project_db_id:
            err_msg = f"Failed to find or create project '{project_name}' in MongoDB."
            logger.error(f"[Job: {job_id}] {err_msg}")
            mongodb.update_ifc_processing_job_status(job_id, status="failed", error_message=err_msg)
            return

        # 2. Replace elements in the elements collection
        replace_result = mongodb.replace_project_elements(project_id=project_db_id, elements_data=element_dicts_for_db)

        if not replace_result.get("success"):
            err_msg = f"Failed to replace elements for project '{project_name}'. Details: {replace_result.get('message')}"
            logger.error(f"[Job: {job_id}] {err_msg}")
            mongodb.update_ifc_processing_job_status(job_id, status="failed", error_message=err_msg)
            return
        
        logger.info(f"[Job: {job_id}] Successfully replaced elements. Inserted: {replace_result.get('inserted_count', 0)}")
        mongodb.update_ifc_processing_job_status(job_id, status="completed", element_count=len(parsed_elements_models))
        logger.info(f"[Job: {job_id}] Background processing for {original_filename} completed successfully.")

    except Exception as e:
        logger.error(f"[Job: {job_id}] Unexpected error in background task for {original_filename}: {str(e)}")
        logger.error(traceback.format_exc())
        if mongodb and job_id: # Check if mongodb and job_id are available
            mongodb.update_ifc_processing_job_status(job_id, status="failed", error_message=f"Unexpected background error: {str(e)}")
    finally:
        # --- Clean up temporary file ---
        if ifc_file_obj:
             del ifc_file_obj # Remove reference to potentially release file lock before unlinking
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.unlink(temp_file_path)
                logger.info(f"[Job: {job_id}] Cleaned up temporary file: {temp_file_path}")
            except Exception as cleanup_error:
                logger.error(f"[Job: {job_id}] Error removing temp file during background task cleanup: {str(cleanup_error)}")
# <<< END ADDED: Background task function >>>


@app.post("/upload-ifc/", response_model=JobAcceptedResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_ifc(
    background_tasks: BackgroundTasks, # <<< MOVED to be first and fixed
    file: UploadFile = File(...),
    project: str = Form(...),
    filename: str = Form(...),
    timestamp: str = Form(...)
):
    logger.info(f"Received file upload request for project '{project}', filename '{filename}'")

    if not filename.lower().endswith('.ifc'): # Use filename from Form, not file.filename
        raise HTTPException(status_code=400, detail="Only IFC files are supported based on provided filename form field")

    # --- Staging File --- Staging directory for uploaded files before background processing
    # Should be a persistent volume if background workers are separate processes/machines.
    # For BackgroundTasks, a local temp directory can work if it persists long enough.
    # Using a more persistent staging approach for robustness:
    staging_dir = os.path.join(os.getcwd(), "ifc_staging") 
    os.makedirs(staging_dir, exist_ok=True)
    if not os.access(staging_dir, os.W_OK):
        logger.error(f"Staging directory {staging_dir} not writable.")
        raise HTTPException(status_code=500, detail="Server configuration error: Staging directory not writable")

    # Sanitize filename to prevent path traversal
    safe_filename = Path(filename).name
    file_id_in_staging = str(uuid.uuid4()) # Unique ID for the staged file
    staged_file_path = os.path.join(staging_dir, f"{file_id_in_staging}_{safe_filename}")

    try:
        # Stream file to disk to avoid loading entire file into memory
        with open(staged_file_path, 'wb') as out_file:
            bytes_written = 0
            while chunk := await file.read(4 * 1024 * 1024):  # Read in 4MB chunks
                out_file.write(chunk)
                bytes_written += len(chunk)
        
        if bytes_written == 0:
            # Clean up empty file if it was created
            if os.path.exists(staged_file_path):
                try: os.unlink(staged_file_path)
                except Exception as e_unlink:
                    logger.warning(f"Could not clean up empty staged file {staged_file_path}: {e_unlink}")
            raise HTTPException(status_code=400, detail="Uploaded file is empty or failed to write any content.")

        logger.info(f"File '{safe_filename}' for project '{project}' staged at: {staged_file_path}, size: {bytes_written} bytes")

    except HTTPException: # Re-raise HTTPExceptions directly
        raise
    except Exception as e:
        logger.error(f"Error staging uploaded file {safe_filename}: {e}", exc_info=True)
        # Clean up partially written or problematic file
        if os.path.exists(staged_file_path):
            try: os.unlink(staged_file_path)
            except Exception as e_unlink_err:
                 logger.warning(f"Could not clean up partially staged file {staged_file_path} after error: {e_unlink_err}")
        raise HTTPException(status_code=500, detail=f"Failed to stage uploaded file: {e}")
    finally:
        await file.close() # Ensure file is closed

    # --- Create Job in MongoDB ---
    if mongodb is None or mongodb.db is None:
        logger.error("MongoDB not available. Cannot create processing job.")
        # Cleanup staged file if job creation fails before background task is added
        if os.path.exists(staged_file_path): 
            try: os.unlink(staged_file_path)
            except: pass
        raise HTTPException(status_code=503, detail="Database service unavailable, cannot queue file for processing.")

    upload_dt_object = None
    try:
        # Attempt to parse the timestamp string into a datetime object
        # Ensure it's timezone-aware if necessary, or store as naive UTC if that's the convention.
        # For simplicity, assuming it might be ISO format from qto-ifc-msg
        upload_dt_object = datetime.fromisoformat(timestamp.replace("Z", "+00:00")) if timestamp else datetime.now(timezone.utc)
    except ValueError:
        logger.warning(f"Could not parse provided timestamp '{timestamp}', using current time.")
        upload_dt_object = datetime.now(timezone.utc)

    job_payload = {
        "filename": filename, 
        "project_name": project,
        "file_id_in_staging": staged_file_path, # Store the path to the staged file
        "upload_timestamp": upload_dt_object
    }
    job_id = mongodb.create_ifc_processing_job(job_payload)

    if not job_id:
        logger.error("Failed to create IFC processing job in database.")
        # Cleanup staged file if job creation fails before background task is added
        if os.path.exists(staged_file_path): 
            try: os.unlink(staged_file_path)
            except: pass
        raise HTTPException(status_code=500, detail="Failed to queue file for processing.")

    # --- Add to BackgroundTasks ---
    background_tasks.add_task(
        process_ifc_file_in_background,
        job_id=job_id,
        temp_file_path=staged_file_path, # Pass the staged file path
        original_filename=filename,
        project_name=project,
        upload_timestamp_str=timestamp # Pass original string timestamp
    )

    logger.info(f"Job {job_id} for file '{filename}' added to background tasks.")

    status_url = f"/ifc-jobs/{job_id}" # Example status URL
    return JobAcceptedResponse(
        message="IFC file received and queued for processing.",
        job_id=job_id,
        status_endpoint=status_url
    )

# <<< ADDED: Endpoint to get job status >>>
@app.get("/ifc-jobs/{job_id_str}", response_model=JobStatusResponse)
async def get_ifc_job_status(job_id_str: str, db: Database = Depends(get_db)):
    if mongodb is None: # Check global mongodb helper instance
        raise HTTPException(status_code=503, detail="Database service not available.")
    
    job_doc = mongodb.get_ifc_processing_job(job_id_str)
    if not job_doc:
        raise HTTPException(status_code=404, detail=f"Job {job_id_str} not found.")
    
    # Convert to Pydantic model for response validation and serialization
    # Ensure all fields required by JobStatusResponse are present or have defaults
    response_data = {
        "job_id": job_doc.get("id", job_doc.get("_id")), # Use 'id' or fallback to '_id'
        "status": job_doc.get("status", "unknown"),
        "filename": job_doc.get("filename", "N/A"),
        "project_name": job_doc.get("project_name", "N/A"),
        "created_at": job_doc.get("created_at", datetime.min.replace(tzinfo=timezone.utc)),
        "updated_at": job_doc.get("updated_at", datetime.min.replace(tzinfo=timezone.utc)),
        "element_count": job_doc.get("element_count"),
        "error_message": job_doc.get("error_message")
    }
    return JobStatusResponse(**response_data)
# <<< END ADDED >>>

@app.get("/projects/", response_model=List[str])
async def list_projects(db: Database = Depends(get_db)): # <<< Inject DB
    """Returns a list of available project names from the parsed data."""
    try:
        # Use the injected db object
        collection = db.projects
        distinct_projects = collection.distinct("name")
        return distinct_projects
    except Exception as e:
        logger.error(f"Error listing projects from DB: {e}")
        raise HTTPException(status_code=500, detail="Error retrieving project list")

@app.get("/projects/{project_name}/elements/", response_model=List[IFCElement])
async def get_project_elements(project_name: str, db: Database = Depends(get_db)): # <<< Inject DB
    """Retrieves element data for a given project name directly from the elements collection."""
    try:
        # 1. Fetch Project ID using injected db
        project = db.projects.find_one({"name": {"$regex": f"^{re.escape(project_name)}$", "$options": "i"}})
        if not project:
            raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found")
        project_id = project["_id"]

        # 2. Fetch Raw Element Data from DB using injected db
        elements_cursor = db.elements.find({"project_id": project_id})
        elements_data = list(elements_cursor)

        if not elements_data:
             return []

        adapted_elements = []
        for elem in elements_data:
            # Convert ObjectId to string
            if "_id" in elem: elem["_id"] = str(elem["_id"])
            if "project_id" in elem: elem["project_id"] = str(elem["project_id"])

            # Initial mapping from DB fields to response model fields
            mapped_elem = {
                "id": elem.get("global_id"),
                "global_id": elem.get("global_id"),
                "type": elem.get("ifc_class", "Unknown"),
                "name": elem.get("name", "Unnamed"),
                "type_name": elem.get("type_name"),
                "description": elem.get("description"),
                "properties": elem.get("properties", {}),
                "material_volumes": elem.get("material_volumes"), # Keep for potential older data
                "materials": elem.get("materials", []),
                "level": elem.get("level"),
                "status": elem.get("status", "pending"),
                "is_manual": elem.get("is_manual", False),
                "is_structural": elem.get("is_structural"), # Map structural
                "is_external": elem.get("is_external"),   # Map external
                "ebkph": elem.get("ebkph"),               # Map ebkph
                "category": elem.get("category"),         # Map category
                # Raw quantities from DB (used to build nested objects)
                "area": elem.get("area"),
                "length": elem.get("length"),
                "volume": elem.get("volume"),
                "original_area": elem.get("original_area"),
                "original_length": elem.get("original_length"),
                "original_volume": elem.get("original_volume"),
                # Placeholders for nested objects
                "quantity": None,
                "original_quantity": None,
                "classification": None,
                "classification_id": None,      # <<< Keep flat fields for Pydantic model if needed
                "classification_name": None,
                "classification_system": None,
            }

            # --- Build Nested Classification Object ---
            db_classification = elem.get("classification")
            if isinstance(db_classification, dict):
                 # Populate flat fields (might be redundant if only nested is used)
                 mapped_elem["classification_id"] = db_classification.get("id")
                 mapped_elem["classification_name"] = db_classification.get("name")
                 mapped_elem["classification_system"] = db_classification.get("system")
                 # Create nested object
                 mapped_elem["classification"] = {
                     "id": db_classification.get("id"),
                     "name": db_classification.get("name"),
                     "system": db_classification.get("system"),
                 }
            else:
                 # Fallback if classification is not a dict (or handle differently)
                 logger.debug(f"Classification field for element {mapped_elem['id']} is not a dictionary: {db_classification}")


            # --- Build Nested Quantity Objects ---
            db_quantity = elem.get("quantity")
            db_original_quantity = elem.get("original_quantity")

            # Build ALL available quantities for user selection
            available_quantities = []
            
            # Add all non-zero quantities from flat fields
            if mapped_elem["area"] is not None and mapped_elem["area"] > 0:
                available_quantities.append({
                    "value": mapped_elem["area"],
                    "type": "area",
                    "unit": "m²",
                    "label": "Area"
                })
            
            if mapped_elem["length"] is not None and mapped_elem["length"] > 0:
                available_quantities.append({
                    "value": mapped_elem["length"],
                    "type": "length", 
                    "unit": "m",
                    "label": "Length"
                })
                
            if mapped_elem["volume"] is not None and mapped_elem["volume"] > 0:
                available_quantities.append({
                    "value": mapped_elem["volume"],
                    "type": "volume",
                    "unit": "m³", 
                    "label": "Volume"
                })

            # Add count if element exists (always 1 for individual elements)
            available_quantities.append({
                "value": 1,
                "type": "count",
                "unit": "Stk",
                "label": "Count"
            })

            mapped_elem["available_quantities"] = available_quantities

            # Current Quantity (determine default/primary quantity)
            if isinstance(db_quantity, dict) and db_quantity.get("value") is not None:
                mapped_elem["quantity"] = {
                    "value": db_quantity.get("value"),
                    "type": db_quantity.get("type"),
                    "unit": db_quantity.get("unit")
                }
                # Also populate flat fields if they exist in the model definition
                if db_quantity.get("type") == "area": mapped_elem["area"] = db_quantity.get("value")
                if db_quantity.get("type") == "length": mapped_elem["length"] = db_quantity.get("value")
                if db_quantity.get("type") == "volume": mapped_elem["volume"] = db_quantity.get("value")
            else:
                # Fallback: try to build from flat fields using TARGET_QUANTITIES logic
                element_type = mapped_elem.get("type", "Unknown")
                q_type = None
                q_value = None
                q_unit = None
                
                # Check TARGET_QUANTITIES config to determine preferred quantity type
                if element_type in TARGET_QUANTITIES:
                    config = TARGET_QUANTITIES[element_type]
                    # Prioritize the configured quantity type for this element
                    if "length" in config and mapped_elem["length"] is not None and mapped_elem["length"] > 0:
                        q_type = "length"
                        q_value = mapped_elem["length"]
                        q_unit = "m"
                    elif "area" in config and mapped_elem["area"] is not None and mapped_elem["area"] > 0:
                        q_type = "area"
                        q_value = mapped_elem["area"]
                        q_unit = "m²"
                    elif "volume" in config and mapped_elem["volume"] is not None and mapped_elem["volume"] > 0:
                        q_type = "volume"
                        q_value = mapped_elem["volume"]
                        q_unit = "m³"
                
                # If no TARGET_QUANTITIES config or no matching quantity found, use fallback order
                if q_type is None:
                    if mapped_elem["area"] is not None and mapped_elem["area"] > 0:
                        q_type = "area"
                        q_value = mapped_elem["area"]
                        q_unit = "m²"
                    elif mapped_elem["length"] is not None and mapped_elem["length"] > 0:
                        q_type = "length"
                        q_value = mapped_elem["length"]
                        q_unit = "m"
                    elif mapped_elem["volume"] is not None and mapped_elem["volume"] > 0:
                        q_type = "volume"
                        q_value = mapped_elem["volume"]
                        q_unit = "m³"

                if q_type and q_value is not None:
                    mapped_elem["quantity"] = {"value": q_value, "type": q_type, "unit": q_unit}


            # Original Quantity
            if isinstance(db_original_quantity, dict) and db_original_quantity.get("value") is not None:
                mapped_elem["original_quantity"] = {
                    "value": db_original_quantity.get("value"),
                    "type": db_original_quantity.get("type"),
                    "unit": db_original_quantity.get("unit")
                }
                # Also populate flat fields if they exist in the model definition
                if db_original_quantity.get("type") == "area": mapped_elem["original_area"] = db_original_quantity.get("value")
                if db_original_quantity.get("type") == "length": mapped_elem["original_length"] = db_original_quantity.get("value")
                if db_original_quantity.get("type") == "volume": mapped_elem["original_volume"] = db_original_quantity.get("value")
            else:
                # Fallback: try to build from flat original fields
                oq_type = None
                oq_value = None
                oq_unit = None
                if mapped_elem["original_area"] is not None:
                    oq_type = "area"
                    oq_value = mapped_elem["original_area"]
                    oq_unit = "m²"
                elif mapped_elem["original_length"] is not None:
                    oq_type = "length"
                    oq_value = mapped_elem["original_length"]
                    oq_unit = "m"
                elif mapped_elem["original_volume"] is not None:
                    oq_type = "volume"
                    oq_value = mapped_elem["original_volume"]
                    oq_unit = "m³"

                if oq_type and oq_value is not None:
                    mapped_elem["original_quantity"] = {"value": oq_value, "type": oq_type, "unit": oq_unit}


            adapted_elements.append(mapped_elem)

        elements_data = adapted_elements

        # Validate and convert data to IFCElement models
        validated_elements = []
        validation_errors = 0

        for i, elem_data in enumerate(elements_data):
            try:
                # Ensure required fields have defaults if missing before validation
                # (Already done partially above, but double-check key ones)
                if not elem_data.get("id"): elem_data["id"] = f"missing-id-{i}"
                if not elem_data.get("type"): elem_data["type"] = "Unknown"
                if not elem_data.get("name"): elem_data["name"] = f"Unnamed-{i}"
                if "properties" not in elem_data or elem_data["properties"] is None: elem_data["properties"] = {}
                if "materials" not in elem_data or elem_data["materials"] is None: elem_data["materials"] = []
                if "is_manual" not in elem_data: elem_data["is_manual"] = False

                element_model = IFCElement(**elem_data)
                validated_elements.append(element_model)
            except Exception as validation_error:
                validation_errors += 1

        return validated_elements

    except HTTPException as http_exc:
        logger.warning(f"HTTPException occurred for project '{project_name}': {http_exc.status_code} - {http_exc.detail}")
        raise http_exc
    except Exception as e:
        logger.error(f"Unexpected error retrieving elements for project '{project_name}': {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error retrieving project elements: {str(e)}")

@app.get("/projects/{project_name}/metadata/", response_model=Dict[str, Any])
async def get_project_metadata(project_name: str, db: Database = Depends(get_db)): # <<< Inject DB
    """Retrieves metadata for a specific project."""
    try:
        # Find project (case-insensitive) using injected db
        project = db.projects.find_one({"name": {"$regex": f"^{re.escape(project_name)}$", "$options": "i"}})
        if not project:
            raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found")

        project_id = project["_id"]

        # Get element count from the elements collection for this project_id using injected db
        element_count = db.elements.count_documents({"project_id": project_id})

        # Extract metadata, handling potential missing fields
        metadata = project.get("metadata", {})
        response_data = {
            "filename": metadata.get("filename"),
            "file_id": metadata.get("file_id"),
            "created_at": project.get("created_at"),
            "updated_at": project.get("updated_at"),
            "element_count": element_count # Include the count
        }
        return response_data

    except HTTPException as http_exc:
        logger.warning(f"HTTPException getting metadata for '{project_name}': {http_exc.status_code} - {http_exc.detail}")
        raise http_exc
    except Exception as e:
        logger.error(f"Error retrieving metadata for project '{project_name}': {e}")
        raise HTTPException(status_code=500, detail="Internal server error retrieving project metadata")

@app.post("/projects/{project_name}/approve/", response_model=Dict[str, Any])
async def approve_project(
    project_name: str,
    updates: Optional[List[ElementQuantityUpdate]] = None, # <<< ACCEPT updates in body
    db: Database = Depends(get_db) # <<< Inject DB
):
    """
    Updates element quantities based on provided edits AND approves the project's elements
    by updating their status to 'active'.

    Args:
        project_name: Name of the project to approve
        updates: Optional list of elements with their new quantities.

    Returns:
        Dictionary with operation status
    """
    # global mongodb # No longer needed
    try:
        logger.info(f"Received approval request for project: '{project_name}'")
        if updates:
            logger.info(f"Approval request includes {len(updates)} quantity updates.")

        # <<< REMOVED Check/Re-initialize MongoDB Connection block >>>

        # --- Find Project ID (needed for both update and approve) ---
        # Use injected db
        project = db.projects.find_one({"name": {"$regex": f"^{re.escape(project_name)}$", "$options": "i"}})
        if not project:
            raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found")
        project_id = project["_id"]

        # --- Apply Quantity Updates (if any) --- 
        if updates:
            # !!! IMPORTANT: Need to pass the db instance to the helper method if it uses it !!!
            # Assuming MongoDBHelper methods accept a db instance or continue using the global one internally
            # For now, assuming internal usage of the global `mongodb` is okay within the helper methods,
            # otherwise, the helper methods would need refactoring too.
            # Let's stick to the current approach for now, but this is a potential point of failure/refinement.
            update_success = mongodb.update_element_quantities(project_id, updates) # Still uses global mongodb instance
            if not update_success:
                 logger.error(f"Failed to apply quantity updates for project '{project_name}'. Aborting approval.")
                 raise HTTPException(status_code=500, detail="Failed to save quantity updates.")

        # --- Approve Project Status & Send Kafka Notification --- 
        logger.info(f"Calling approve_project_elements for project ID: {project_id}")
        # Assuming internal usage of the global `mongodb` is okay within the helper methods
        approve_success = mongodb.approve_project_elements(project_id)

        if approve_success:
            return {
                "status": "success",
                "message": f"Project {project_name} elements updated and approved successfully",
                "project": project_name
            }
        else:
            logger.error(f"Applied quantity updates BUT failed to approve elements status for project '{project_name}'")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to finalize approval status update for project {project_name}"
            )
    except HTTPException as http_exc:
        logger.error(f"HTTP error during approval/update for {project_name}: {http_exc.detail}")
        raise http_exc # Re-raise HTTPException
    except Exception as e:
        logger.error(f"Error processing approval/update for project {project_name}: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"Error processing approval/update: {str(e)}"
        )

@app.get("/health", response_model=HealthResponse)
def health_check(request: Request):
    """
    Health check endpoint for monitoring service status
    
    Returns the status of the service, Kafka connection, and other diagnostics.
    """
    kafka_status = "unknown" # Set default status as producer check is removed
    mongodb_status = "unknown"
    origin = request.headers.get("origin")
    allowed = origin in cors_origins if cors_origins != ["*"] else True

    # Determine MongoDB status
    try:
        if mongodb is not None and mongodb.db is not None:
            mongodb.db.command('ping')
            mongodb_status = "connected"
        else:
            mongodb_status = "disconnected"
    except Exception as e:
        logger.warning(f"MongoDB health check failed: {str(e)}")
        mongodb_status = "disconnected"
    
    # Prepare response data
    response_data = {
        "status": "healthy", 
        "kafka": kafka_status,
        "mongodb": mongodb_status,
        "ifcopenshell_version": ifcopenshell.version
    }

    # Manually add CORS headers to the response
    headers = {}
    if allowed:
        headers["Access-Control-Allow-Origin"] = origin if origin else "*"
        headers["Access-Control-Allow-Credentials"] = "true"
        # Add other standard CORS headers for completeness
        headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, PUT, DELETE, HEAD"
        headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With"

    logger.info(f"Health check request from origin: {origin}. Allowed: {allowed}. Responding with headers: {headers}")

    # Return JSONResponse with manual headers
    return JSONResponse(content=response_data, headers=headers)

# <<< ADDED: Endpoint for Creating Manual Elements >>>
@app.post("/projects/{project_name}/elements/manual", response_model=IFCElement)
async def add_manual_element(project_name: str, element_data: ManualElementInput, db: Database = Depends(get_db)): # <<< Inject DB
    """Adds a new manually defined element to a project."""
    try:
        # 1. Find Project ID using injected db
        project = db.projects.find_one({"name": {"$regex": f"^{re.escape(project_name)}$", "$options": "i"}})
        if not project:
            raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found")
        project_id = project["_id"]

        # 2. Validate Material Fractions (Sum should be close to 1 if materials exist)
        if element_data.materials:
            total_fraction = sum(mat.fraction for mat in element_data.materials)
            if abs(total_fraction - 1.0) > 1e-6:
                raise HTTPException(status_code=400, detail=f"Material fractions must sum to 1 (100%). Current sum: {total_fraction:.4f}")

        # 3. Prepare Element Data for DB
        manual_id = f"manual_{uuid.uuid4()}"
        now = datetime.now(timezone.utc)

        # Map ManualMaterialInput to the expected format in DB
        db_materials = [
            {
                "name": mat.name,
                "fraction": _round_value(mat.fraction, 5),
                # Volume is not directly provided for manual, calculate if needed based on total?
                # For now, omit volume unless calculable or provided differently.
                "unit": element_data.quantity.unit # Assuming material unit relates to quantity unit for now
            } for mat in element_data.materials
        ]

        element_to_save = {
            "project_id": project_id,
            "global_id": f"MANUAL-{manual_id}", # Create a pseudo GlobalId
            "ifc_class": element_data.type,
            "name": element_data.name,
            "type_name": element_data.name, # Use name as type_name for manual
            "level": element_data.level,
            "description": element_data.description,
            "quantity": {
                "value": _round_value(element_data.quantity.value, 5),
                "type": element_data.quantity.type,
                "unit": element_data.quantity.unit
            },
            # For manual elements, original quantity is the same as initial quantity
            "original_quantity": {
                "value": _round_value(element_data.quantity.value, 5),
                "type": element_data.quantity.type,
                "unit": element_data.quantity.unit
            },
            # Default structural/external to False or based on type?
            "is_structural": False,
            "is_external": False,
            "classification": element_data.classification.model_dump(exclude_none=True) if element_data.classification else None,
            "materials": db_materials,
            "properties": {}, # Manual elements might not have IFC properties
            "status": "active", # Manual elements are considered active immediately
            "is_manual": True, # Mark as manual
            "created_at": now,
            "updated_at": now
        }

        # 4. Save Element using insert_one directly on injected db
        insert_result = db.elements.insert_one(element_to_save)
        if not insert_result.inserted_id:
            raise HTTPException(status_code=500, detail="Failed to save manual element to database.")
        
        # 5. Fetch and return (using the prepared dict, no DB fetch needed here)
        # Map back to IFCElement (using the data we just prepared/inserted)
        created_element_data = element_to_save.copy() # Start with the data we inserted
        created_element_data["_id"] = insert_result.inserted_id # Use the actual inserted ID

        # Simplified mapping for response (adapt as needed based on IFCElement model)
        mapped_elem = {
            "id": created_element_data.get("global_id"), 
            "global_id": created_element_data.get("global_id"),
            "type": created_element_data.get("ifc_class"),
            "name": created_element_data.get("name"),
            "type_name": created_element_data.get("type_name"),
            "description": created_element_data.get("description"),
            "properties": created_element_data.get("properties", {}),
            "materials": created_element_data.get("materials", []), 
            "level": created_element_data.get("level"),
            "classification": created_element_data.get("classification"), # Pass the nested object
            "quantity": created_element_data.get("quantity"),             # Pass the nested object
            "original_quantity": created_element_data.get("original_quantity"), # Pass the nested object
            "status": created_element_data.get("status"),
            "is_manual": created_element_data.get("is_manual")
            # Add flat quantity fields if IFCElement still requires them
            # "area": ..., "length": ..., etc.
        }

        # Validate and return using the IFCElement model
        return IFCElement(**mapped_elem)

    except HTTPException as http_exc:
        logger.error(f"HTTP error adding manual element to {project_name}: {http_exc.detail}")
        raise http_exc
    except Exception as e:
        logger.error(f"Error adding manual element to project {project_name}: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal server error adding manual element: {str(e)}")

@app.post("/projects/{project_name}/elements/batch-update", status_code=status.HTTP_200_OK)
async def batch_update_elements(project_name: str, request_data: BatchUpdateRequest, db: Database = Depends(get_db)): # <<< Inject DB
    # mongodb = MongoDBHelper() # Don't create a new instance
    try:
        # Find project using injected db
        project = db.projects.find_one({"name": {"$regex": f"^{re.escape(project_name)}$", "$options": "i"}})
        if not project:
            raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found")
        project_id = project["_id"]

        # Convert Pydantic models to dictionaries for MongoDBHelper
        elements_dict_list = [element.model_dump(exclude_unset=True) for element in request_data.elements]

        # Perform the batch upsert using MongoDBHelper
        # Call the RENAMED function for handling manual updates/creates
        result = mongodb.batch_upsert_manual_elements(project_id, elements_dict_list)

        if result.get("success"):
            logger.info(
                f"Batch update (manual) DB operation successful for project {project_name}. "
                f"Requested: {len(request_data.elements)}, DB Processed: {result.get('processed', 0)}, "
                f"Created/Updated: {result.get('created_or_updated', 0)}" # Changed log field
            )
            # Fetch the updated/created elements using injected db
            # Fetch based on the provided IDs in the request, or upserted IDs from response
            upserted_ids = result.get("upserted_ids", []) # List of string ObjectIDs for *created* docs
            request_global_ids = [elem.get('global_id') or elem.get('id') for elem in elements_dict_list] # Get all global_ids from request

            # Find filter needs adjustment: Find by global_id from request OR _id from upserted_ids
            query_filter = {"project_id": project_id, "$or": []}

            # Add condition for upserted (created) documents by _id
            if upserted_ids:
                try:
                    upserted_object_ids = [ObjectId(oid_str) for oid_str in upserted_ids]
                    if upserted_object_ids:
                         query_filter["$or"].append({"_id": {"$in": upserted_object_ids}})
                except Exception as oid_err:
                    logger.warning(f"Could not convert upserted string IDs to ObjectIds: {oid_err}")

            # Add condition for potentially updated documents by global_id (excluding those just created)
            # Use all request IDs for simplicity, as finding *only* updated ones is complex
            if request_global_ids:
                 query_filter["$or"].append({"global_id": {"$in": request_global_ids}})

            updated_elements = []
            if query_filter["$or"]:
                 # Avoid adding empty $or condition
                 if query_filter["$or"]:
                      updated_elements_cursor = db.elements.find(query_filter)
                      updated_elements = list(updated_elements_cursor)
                 else:
                      logger.info("No valid IDs found to fetch after batch update (manual).")
            else:
                 logger.info("No conditions generated to fetch elements after batch update (manual).")

            # Map DB response to Pydantic (similar to get_project_elements)
            response_elements = []
            for elem in updated_elements:
                try:
                    # Simplified mapping - copy relevant fields
                    mapped_resp_elem = {
                        "id": elem.get("global_id"),
                        "global_id": elem.get("global_id"),
                        "type": elem.get("ifc_class"),
                        "name": elem.get("name"),
                        "level": elem.get("level"),
                        "status": elem.get("status"),
                        "is_manual": elem.get("is_manual"),
                        "quantity": elem.get("quantity"),
                        "classification": elem.get("classification")
                        # Add other fields as needed by BatchElementData or response model
                    }
                    # Validate against BatchElementData if needed, or directly add dict
                    response_elements.append(BatchElementData(**mapped_resp_elem)) # Assuming BatchElementData is the target
                except Exception as map_error:
                     logger.warning(f"Failed to map element {elem.get('ifc_id')} for batch response: {map_error}")

            return {"message": "Batch update successful", **result, "elements": response_elements} # Include mapped elements
        else:
            # Handle DB operation failure
            error_message = result.get("message", "Unknown error during batch update")
            logger.error(f"HTTP error during batch update for {project_name}: {error_message}")
            raise HTTPException(status_code=500, detail=error_message)

    except HTTPException as http_exc:
        # Re-raise HTTPExceptions (like 404)
        raise http_exc
    except Exception as e:
        # Catch Pydantic validation errors (which are VAEs) and other exceptions
        logger.error(f"Error processing batch update for project {project_name}: {e}", exc_info=True)
        # Log the full traceback
        # logger.error("Traceback:", exc_info=True) # Already done with exc_info=True
        raise HTTPException(status_code=500, detail=f"Internal server error during batch update: {e}")

@app.delete("/projects/{project_name}/elements/{element_id}", status_code=status.HTTP_200_OK)
async def delete_element_endpoint(project_name: str, element_id: str, db: Database = Depends(get_db)): # <<< Inject DB
    # mongodb = MongoDBHelper() # Don't create a new instance
    try:
        # Find project using injected db
        project = db.projects.find_one({"name": {"$regex": f"^{re.escape(project_name)}$", "$options": "i"}})
        if not project:
            raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found")
        project_id = project["_id"]
        logger.info(f"Found project '{project_name}' with ID: {project_id} for element deletion.")

        # Assuming delete_element uses the global mongodb instance internally
        success = mongodb.delete_element(project_id, element_id)

        if success: # delete_element now returns dict, check 'success' key
             return {"message": f"Element {element_id} deleted successfully from project {project_name}"}
        else:
             # If delete_element returned success=False, raise appropriate error
             logger.warning(f"Attempted to delete element {element_id} from {project_name}, but DB operation failed or element not found/not manual.")
             # Use the message from the helper if available
             detail_msg = success.get("message", "Element not found or could not be deleted.")
             status_code = 404 if "not found" in detail_msg.lower() else 400
             if "Only manually added" in detail_msg:
                 status_code = 403 # Forbidden
             raise HTTPException(status_code=status_code, detail=detail_msg)

    except HTTPException as http_exc:
         raise http_exc # Re-raise specific HTTP errors
    except Exception as e:
         logger.error(f"Error deleting element {element_id} from {project_name}: {e}", exc_info=True)
         raise HTTPException(status_code=500, detail=f"Internal server error: {e}")

# <<< ADDED: Endpoint for Deleting a Manual Element (The one that had the syntax error) >>>
@app.delete("/projects/{project_name}/elements/{element_global_id}", response_model=Dict[str, Any])
async def delete_manual_element(project_name: str, element_global_id: str, db: Database = Depends(get_db)): # <<< Inject DB
    """Deletes a specific manually added element from a project."""
    try:
        # 1. Find Project ID using injected db
        project = db.projects.find_one({"name": {"$regex": f"^{re.escape(project_name)}$", "$options": "i"}})
        if not project:
            raise HTTPException(status_code=404, detail=f"Project '{project_name}' not found")
        project_id = project["_id"]

        # 2. Call MongoDB helper to delete the element
        # Assuming delete_element uses the global mongodb instance internally
        result = mongodb.delete_element(project_id, element_global_id)

        if not result.get("success"): # Check success key in result dict
            # Determine appropriate status code based on message
            message = result.get("message", "Failed to delete element.")
            status_code = 404 if "not found" in message.lower() else 400
            if "Only manually added" in message:
                status_code = 403 # Forbidden
            raise HTTPException(status_code=status_code, detail=message)

        # Return success message
        return {
            "status": "success",
            "message": f"Element {element_global_id} deleted successfully from project {project_name}.",
            "deleted_count": result.get('deleted_count', 0)
        }
    except HTTPException as http_exc:
        logger.error(f"HTTP error deleting element {element_global_id} from {project_name}: {http_exc.detail}")
        raise http_exc
    except Exception as e:
        logger.error(f"Error deleting element {element_global_id} from project {project_name}: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal server error during element deletion: {str(e)}")

# <<< ADDED: Endpoint to get target IFC classes >>>
@app.get("/ifc-classes", response_model=List[str])
async def get_ifc_classes():
    """Returns the list of target IFC classes configured in the backend environment."""
    # Ensure TARGET_IFC_CLASSES is accessible here (it should be as it's a global variable)
    if not TARGET_IFC_CLASSES or not TARGET_IFC_CLASSES[0] or TARGET_IFC_CLASSES == ['']:
        logger.warning("TARGET_IFC_CLASSES environment variable not set or empty.")
        return [] # Return empty list if not configured or only contains empty string
    return TARGET_IFC_CLASSES
# <<< END ADDED >>>

if __name__ == "__main__":
    import uvicorn
    logger.info(f"Starting IFC Parser API server with ifcopenshell {ifcopenshell.version}")
    uvicorn.run(app, host="0.0.0.0", port=8000) 