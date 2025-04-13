from confluent_kafka import Producer
import json
import logging
import os
import socket
import time
from typing import Dict, Any, List
import re
from pymongo import MongoClient
from bson.objectid import ObjectId
from datetime import datetime, timezone

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
                
                logger.info(f"MongoDB connection established successfully to database '{self.db_name}'")
                
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
                self.db.projects.update_one(
                    {"_id": existing_project["_id"]},
                    {"$set": project_data}
                )
                logger.info(f"Updated existing project: {existing_project['_id']}")
                return existing_project["_id"]
            else:
                # Insert new project
                result = self.db.projects.insert_one(project_data)
                logger.info(f"Inserted new project: {result.inserted_id}")
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

    def delete_project_elements(self, project_id: ObjectId) -> bool:
        """Delete all elements for a project.
        
        Args:
            project_id: ObjectId of the project
            
        Returns:
            Boolean indicating if deletion was successful
        """
        if self.db is None:
            logger.error("MongoDB not connected, cannot delete elements")
            return False
            
        try:
            # Convert string ID to ObjectId if needed
            if isinstance(project_id, str):
                project_id = ObjectId(project_id)
                
            # Delete all elements for this project
            result = self.db.elements.delete_many({"project_id": project_id})
            logger.info(f"Deleted {result.deleted_count} elements for project {project_id}")
            return True
        except Exception as e:
            logger.error(f"Error deleting project elements: {e}")
            return False

    def save_elements_batch(self, elements: List[Dict[str, Any]], project_id: ObjectId) -> bool:
        """Save multiple elements, replacing all existing elements for the project.
        Since we're not using a replica set, we'll do this without transactions.
        
        Args:
            elements: List of element dictionaries to save
            project_id: ObjectId of the project
            
        Returns:
            Boolean indicating if save was successful
        """
        if self.db is None:
            logger.error("MongoDB not connected, cannot save elements")
            return False
            
        try:
            # First delete all existing elements for this project
            delete_result = self.db.elements.delete_many({"project_id": project_id})
            logger.info(f"Deleted {delete_result.deleted_count} existing elements for project {project_id}")
            
            # Now insert all new elements
            if elements:
                # Add timestamps and ensure project_id is ObjectId
                for element in elements:
                    if 'created_at' not in element:
                        element['created_at'] = datetime.now(timezone.utc)
                    element['updated_at'] = datetime.now(timezone.utc)
                    if isinstance(element.get('project_id'), str):
                        element['project_id'] = ObjectId(element['project_id'])
                
                # Insert all elements
                result = self.db.elements.insert_many(elements)
                logger.info(f"Inserted {len(result.inserted_ids)} new elements for project {project_id}")
            
            return True
                    
        except Exception as e:
            logger.error(f"Error in save_elements_batch: {e}")
            return False

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
            logger.info(f"Distinct projects found in 'projects' collection: {distinct_projects}")
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
            element_count = self.db.elements.count_documents({"project_id": project_id})
            logger.info(f"Found {element_count} total elements for project {project_id}")
            
            # Check how many elements have pending status
            pending_count = self.db.elements.count_documents({"project_id": project_id, "status": "pending"})
            logger.info(f"Found {pending_count} elements with 'pending' status")
            
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
            new_quantity_dict = None # Initialize dict for logging
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
                logger.debug(f"Attempting MongoDB update for element_ifc_id: {element_ifc_id}")
                logger.debug(f"Filter criteria: {filter_criteria}")
                logger.debug(f"Update operation: {update_operation}")

                result = self.db.elements.update_one(filter_criteria, update_operation)
                
                if result.matched_count == 0:
                    logger.warning(f"No element found matching project {project_id} and ifc_id {element_ifc_id}. Update skipped.")
                    error_count += 1
                elif result.modified_count == 0:
                    # Matched but didn't modify (maybe quantity was already the same?)
                    logger.info(f"Element {element_ifc_id} matched but not modified (quantity might be unchanged). Considered success.")
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

    # --- END NEW METHODS ---

