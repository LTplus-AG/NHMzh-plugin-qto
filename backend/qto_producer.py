from confluent_kafka import Producer
import json
import logging
import os
import socket
import time
from typing import Dict, Any, List
import re
from pymongo import MongoClient, UpdateOne, InsertOne
from bson.objectid import ObjectId
from datetime import datetime, timezone
from pymongo.errors import BulkWriteError
from models import BatchElementData # Import the necessary model

# Set up logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def is_running_in_docker():
    """Check if we're running inside a Docker container"""
    try:
        with open('/proc/1/cgroup', 'r') as f:
            return 'docker' in f.read()
    except:
        return False

class MongoDBHelper:
    """Helper class for MongoDB operations."""
    def __init__(self, db_name=None, max_retries=5, retry_delay=3):
        """Initialize MongoDB connection using service-specific credentials.
        
        Args:
            db_name: Database name (defaults to MONGODB_QTO_DATABASE env var)
            max_retries: Maximum number of connection retries
            retry_delay: Delay between retries in seconds
        """
        # --- Get configuration from environment variables ---
        self.host = os.getenv('MONGODB_HOST', 'mongodb') # Service name in Docker network
        self.port = os.getenv('MONGODB_PORT', '27017')   # Default MongoDB port
        
        # --- Reverted: Use QTO Service User --- 
        # logger.warning("FORCE TEMPORARY DEBUG: Using MongoDB Admin User credentials for QTO service!")
        # self.user = os.getenv('MONGODB_ADMIN_USER')     # Use ADMIN user (passed from root user)
        # self.password = os.getenv('MONGODB_ADMIN_PASSWORD') # Use ADMIN password (passed from root pass)
        # --- END TEMP DEBUG --- 
        
        self.user = os.getenv('MONGODB_QTO_USER')       # Use Specific user for this service
        self.password = os.getenv('MONGODB_QTO_PASSWORD') # Use Specific password for this service
        
        self.db_name = db_name or os.getenv('MONGODB_QTO_DATABASE', 'qto') # Specific DB for this service
        
        # --- Validate required variables ---
        if not self.user:
            # Reverted error message
            raise ValueError("MONGODB_QTO_USER environment variable is not set.")
        if not self.password:
            # Reverted error message
            raise ValueError("MONGODB_QTO_PASSWORD environment variable is not set.")
            
        # --- Construct the MongoDB URI ---
        # Format: mongodb://user:password@host:port/database?authSource=admin
        self.uri = (
            f"mongodb://{self.user}:{self.password}@{self.host}:{self.port}/"
            f"{self.db_name}?authSource=admin"
        )
        
        logger.info(f"Constructed MongoDB URI for user '{self.user}' (Password Hidden)") 
        # --- End URI Construction ---

        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.client = None
        self.db = None    
        # Initialize MongoDB connection with retries
        self._initialize_connection()
    
    def _initialize_connection(self):
        """Initialize MongoDB connection with retry logic."""
        retries = 0
        while retries < self.max_retries:
            try:
                logger.info(f"Attempting MongoDB connection (attempt {retries + 1}/{self.max_retries})...")
                # Create the MongoDB client
                # Add serverSelectionTimeoutMS to handle network issues better
                self.client = MongoClient(
                    self.uri, 
                    serverSelectionTimeoutMS=5000 # Timeout after 5 seconds
                )
                # Test the connection by pinging the server - this forces authentication
                self.client.admin.command('ping')
                # Get database
                self.db = self.client[self.db_name]
                
                logger.info(f"MongoDB connected successfully to database '{self.db_name}'")
                
                # Ensure collections exist (optional, init script should handle this)
                # self._ensure_collections() 
                return
            except Exception as e:
                retries += 1
                logger.warning(f"MongoDB connection failed (attempt {retries}/{self.max_retries}): {e}")
                if retries < self.max_retries:
                    logger.info(f"Retrying in {self.retry_delay} seconds...")
                    time.sleep(self.retry_delay)
                else:
                    logger.error(f"Failed to connect to MongoDB after {self.max_retries} attempts.")
                    # Optionally raise the exception or handle it as needed
                    # raise ConnectionFailure(f"Could not connect to MongoDB: {e}") from e
                    # For now, just log and let db be None
                    self.db = None 
                    return # Exit loop after max retries
    
    def _ensure_collections(self):
        """Ensure required collections exist with proper indexes."""
        try:
            # Check if collections exist, create them if not
            collection_names = self.db.list_collection_names()
            
            # Projects collection
            if "projects" not in collection_names:
                self.db.create_collection("projects")
                self.db.projects.create_index("name")
            
            # Elements collection
            if "elements" not in collection_names:
                self.db.create_collection("elements")
                self.db.elements.create_index("project_id")
        except Exception as e:
            logger.error(f"Error ensuring collections: {e}")
    
    def save_project(self, project_data: Dict[str, Any]) -> ObjectId:
        """Save project data to MongoDB.
        
        Args:
            project_data: Dictionary containing project data
            
        Returns:
            ObjectId of inserted/updated project document
        """
        if self.db is None:
            logger.error("MongoDB not connected, cannot save project")
            return None
            
        try:
            # Add timestamps if they don't exist
            if 'created_at' not in project_data:
                project_data['created_at'] = datetime.now(timezone.utc)
            
            project_data['updated_at'] = datetime.now(timezone.utc)
            
            # Check if project already exists by name
            existing_project = self.db.projects.find_one({"name": project_data["name"]})
            
            if existing_project:
                # Update existing project
                # Ensure _id is not part of the $set payload
                update_data = project_data.copy()
                if '_id' in update_data:
                    del update_data['_id'] 
                    
                update_result = self.db.projects.update_one(
                    {"_id": existing_project["_id"]},
                    {"$set": update_data}
                )
                if update_result.modified_count > 0:
                    logger.info(f"Updated existing project: {existing_project['_id']}")
                return existing_project["_id"]
            else:
                # Insert new project
                result = self.db.projects.insert_one(project_data)
                logger.info(f"Inserted new project '{project_data['name']}' with ID: {result.inserted_id}")
                return result.inserted_id
        except Exception as e:
            logger.error(f"Error saving project to MongoDB: {e}")
            return None
    
    def save_element(self, element_data: Dict[str, Any]) -> ObjectId:
        """Save element data to MongoDB.
        
        Args:
            element_data: Dictionary containing element data
            
        Returns:
            ObjectId of inserted element document
        """
        if self.db is None:
            logger.error("MongoDB not connected, cannot save element")
            return None
            
        try:
            # Add timestamps if they don't exist
            if 'created_at' not in element_data:
                element_data['created_at'] = datetime.now(timezone.utc)
            
            element_data['updated_at'] = datetime.now(timezone.utc)
            
            # Make sure project_id is an ObjectId
            if 'project_id' in element_data and isinstance(element_data['project_id'], str):
                element_data['project_id'] = ObjectId(element_data['project_id'])
            
            # Insert element
            result = self.db.elements.insert_one(element_data)
            return result.inserted_id
        except Exception as e:
            logger.error(f"Error saving element to MongoDB: {e}")
            return None
    
    def get_element(self, element_id: str) -> Dict[str, Any]:
        """Get element by ID.
        
        Args:
            element_id: String ID of the element
            
        Returns:
            Element document as dictionary
        """
        if self.db is None:
            logger.error("MongoDB not connected, cannot get element")
            return None
            
        try:
            # Convert string ID to ObjectId
            obj_id = ObjectId(element_id)
            element = self.db.elements.find_one({"_id": obj_id})
            return element
        except Exception as e:
            logger.error(f"Error getting element from MongoDB: {e}")
            return None

    def delete_project_elements(self, project_id: ObjectId, keep_manual: bool = False) -> Dict[str, Any]:
        """Delete elements for a project, optionally keeping manual ones.

        Args:
            project_id: ObjectId of the project
            keep_manual: If True, only delete elements where is_manual is not True.

        Returns:
            Dictionary with success status and deletion count.
        """
        if self.db is None:
            logger.error("MongoDB not connected, cannot delete elements")
            return {"success": False, "message": "Database not connected.", "deleted_count": 0}

        try:
            # Convert string ID to ObjectId if needed
            if isinstance(project_id, str):
                project_id = ObjectId(project_id)

            # Build the filter based on whether to keep manual elements
            delete_filter = {"project_id": project_id}
            if keep_manual:
                delete_filter["is_manual"] = {"$ne": True}
                log_msg_suffix = " non-manual"
            else:
                log_msg_suffix = "" # Delete all

            # Delete elements matching the filter
            result = self.db.elements.delete_many(delete_filter)
            deleted_count = result.deleted_count
            logger.info(f"Deleted {deleted_count}{log_msg_suffix} elements for project {project_id}")
            return {"success": True, "deleted_count": deleted_count}
        except Exception as e:
            logger.error(f"Error deleting project elements: {e}")
            return {"success": False, "message": str(e), "deleted_count": 0}

    def replace_project_elements(self, project_id: ObjectId, elements_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Replaces all non-manual elements for a project with the provided list.
        Designed for handling uploads of newly parsed IFC data.

        Args:
            project_id: ObjectId of the project.
            elements_data: List of element dictionaries to insert.

        Returns:
            Dictionary with success status and insert count.
        """
        if self.db is None:
            logger.error("MongoDB not connected, cannot replace project elements")
            return {"success": False, "message": "Database not connected.", "inserted_count": 0}

        try:
            # 1. Delete existing non-manual elements for the project
            delete_result = self.delete_project_elements(project_id, keep_manual=True)
            if not delete_result["success"]:
                # Propagate the error message from the delete operation
                return {"success": False, "message": f"Failed to delete existing elements: {delete_result.get('message', 'Unknown error')}", "inserted_count": 0}

            # 2. Insert the new elements if the list is not empty
            if not elements_data:
                logger.info(f"No new elements provided to insert for project {project_id} after deletion.")
                return {"success": True, "message": "Existing non-manual elements deleted, no new elements to insert.", "inserted_count": 0}

            now = datetime.now(timezone.utc)
            elements_to_insert = []
            for element in elements_data:
                # Ensure basic fields and timestamps are set correctly
                element['project_id'] = project_id
                element['created_at'] = now # Mark creation time for this batch
                element['updated_at'] = now
                element['is_manual'] = False # Mark elements from IFC as not manual
                element['status'] = "pending" # Newly uploaded elements start as pending
                # Remove _id if it somehow exists in the input data
                element.pop('_id', None)
                elements_to_insert.append(element)

            if not elements_to_insert: # Should not happen if elements_data was not empty, but safety check
                 logger.warning(f"Prepared list for insertion is empty for project {project_id}, although input was not.")
                 return {"success": True, "message": "Internal preparation resulted in empty list.", "inserted_count": 0}

            # Perform the bulk insert
            insert_result = self.db.elements.insert_many(elements_to_insert, ordered=False)
            inserted_count = len(insert_result.inserted_ids)
            logger.info(f"Inserted {inserted_count} new elements from IFC for project {project_id}")

            return {"success": True, "inserted_count": inserted_count}

        except BulkWriteError as bwe:
            # Handle potential errors during insert_many
            logger.error(f"Bulk write error during replace_project_elements (insert phase): {bwe.details}")
            # We might have partially deleted elements, state is inconsistent.
            return {"success": False, "message": f"Bulk write error during insertion: {bwe.details}", "inserted_count": 0}
        except Exception as e:
            logger.error(f"Unexpected error in replace_project_elements for project {project_id}: {e}", exc_info=True)
            return {"success": False, "message": f"Unexpected error: {str(e)}", "inserted_count": 0}

    # --- NEW METHODS for Parsed Data ---
    def save_parsed_data(self, project_name: str, filename: str, elements: List[Dict[str, Any]]) -> bool:
        """Saves the fully parsed list of element data for a project/file.
           Overwrites existing data for the same project_name and filename.
        """
        if self.db is None:
            logger.error("MongoDB not connected, cannot save parsed data")
            return False
        try:
            collection = self.db.parsed_ifc_data
            timestamp = datetime.now(timezone.utc)

            # Data structure to save
            data_to_save = {
                "project_name": project_name,
                "filename": filename,
                "elements": elements, # Store the list of parsed element dicts
                "updated_at": timestamp
            }

            # Use update_one with upsert=True to insert or replace
            result = collection.update_one(
                {"project_name": project_name, "filename": filename}, # Filter to find the specific project/file
                {
                    "$set": {
                        "project_name": project_name,
                        "filename": filename,
                        "elements": elements,
                        "updated_at": timestamp
                     },
                    "$setOnInsert": { "created_at": timestamp } # Set created_at only on insert
                },
                upsert=True
            )

            if result.upserted_id:
                logger.info(f"Inserted new parsed data for {project_name}/{filename}")
            elif result.modified_count > 0:
                logger.info(f"Updated existing parsed data for {project_name}/{filename}")
            else:
                 logger.info(f"No changes needed for parsed data {project_name}/{filename} (data might be identical)")

            return True
        except Exception as e:
            logger.error(f"Error saving parsed data to MongoDB: {e}")
            return False

    def get_parsed_data_by_project(self, project_name: str) -> List[Dict[str, Any]]:
        """Retrieves the stored list of parsed element data for a project.
           If multiple filenames exist for a project, it currently retrieves the most recently updated one.
           Consider refining this logic if multiple versions per project are needed.
        """
        if self.db is None:
            logger.error("MongoDB not connected, cannot retrieve parsed data")
            return None
        try:
            collection = self.db.parsed_ifc_data
            # Find the latest document for the project based on updated_at
            latest_data = collection.find_one(
                {"project_name": project_name},
                sort=[("updated_at", -1)] # Get the most recent entry
            )
            if latest_data:
                return latest_data.get("elements", [])
            else:
                return None # Or return [] if an empty list is preferred for not found
        except Exception as e:
            logger.error(f"Error retrieving parsed data from MongoDB for {project_name}: {e}")
            return None

    def list_distinct_projects(self) -> List[str]:
        """Returns a list of distinct project names from the projects collection."""
        if self.db is None:
            logger.error("MongoDB not connected, cannot list projects")
            return []
        try:
            # Query the 'projects' collection for the distinct 'name' field
            collection = self.db.projects
            distinct_projects = collection.distinct("name")
            # logger.info(f"Distinct projects found in 'projects' collection: {distinct_projects}") # Too verbose
            return distinct_projects
        except Exception as e:
            logger.error(f"Error listing distinct projects from MongoDB: {e}")
            return []

    def approve_project_elements(self, project_id: ObjectId) -> bool:
        """Update the status of all elements for a project to 'active', indicating they've been reviewed and approved.
        
        Args:
            project_id: ObjectId of the project
            
        Returns:
            Boolean indicating if update was successful
        """
        if self.db is None:
            logger.error("MongoDB not connected, cannot approve elements")
            return False
            
        try:
            # Convert string ID to ObjectId if needed
            if isinstance(project_id, str):
                project_id = ObjectId(project_id)
            
            # Log the project_id we're using for debugging
            logger.info(f"Approving elements for project_id: {project_id}")
            
            # Check if elements exist for this project before updating
            # element_count = self.db.elements.count_documents({"project_id": project_id})
            # logger.info(f"Found {element_count} total elements for project {project_id}") # Too verbose
            
            # Check how many elements have pending status
            # pending_count = self.db.elements.count_documents({"project_id": project_id, "status": "pending"})
            # logger.info(f"Found {pending_count} elements with 'pending' status") # Too verbose
            
            # Update all elements for this project to active status, regardless of current status
            result = self.db.elements.update_many(
                {"project_id": project_id},
                {"$set": {"status": "active"}}
            )
            logger.info(f"Approved {result.modified_count} elements for project {project_id}")
            return True
        except Exception as e:
            logger.error(f"Error approving project elements: {e}")
            return False

    def update_element_quantities(self, project_id: ObjectId, updates: List[Dict[str, Any]]) -> bool:
        """Updates the quantity field for multiple elements within a project.
        
        Args:
            project_id: ObjectId of the project.
            updates: List of update objects, each containing 'element_id' (the ifc_id) 
                     and 'new_quantity' (a dict with 'value', 'type', 'unit').
                     
        Returns:
            Boolean indicating if all updates were attempted successfully.
        """
        if self.db is None:
            logger.error("MongoDB not connected, cannot update quantities")
            return False

        success_count = 0
        error_count = 0
        
        for update in updates:
            element_ifc_id = None
            new_quantity_dict = None
            try:
                # Access attributes directly from Pydantic model
                element_ifc_id = update.element_id 
                new_quantity_model = update.new_quantity
                
                # Check if the model and its value are valid
                if not element_ifc_id or not new_quantity_model or new_quantity_model.value is None:
                    logger.warning(f"Skipping invalid update data (missing ID or quantity value): {update.model_dump() if hasattr(update, 'model_dump') else update}") # Use model_dump if available
                    error_count += 1
                    continue

                # Convert Pydantic QuantityData back to dict for MongoDB
                new_quantity_dict = {
                    "value": new_quantity_model.value,
                    "type": new_quantity_model.type,
                    "unit": new_quantity_model.unit
                } if new_quantity_model else None

                if not new_quantity_dict: # Double check conversion
                    logger.warning(f"Skipping update due to inability to create quantity dict for element: {element_ifc_id}")
                    error_count += 1
                    continue

                # Find the element by project_id and ifc_id
                filter_criteria = {"project_id": project_id, "ifc_id": element_ifc_id}
                
                # Prepare the update operation
                update_operation = {
                    "$set": {
                        "quantity": new_quantity_dict, # Use the dictionary
                        "updated_at": datetime.now(timezone.utc)
                    }
                }
                
                # Log before update
                # logger.debug(f"Attempting MongoDB update for element_ifc_id: {element_ifc_id}")
                # logger.debug(f"Filter criteria: {filter_criteria}")
                # logger.debug(f"Update operation: {update_operation}")

                result = self.db.elements.update_one(filter_criteria, update_operation)
                
                if result.matched_count == 0:
                    logger.warning(f"No element found matching project {project_id} and ifc_id {element_ifc_id}. Update skipped.")
                    error_count += 1
                elif result.modified_count == 0:
                    # Matched but didn't modify (maybe quantity was already the same?)
                    # logger.info(f"Element {element_ifc_id} matched but not modified (quantity might be unchanged). Considered success.") # Too verbose
                    success_count += 1 
                else:
                    # Successfully modified
                    success_count += 1
                    
            except Exception as e:
                # Log the error, using the element_ifc_id if assigned, or the raw update data
                error_identifier = element_ifc_id if element_ifc_id else str(update.model_dump() if hasattr(update, 'model_dump') else update)
                logger.error(f"Error updating quantity for element {error_identifier} in project {project_id}: {e}")
                error_count += 1
        
        logger.info(f"Quantity update process finished for project {project_id}. Success: {success_count}, Errors/Skipped: {error_count}")
        # Return True if there were no errors, even if some were skipped/not found
        return error_count == 0

    def delete_element(self, project_id: ObjectId, element_ifc_id: str) -> Dict[str, Any]:
        """Deletes a single element, ensuring it belongs to the project and is manual."""
        if self.db is None:
            logger.error("MongoDB not connected, cannot delete element")
            return {"success": False, "message": "Database not connected."}
        
        try:
            # logger.info(f"Attempting to delete element with ifc_id: '{element_ifc_id}' in project_id: {project_id}") # <<< Logging
            # Find the element first to verify it's manual and belongs to the project
            element_to_delete = self.db.elements.find_one({
                "project_id": project_id,
                "ifc_id": element_ifc_id
            })
            # logger.info(f"Result of find_one for element '{element_ifc_id}': {'Found' if element_to_delete else 'Not Found'}") # <<< Logging

            if not element_to_delete:
                logger.warning(f"Element with ifc_id {element_ifc_id} not found in project {project_id} for deletion.")
                return {"success": False, "message": "Element not found.", "deleted_count": 0}
            
            # <<< Important Check: Only allow deleting manual elements >>>
            is_manual_flag = element_to_delete.get("is_manual", False) # <<< Logging
            # logger.info(f"Element '{element_ifc_id}' found. is_manual flag: {is_manual_flag}") # <<< Logging
            if not is_manual_flag:
                 logger.warning(f"Attempted to delete non-manual element {element_ifc_id}. Operation forbidden.")
                 return {"success": False, "message": "Only manually added elements can be deleted.", "deleted_count": 0}

            # Proceed with deletion
            element_db_id = element_to_delete["_id"] # <<< Logging
            # logger.info(f"Proceeding to delete element with database _id: {element_db_id}") # <<< Logging
            result = self.db.elements.delete_one({
                "_id": element_db_id # Delete by unique _id
            })
            delete_count = result.deleted_count # <<< Logging
            # logger.info(f"Result of delete_one operation: deleted_count={delete_count}") # <<< Logging

            if delete_count == 1:
                logger.info(f"Successfully deleted manual element {element_ifc_id} (DB ID: {element_db_id}) from project {project_id}")
                return {"success": True, "deleted_count": 1}
            else:
                 # Should not happen if find_one succeeded, but good practice
                 logger.error(f"Failed to delete element {element_ifc_id} even though it was found.")
                 return {"success": False, "message": "Deletion failed after element was found.", "deleted_count": 0}

        except Exception as e:
            logger.error(f"Error deleting element {element_ifc_id}: {e}")
            return {"success": False, "message": str(e), "deleted_count": 0}

    # --- Method Renamed & Refined for Manual Updates/Creates --- #
    def batch_upsert_manual_elements(self, project_id: ObjectId, elements_data: List[Any]) -> Dict[str, Any]:
        """Performs a batch update/insert operation primarily for manual elements.

        - Updates existing elements based on 'ifc_id'.
        - Inserts new elements if 'ifc_id' is provided and does not exist (upsert=True).
        - Can handle elements marked as manual or not, but intended for UI-driven updates.
        - Sets status to 'active' for all processed elements by default (can be overridden in input).

        Args:
            project_id: ObjectId of the project.
            elements_data: List of element dictionaries or Pydantic models (BatchElementData).

        Returns:
            Dictionary with success status and counts (processed, created, updated, upserted).
        """
        if self.db is None:
            logger.error("MongoDB not connected, cannot perform batch upsert for manual elements")
            return {"success": False, "message": "Database not connected."}

        operations = []
        processed_count = 0
        ids_to_return = [] # Store IDs of created/updated elements
        now = datetime.now(timezone.utc)

        for element_input in elements_data:
            element_dict = {}
            if hasattr(element_input, 'model_dump'): # Check if it's a Pydantic model
                element_dict = element_input.model_dump(exclude_unset=True, exclude_none=True)
            elif isinstance(element_input, dict):
                element_dict = element_input.copy() # Work with a copy
            else:
                logger.warning(f"Skipping unrecognized element data type in batch: {type(element_input)}")
                continue

            element_ifc_id = element_dict.get('id') or element_dict.get('ifc_id') # Allow 'id' or 'ifc_id'
            if not element_ifc_id:
                logger.warning(f"Skipping element without 'id' or 'ifc_id' in batch upsert: {element_dict.get('name', 'N/A')}")
                continue

            try:
                # Prepare the document data to be saved/updated
                # Default status to active if not provided
                element_status = element_dict.get('status', 'active')

                db_doc_set = {
                    "project_id": project_id, # Ensure project_id is set
                    "ifc_class": element_dict.get('type') or element_dict.get('ifc_class'),
                    "name": element_dict.get('name'),
                    "type_name": element_dict.get('type_name'),
                    "level": element_dict.get('level'),
                    "description": element_dict.get('description'),
                    "quantity": element_dict.get('quantity'),
                    "original_quantity": element_dict.get('original_quantity'), # Keep original if provided
                    "classification": element_dict.get('classification'),
                    "materials": element_dict.get('materials', []),
                    "properties": element_dict.get('properties', {}),
                    "is_manual": element_dict.get('is_manual', True), # Default to True for this endpoint
                    "is_structural": element_dict.get('is_structural'),
                    "is_external": element_dict.get('is_external'),
                    "status": element_status,
                    "updated_at": now,
                    "global_id": element_dict.get('global_id')
                }
                # Remove keys with None values from $set payload
                db_doc_set = {k: v for k, v in db_doc_set.items() if v is not None}

                # <<< FIX: Remove original_quantity from $set to avoid conflict >>>
                db_doc_set.pop('original_quantity', None)

                # Fields to set only on insert (creation)
                db_doc_on_insert = {
                     "created_at": now,
                     # Set original quantity on insert if not provided explicitly
                     # Note: We use element_dict here because db_doc_set might have had original_quantity removed already
                     "original_quantity": element_dict.get('original_quantity') or element_dict.get('quantity'),
                     "ifc_id": element_ifc_id # Ensure ifc_id is set on insert
                 }
                # Generate pseudo GlobalId on insert if missing
                # (Adjusted this logic slightly as well for clarity)
                global_id_to_set = element_dict.get('global_id')
                if not global_id_to_set:
                    db_doc_on_insert['global_id'] = f"MANUAL-{element_ifc_id}"
                elif 'global_id' not in db_doc_set: # Ensure it's in $set if provided but was None originally
                    db_doc_set['global_id'] = global_id_to_set

                # Use UpdateOne with upsert=True
                operations.append(UpdateOne(
                    {"project_id": project_id, "ifc_id": element_ifc_id},
                    {
                        "$set": db_doc_set,
                        "$setOnInsert": db_doc_on_insert
                    },
                    upsert=True
                ))
                processed_count += 1
            except Exception as e:
                error_id = element_ifc_id or element_dict.get('name', 'N/A')
                logger.error(f"Error preparing operation for element {error_id}: {e}", exc_info=True)
                # Continue processing other elements

        # Execute Batch Operation
        if not operations:
             logger.info("No element operations to perform for batch upsert (manual).")
             return {"success": True, "processed": 0, "created": 0, "updated": 0, "upserted_ids": []}

        try:
            result = self.db.elements.bulk_write(operations, ordered=False)
            # Safely get counts and upserted IDs
            upserted_count = getattr(result, 'upserted_count', 0)
            updated_count = getattr(result, 'modified_count', 0)
            matched_count = getattr(result, 'matched_count', 0)
            upserted_object_ids = getattr(result, 'upserted_ids', {}) # Dict: {index: _id}

            # Combine created (upserted) and updated counts
            created_or_updated_count = upserted_count + updated_count

            # Get the string representation of upserted ObjectIds
            upserted_str_ids = [str(oid) for oid in upserted_object_ids.values()]

            logger.info(
                f"Manual Bulk write result: matched={matched_count}, "
                f"modified={updated_count}, upserted={upserted_count} "
                f"(Upserted ObjectIDs: {upserted_str_ids})"
            )

            # Note: It's hard to get the specific IDs of merely *updated* documents from bulk_write result easily.
            # We return the IDs of the *upserted* (newly created) documents.
            return {
                "success": True,
                "processed": processed_count,
                "created_or_updated": created_or_updated_count, # Combined count
                "created": upserted_count, # Specifically created count
                "updated": updated_count, # Specifically updated count
                "upserted_ids": upserted_str_ids # Return list of string ObjectIDs for created docs
            }
        except BulkWriteError as bwe:
            logger.error(f"Bulk write error during batch upsert (manual): {bwe.details}")
            details = getattr(bwe, 'details', {})
            # Extract counts from error details
            created = details.get('nUpserted', 0)
            updated = details.get('nModified', 0)
            upserted_ids_on_error = [str(oid) for oid in details.get('upserted', [])] if details.get('upserted') else []

            return {
                "success": False,
                "message": f"Bulk write error occurred: {len(details.get('writeErrors', []))} errors.",
                "details": details,
                "processed": processed_count,
                "created_or_updated": created + updated,
                "created": created,
                "updated": updated,
                "upserted_ids": upserted_ids_on_error
            }
        except Exception as e:
            logger.error(f"Unexpected error during batch upsert (manual) execution: {e}", exc_info=True)
            return {"success": False, "message": f"Unexpected error: {e}", "processed": processed_count, "created": 0, "updated": 0, "upserted_ids": []}

