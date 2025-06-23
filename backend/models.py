from pydantic import BaseModel, Field, validator, model_validator
from typing import List, Dict, Any, Optional, Union
from datetime import datetime
from bson import ObjectId

# Basic types (used by others)
class QuantityData(BaseModel):
    value: Optional[float] = None
    type: Optional[str] = None # e.g., 'area', 'volume', 'length'
    unit: Optional[str] = None  # e.g., 'm²', 'm³', 'm'

class ClassificationData(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    system: Optional[str] = None # e.g., 'EBKP-H', 'Uniclass', etc.

class MaterialData(BaseModel):
    name: str
    fraction: Optional[float] = Field(None, ge=0, le=1) # Fraction between 0 and 1
    volume: Optional[float] = Field(None, ge=0) # Volume must be non-negative
    unit: Optional[str] = None # e.g., m³, kg

class ManualQuantityInput(BaseModel):
    value: Optional[float] = None # Make value optional too, in case it's missing
    type: Optional[str] = None    # Make type optional
    unit: Optional[str] = None

class ClassificationNested(BaseModel):
     id: Optional[str] = None
     name: Optional[str] = None
     system: Optional[str] = None

class ManualMaterialInput(BaseModel):
    name: str
    fraction: float = Field(..., ge=0) # Allow 0 fraction
    volume: Optional[float] = None
    unit: Optional[str] = None

class ManualClassificationInput(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    system: Optional[str] = None

# Primary Element Model (used in many responses and internal processing)
class IFCElement(BaseModel):
    """IFC Element data model for API responses and internal use"""
    id: str # This will be the global_id for consistent identification
    global_id: Optional[str] = None
    ifc_class: Optional[str] = Field(None, alias="type") # Map 'type' from DB to 'ifc_class'
    name: Optional[str] = None
    type_name: Optional[str] = None
    description: Optional[str] = None
    properties: Dict[str, Any] = Field(default_factory=dict)
    quantity: Optional[QuantityData] = None # Use the detailed QuantityData
    original_quantity: Optional[QuantityData] = None # Use the detailed QuantityData
    level: Optional[str] = None
    classification: Optional[ClassificationData] = None # Use the detailed ClassificationData
    materials: Optional[List[MaterialData]] = None # Use the detailed MaterialData
    status: Optional[str] = None
    is_manual: Optional[bool] = False
    is_structural: Optional[bool] = None
    is_external: Optional[bool] = None
    created_at: Optional[datetime] = None # Included for potential use
    updated_at: Optional[datetime] = None # Included for potential use
    area: Optional[float] = None # This might be redundant if covered by quantity.value where quantity.type == 'area'
    volume: Optional[float] = None # Redundant if quantity.type == 'volume'
    length: Optional[float] = None # Redundant if quantity.type == 'length'
    original_area: Optional[float] = None # Redundant
    original_volume: Optional[float] = None # Redundant
    original_length: Optional[float] = None # Redundant
    classification_id: Optional[str] = None # Redundant if classification.id is used
    classification_name: Optional[str] = None # Redundant if classification.name is used
    classification_system: Optional[str] = None # Redundant if classification.system is used
    category: Optional[str] = None # Could be derived from ifc_class or a specific property
    material_volumes: Optional[Dict[str, Dict[str, Any]]] = None # Kept for potential backward compatibility? Needs review.
    ebkph: Optional[str] = None # Redundant if classification.id/system covers it

    class Config:
        populate_by_name = True # Allow using 'type' as alias for 'ifc_class'
        json_encoders = {ObjectId: str, datetime: lambda dt: dt.isoformat()} # Ensure ObjectId is serialized as str
        arbitrary_types_allowed = True # Allow ObjectId

# Response Models
class ElementListResponse(BaseModel):
    elements: List[IFCElement]

class BatchUpdateResponse(BaseModel):
    status: str
    message: str
    processed_count: int
    created_count: int
    updated_count: int
    elements: List[IFCElement] # Use the unified IFCElement

class QTOResponse(BaseModel):
    """Response model for QTO operation"""
    message: str
    qto_identifier: str # Renamed again to avoid conflict
    element_count: int
    # kafka_status: str # Removed

class ModelUploadResponse(BaseModel):
    """Response model for model upload"""
    message: str
    upload_identifier: str # Renamed from model_id to avoid conflict
    filename: str
    element_count: int
    entity_types: Dict[str, int]

class ProcessResponse(BaseModel): # Used by /upload-ifc/
    message: str
    project: str
    filename: str
    element_count: int
    # kafka_status: Optional[str] = None

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
    info_identifier: str # Renamed from model_id to avoid conflict
    filename: str
    element_count: int
    entity_counts: Dict[str, int]

# Request Body / Input Models
class ElementQuantityUpdate(BaseModel):
    element_id: str # Should match global_id
    new_quantity: ManualQuantityInput # Use the specific ManualQuantityInput

class ManualElementInput(BaseModel):
    name: str
    type: str # Corresponds to ifc_class
    level: Optional[str] = None
    quantity: ManualQuantityInput # Use the specific ManualQuantityInput
    classification: Optional[ManualClassificationInput] = None
    materials: List[ManualMaterialInput] = Field(default_factory=list)
    description: Optional[str] = None

class BatchElementData(BaseModel):
    # Model for elements within the batch update request
    id: str # Can be IFC GUID, existing DB element _id (as str), or temp 'manual_...' ID
    global_id: Optional[str] = None # Needed for updates/identification
    type: Optional[str] = Field(None, alias="ifc_class") # Corresponds to ifc_class, allow alias
    name: Optional[str] = None
    type_name: Optional[str] = None
    level: Optional[str] = None
    description: Optional[str] = None
    quantity: Optional[QuantityData] = None # Use the detailed QuantityData
    original_quantity: Optional[QuantityData] = None # Use the detailed QuantityData
    classification: Optional[ClassificationData] = None # Use the detailed ClassificationData
    materials: Optional[List[MaterialData]] = None # Use the detailed MaterialData
    properties: Optional[Dict[str, Any]] = None
    is_manual: Optional[bool] = False
    is_structural: Optional[bool] = False
    is_external: Optional[bool] = False
    status: Optional[str] = None # Allow updating status

    class Config:
        populate_by_name = True # Allow alias 'type' for 'ifc_class'
        json_encoders = {ObjectId: str}
        arbitrary_types_allowed = True

    # Add validator to ensure global_id is present for updates if not a new manual element
    @model_validator(mode='before')
    def check_ids_for_update(cls, values):
        id_val = values.get('id')
        global_id_val = values.get('global_id')
        is_manual_val = values.get('is_manual', False) # Default to False if not provided

        # If it's not a new manual element (ID doesn't start with 'manual_')
        # then we need global_id for matching in the DB.
        # Also check if the provided id is a valid ObjectId string if not manual
        is_potential_object_id = ObjectId.is_valid(id_val) if isinstance(id_val, str) else False

        if not (is_manual_val and isinstance(id_val, str) and id_val.startswith('manual_')):
             # If it's an existing element, it should have an ID that's either an ObjectId string or a Global ID
            if not (is_potential_object_id or global_id_val):
                 raise ValueError(f"Existing element update (ID: {id_val}) requires a valid 'id' (ObjectId string) or 'global_id' for matching.")
        return values

class BatchUpdateRequest(BaseModel):
    elements: List[BatchElementData]

class ElementInputData(BaseModel):
    # Define the specific input model for elements in the /send-qto request
    id: str
    global_id: Optional[str] = None
    type: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    properties: Optional[Dict[str, Any]] = Field(default_factory=dict)
    material_volumes: Optional[Dict[str, Dict[str, Any]]] = None # Kept for potential older data
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
    quantity: Optional[Dict[str, Any]] = None # Keep as dict for backward compat? Review if QuantityData can be used
    original_quantity: Optional[Dict[str, Any]] = None # Keep as dict for backward compat? Review if QuantityData can be used
    category: Optional[str] = None
    is_structural: Optional[bool] = None
    is_external: Optional[bool] = None
    is_manual: Optional[bool] = False

    class Config:
        extra = 'ignore'

class QTORequestBody(BaseModel):
    # Update QTORequestBody to use the new ElementInputData model
    elements: Optional[List[ElementInputData]] = None
    project: Optional[str] = None

# <<< ADDED FOR ASYNC IFC PROCESSING >>>
class JobCreate(BaseModel):
    filename: str
    project_name: str
    file_id_in_staging: str # e.g., UUID or path to the staged file
    upload_timestamp: datetime

class Job(JobCreate):
    id: str = Field(default_factory=lambda: str(ObjectId()), alias="_id")
    status: str = "queued" # queued, processing, completed, failed
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    error_message: Optional[str] = None
    element_count: Optional[int] = None

    class Config:
        populate_by_name = True
        json_encoders = {ObjectId: str, datetime: lambda dt: dt.isoformat(timespec='seconds')}
        arbitrary_types_allowed = True

class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    filename: str
    project_name: str
    created_at: datetime
    updated_at: datetime
    element_count: Optional[int] = None
    error_message: Optional[str] = None
    
    class Config:
        json_encoders = {ObjectId: str, datetime: lambda dt: dt.isoformat(timespec='seconds')}

class JobAcceptedResponse(BaseModel):
    message: str
    job_id: str
    status_endpoint: str
# <<< END ADDED FOR ASYNC IFC PROCESSING >>>

# Update model references if needed (e.g., if IFCElement definition changed)
# This helps avoid NameErrors if models depend on each other.
BatchUpdateResponse.model_rebuild()
ElementListResponse.model_rebuild()
ManualElementInput.model_rebuild()