class QTOKafkaProducer:
    def __init__(self, bootstrap_servers=None, topic=None, max_retries=3, retry_delay=2):
        """Initialize the Kafka producer.
        
        Args:
            bootstrap_servers: Kafka broker address (defaults to environment variable)
            topic: Kafka topic to send messages to (defaults to environment variable)
            max_retries: Maximum number of connection retries
            retry_delay: Delay between retries in seconds
        """
        # Get configuration from environment variables or use default values
        if bootstrap_servers:
            self.bootstrap_servers = bootstrap_servers
        else:

            self.bootstrap_servers = os.getenv('KAFKA_BROKER', 'localhost:9092')

        self.topic = topic or os.getenv('KAFKA_QTO_TOPIC', 'qto-elements')
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.producer = None     
        # Initialize producer with retries
        self._initialize_producer()
    
    def _initialize_producer(self):
        """Initialize the Kafka producer with retry logic."""
        retries = 0
        while retries <= self.max_retries:
            try:
                # Check if broker hostname is resolvable
                host = self.bootstrap_servers.split(':')[0]
                try:
                    socket.gethostbyname(host)
                except socket.gaierror:
                    logger.warning(f"Could not resolve hostname: {host}. Kafka connections may fail.")
                
                # Create the producer
                self.producer = Producer({'bootstrap.servers': self.bootstrap_servers})
                
                # Test the connection by listing topics (will raise exception if can't connect)
                self.producer.list_topics(timeout=5)

                return
            except Exception as e:
                retries += 1
                if retries <= self.max_retries:
                    logger.warning(f"Failed to connect to Kafka (attempt {retries}/{self.max_retries}): {e}")
                    logger.info(f"Retrying in {self.retry_delay} seconds...")
                    time.sleep(self.retry_delay)
                else:
                    logger.error(f"Failed to connect to Kafka after {self.max_retries} attempts: {e}")
                    # Initialize producer anyway to avoid NoneType errors, but it won't work
                    self.producer = Producer({'bootstrap.servers': self.bootstrap_servers})
    
    def delivery_report(self, err, msg):
        """Callback invoked on successful or failed message delivery."""
        if err is not None:
            logger.error(f"Message delivery failed: {err}")
        else:
            logger.info(f"Message delivered to {msg.topic()} [{msg.partition()}] at offset {msg.offset()}")
    
    def send_qto_message(self, qto_data: Dict[str, Any]):
        """Send QTO data to Kafka topic.
        
        Args:
            qto_data: Dictionary containing QTO data
            
        Returns:
            Boolean indicating if message was sent successfully
        """
        if self.producer is None:
            logger.error("Kafka producer not initialized, cannot send message")
            return False
            
        try:
            # Check if this data contains an elements array (raw element dictionaries)
            if isinstance(qto_data.get('elements'), list) and len(qto_data.get('elements', [])) > 0:
                # Pass the entire dictionary which includes metadata and raw elements
                return self.send_project_update_notification(qto_data)
        except Exception as e:
            logger.error(f"Error sending QTO data to Kafka: {e}")
            return False
    
    def send_project_update_notification(self, project_update_data: Dict[str, Any]):
        """Saves project/elements to MongoDB and sends a simplified project update 
           notification to Kafka topic.
        
        Args:
            project_update_data: Dictionary containing project metadata and the 
                                   LIST OF RAW element dictionaries.
            
        Returns:
            Boolean indicating if the notification was sent successfully
        """
        if self.producer is None:
            logger.error("Kafka producer not initialized, cannot send notification")
            return False
            
        # Extract elements (raw dicts) and metadata from the input dictionary
        elements = project_update_data.get('elements', [])
        if not elements:
            logger.warning("No elements found in project update data, no notification sent")
            return False
            
        metadata = {
            "project": project_update_data.get("project"),
            "filename": project_update_data.get("filename"),
            "timestamp": project_update_data.get("timestamp"),
            "file_id": project_update_data.get("file_id")
        }
        
        # Initialize MongoDB helper
        mongodb = MongoDBHelper()
        
        # Save project to MongoDB and get project ID
        project_info_to_save = {
            "name": metadata["project"],
            "description": f"Project for {metadata['filename']}",
            "metadata": {
                "file_id": metadata["file_id"],
                "filename": metadata["filename"],
                "fileProcessingTimestamp": metadata["timestamp"] 
            }
        }
        project_id = mongodb.save_project(project_info_to_save)
        
        if not project_id:
            logger.error("Failed to save project to MongoDB, cannot proceed with elements")
            return False
        
        # Format all elements for saving
        elements_to_save = []
        for element in elements:
            try:
                # Get element ID safely for logging and formatting
                current_element_id = element.get("id", "UNKNOWN_ID") 
                
                # Get element type
                element_type = element.get("type", "").lower()
                
                # Check if element is structural based on type
                is_structural = any(s in element_type for s in ["wall", "column", "beam", "slab", "footing"])
                
                # Check if element is external based on common property
                is_external = False
                # Use .get() for safer access to properties dictionary
                properties = element.get("properties", {})
                if properties:
                    # Check for IsExternal property (variations of capitalization)
                    for prop_name, prop_value in properties.items():
                        if prop_name.lower() == "isexternal" and str(prop_value).lower() in ["true", "1", "yes"]:
                            is_external = True
                            break
                
                # Get the original area - may be stored directly or in properties
                original_area = element.get("original_area")
                if original_area is None and "original_area" in properties:
                    original_area = properties["original_area"]
                
                # Get area value
                area_value = element.get("area", 0)
                length_value = element.get("length", 0) # Get length value too

                # Ensure numeric types, default to 0 if conversion fails
                try:
                    area_value = float(area_value) if area_value is not None else 0
                except (ValueError, TypeError):
                    area_value = 0
                try:
                    length_value = float(length_value) if length_value is not None else 0
                except (ValueError, TypeError):
                    length_value = 0

                # Determine primary quantity based on element type
                if element_type in ["ifcwallstandardcase", "ifcslab", "ifcfooting"]:
                    primary_quantity = area_value
                    quantity_key = "area"
                    quantity_unit = "m²"
                elif element_type in ["ifcbeam", "ifccolumn"]:
                    primary_quantity = length_value
                    quantity_key = "length"
                    quantity_unit = "m"
                else:
                    # Default fallback: prioritize area if available, otherwise length
                    if area_value is not None and area_value != 0:
                         primary_quantity = area_value
                         quantity_key = "area"
                         quantity_unit = "m²"
                    elif length_value is not None and length_value != 0:
                         primary_quantity = length_value
                         quantity_key = "length"
                         quantity_unit = "m"
                    else: # If neither is available, default to area 0
                        primary_quantity = 0 
                        quantity_key = "area" 
                        quantity_unit = "m²"
                
                classification_id = element.get("classification_id", element.get("ebkph", "")) # Use ebkph as fallback
                classification_name = element.get("classification_name", "")
                classification_system = element.get("classification_system", "")

                # Create the original_quantity object with both value and type fields
                original_quantity_obj = None
                if original_area is not None:
                    original_quantity_obj = {
                        "value": original_area,
                        "type": "area"
                    }
                elif element.get("original_length") is not None:
                    original_quantity_obj = {
                        "value": element.get("original_length"),
                        "type": "length"
                    }
                
                # Format element for MongoDB saving (aligning with target schema)
                assigned_global_id = element.get("global_id") # Use direct get, handle None later if necessary
                assigned_ifc_class = element.get("type", "Unknown") 
                assigned_name = element.get("name", "Unknown") # Default to Unknown if name is missing
                assigned_type_name = element.get("type_name") # Get type_name
                assigned_properties = element.get("properties", {}) # Get properties

                # --- Process materials - Get directly from parsed data --- START ---
                # The parser should provide a list under the 'materials' key
                materials_from_parser = element.get("materials", []) 
                materials_for_db = []
                if isinstance(materials_from_parser, list):
                    for mat_data in materials_from_parser:
                        # Ensure it's a dictionary and has a name
                        if isinstance(mat_data, dict) and mat_data.get("name"):
                            # Include expected fields, ensure correct types
                            mat_entry = {
                                "name": str(mat_data["name"]),
                                "unit": str(mat_data.get("unit", "m³")) # Default unit if missing
                            }
                            # Add volume if present and numeric
                            vol = mat_data.get("volume")
                            if vol is not None:
                                try:
                                    mat_entry["volume"] = float(vol)
                                except (ValueError, TypeError):
                                    logger.warning(f"Could not convert volume '{vol}' for material '{mat_data['name']}' in element {current_element_id}")
                            # Add fraction if present and numeric
                            frac = mat_data.get("fraction")
                            if frac is not None:
                                try:
                                    mat_entry["fraction"] = float(frac)
                                except (ValueError, TypeError):
                                    logger.warning(f"Could not convert fraction '{frac}' for material '{mat_data['name']}' in element {current_element_id}")
                            
                            materials_for_db.append(mat_entry)
                        else:
                            logger.warning(f"Invalid material format skipped in element {current_element_id}: {mat_data}")
                else:
                    logger.warning(f"Expected 'materials' to be a list in element {current_element_id}, got: {type(materials_from_parser)}")
                # --- Process materials - Get directly from parsed data --- END ---
                
                formatted_element = {
                    "project_id": project_id,
                    "ifc_id": current_element_id, 
                    "global_id": assigned_global_id, 
                    "ifc_class": assigned_ifc_class, 
                    "name": assigned_name, 
                    "type_name": assigned_type_name, 
                    "level": element.get("level", ""), 
                    "quantity": {
                        "value": primary_quantity,
                        "type": quantity_key,
                        "unit": quantity_unit
                    },
                    "original_quantity": original_quantity_obj,  
                    "is_structural": is_structural, 
                    "is_external": is_external, 
                    "classification": { 
                        "id": classification_id,
                        "name": classification_name,
                        "system": classification_system
                    },
                    # Use the directly processed materials list
                    "materials": materials_for_db, 
                    "properties": assigned_properties, 
                    "status": "pending" 
                }
                # Log the formatted element before adding to batch
                logger.debug(f"Formatted element for DB save (ID: {current_element_id}): {json.dumps(formatted_element, default=str)}")
                elements_to_save.append(formatted_element)
            except Exception as e:
                element_identifier = current_element_id if 'current_element_id' in locals() else 'UNKNOWN'
                logger.error(f"Error formatting element {element_identifier} for saving: {e}")
        
        # Save all elements in a single batch
        if elements_to_save:
            success = mongodb.save_elements_batch(elements_to_save, project_id)
            if not success:
                logger.error("Failed to save elements to MongoDB")
                return False
        
        # Send a single project update notification
        try:
            # Create the notification message with desired payload
            notification = {
                "eventType": "PROJECT_UPDATED",
                "timestamp": datetime.now(timezone.utc).isoformat() + "Z", # Notification generation time
                "producer": "plugin-qto",
                "payload": {
                    "project": metadata["project"],      # Original project name
                    "filename": metadata["filename"],     # Original filename
                    "timestamp": metadata["timestamp"],    
                    "fileId": metadata["file_id"],        # Original file ID
                    "elementCount": len(elements_to_save), # Processed element count
                    "dbProjectId": str(project_id)      # DB ID for reference
                },
                "metadata": {
                    "version": "1.0",
                    "correlationId": metadata["file_id"] # Use original file ID as correlation ID
                }
            }

            # Send message to Kafka
            message = json.dumps(notification)
            self.producer.produce(self.topic, message, callback=self.delivery_report)
            self.producer.poll(0)  # Trigger any callbacks
            self.producer.flush(timeout=5)  # Ensure message is delivered

            return True
        except Exception as e:
            logger.error(f"Error sending project update notification to Kafka: {e}")
            return False
    
    def flush(self):
        """Wait for all messages to be delivered."""
        if self.producer is None:
            logger.error("Kafka producer not initialized, cannot flush")
            return False
            
        try:
            remaining = self.producer.flush(timeout=10)
            if remaining > 0:
                logger.warning(f"{remaining} messages still in queue after timeout")
            else:
                logger.info("All messages delivered successfully")
            return remaining == 0
        except Exception as e:
            logger.error(f"Error flushing Kafka messages: {e}")
            return False

    def approve_project_elements(self, project_name: str) -> bool:
        """Approves elements for a project and sends a confirmation notification.
        
        Args:
            project_name: Name of the project to approve
            
        Returns:
            Boolean indicating if the operation was successful
        """
        if self.producer is None:
            logger.error("Kafka producer not initialized, cannot send notification")
            return False
            
        # Initialize MongoDB helper
        mongodb = MongoDBHelper()
        
        # Find project by name
        try:
            if mongodb.db is None:
                logger.error("MongoDB not connected, cannot approve project elements")
                return False
            
            logger.info(f"Looking for project with name: '{project_name}'")
            project = mongodb.db.projects.find_one({"name": project_name})
            if not project:
                # Try case-insensitive search as fallback
                logger.warning(f"Project '{project_name}' not found with exact match, trying case-insensitive search")
                project = mongodb.db.projects.find_one({"name": {"$regex": f"^{re.escape(project_name)}$", "$options": "i"}})
                
            if not project:
                logger.error(f"Project '{project_name}' not found")
                return False
                
            project_id = project["_id"]
            logger.info(f"Found project '{project_name}' with ID: {project_id}")
            
            # Approve elements
            success = mongodb.approve_project_elements(project_id)
            if not success:
                logger.error(f"Failed to approve elements for project '{project_name}'")
                return False
            
            # Send confirmation notification
            try:
                # Create the notification message
                notification = {
                    "eventType": "PROJECT_APPROVED",
                    "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
                    "producer": "plugin-qto",
                    "payload": {
                        "project": project_name,
                        "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
                        "dbProjectId": str(project_id),
                        "status": "active"
                    },
                    "metadata": {
                        "version": "1.0",
                        "correlationId": str(project_id)
                    }
                }

                # Send message to Kafka
                message = json.dumps(notification)
                self.producer.produce(self.topic, message, callback=self.delivery_report)
                self.producer.poll(0)
                self.producer.flush(timeout=5)

                return True
            except Exception as e:
                logger.error(f"Error sending project approval notification to Kafka: {e}")
                return False
                
        except Exception as e:
            logger.error(f"Error approving project elements: {e}")
            return False

def format_ifc_elements_for_qto(project_name: str, 
                               filename: str, 
                               file_id: str, 
                               elements: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Format IFC elements data for QTO Kafka message.
    
    Args:
        project_name: Name of the project or active project from sidebar dropdown
        filename: Name of the IFC file
        file_id: Unique identifier for the file
        elements: List of IFC elements with property data
        
    Returns:
        Dictionary formatted for QTO Kafka message
    """
    from datetime import datetime
    
    timestamp = datetime.now(timezone.utc).isoformat() + "Z"
    
    # Format the QTO message with timestamp and filename as file_id
    qto_data = {
        "project": project_name,
        "filename": filename,
        "timestamp": timestamp,
        "file_id": f"{filename}_{timestamp}",  # Combine filename and timestamp
        "elements": []
    }
    
    for element in elements:
        # Get element type
        element_type = element.get("type", "").lower()
        
        # Check if element is structural based on type
        is_structural = any(s in element_type for s in ["wall", "column", "beam", "slab", "footing"])
        
        # Check if element is external based on common property
        is_external = False
        if "properties" in element:
            # Check for IsExternal property (variations of capitalization)
            for prop_name, prop_value in element["properties"].items():
                if prop_name.lower() == "isexternal" and str(prop_value).lower() in ["true", "1", "yes"]:
                    is_external = True
                    break
        
        # Get the original area - may be stored directly or in properties
        original_area = element.get("original_area")
        if original_area is None and "properties" in element and "original_area" in element["properties"]:
            original_area = element["properties"]["original_area"]
        
        # Get area value
        area_value = element.get("area", 0)
        length_value = element.get("length", 0) # Get length value too

        # Ensure numeric types, default to 0 if conversion fails
        try:
            area_value = float(area_value) if area_value is not None else 0
        except (ValueError, TypeError):
            area_value = 0
        try:
            length_value = float(length_value) if length_value is not None else 0
        except (ValueError, TypeError):
            length_value = 0

        # Determine primary quantity based on element type
        if element_type in ["ifcwallstandardcase", "ifcslab", "ifcfooting"]:
            primary_quantity = area_value
            quantity_key = "area"
            quantity_unit = "m²"
        elif element_type in ["ifcbeam", "ifccolumn"]:
            primary_quantity = length_value
            quantity_key = "length"
            quantity_unit = "m"
        else:
            # Default fallback: prioritize area if available, otherwise length
            if area_value is not None and area_value != 0:
                 primary_quantity = area_value
                 quantity_key = "area"
                 quantity_unit = "m²"
            elif length_value is not None and length_value != 0:
                 primary_quantity = length_value
                 quantity_key = "length"
                 quantity_unit = "m"
            else: # If neither is available, default to area 0
                primary_quantity = 0 
                quantity_key = "area" 
                quantity_unit = "m²"
                
        # Get classification details (assuming they are extracted earlier or set to default)
        # Note: Ensure these are correctly populated if needed. Placeholder defaults used here.
        classification_id = element.get("classification_id", element.get("ebkph", "")) # Use ebkph as fallback
        classification_name = element.get("classification_name", "")
        classification_system = element.get("classification_system", "")

        # Create the original_quantity object with both value and type fields
        original_quantity_obj = None
        if original_area is not None:
            original_quantity_obj = {
                "value": original_area,
                "type": "area"
            }
        elif element.get("original_length") is not None:
            original_quantity_obj = {
                "value": element.get("original_length"),
                "type": "length"
            }
        
        # Format element for QTO
        formatted_element = {
            "id": element.get("id", ""),
            "name": element.get("name", ""), # Add instance name
            "type_name": element.get("type_name"),  # Add type name
            "category": element.get("type", "Unknown"),
            "level": element.get("level", ""),
            "area": area_value,  # Area extracted in main.py based on TARGET_QUANTITIES
            "length": length_value,  # Include length from TARGET_QUANTITIES
            "original_area": original_area,  # Include original_area in output
            "original_quantity": original_quantity_obj,  # Include properly formatted original_quantity
            "is_structural": is_structural,
            "is_external": is_external,
            "ebkph": classification_id,
            "materials": [],
            "classification": {
                "id": classification_id,
                "name": classification_name,
                "system": classification_system
            }
        }
        
        # Simple fallback: If type_name is missing, use the element's name
        # This matches previous behavior before recent changes
        if not formatted_element["type_name"] and formatted_element["name"]:
            formatted_element["type_name"] = formatted_element["name"]
        
        # Ensure area value is numeric (in case it was stored as string)
        if isinstance(formatted_element["area"], str):
            try:
                formatted_element["area"] = float(formatted_element["area"])
            except (ValueError, TypeError):
                formatted_element["area"] = 0
        
        # If area is None, explicitly set to 0 to avoid null values
        if formatted_element["area"] is None:
            formatted_element["area"] = 0
        
        # Extract materials 
        if "material_volumes" in element and element["material_volumes"]:
            for material_name, material_data in element["material_volumes"].items():
                material_entry = {
                    "name": material_name,
                    "unit": "m³"
                }
                
                # Add volume if available
                if "volume" in material_data:
                    material_entry["volume"] = material_data.get("volume", 0)
                
                # Add fraction if available
                if "fraction" in material_data:
                    material_entry["fraction"] = material_data.get("fraction", 0)
                
                formatted_element["materials"].append(material_entry)
        
        # If no materials were found from material_volumes, check for materials array
        if not formatted_element["materials"] and "materials" in element and element["materials"]:
            formatted_element["materials"] = element["materials"]
        
        qto_data["elements"].append(formatted_element)
        
    return qto_data

