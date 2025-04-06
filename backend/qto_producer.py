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
from datetime import datetime

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
    def __init__(self, uri=None, db_name=None, max_retries=3, retry_delay=2):
        """Initialize MongoDB connection.
        
        Args:
            uri: MongoDB connection string (defaults to environment variable)
            db_name: Database name (defaults to environment variable)
            max_retries: Maximum number of connection retries
            retry_delay: Delay between retries in seconds
        """
        # Get configuration from environment variables or use default values
        self.uri = uri or os.getenv('MONGODB_URI', 'mongodb://admin:secure_password@mongodb:27017')
        self.db_name = db_name or os.getenv('MONGODB_DATABASE', 'qto')
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.client = None
        self.db = None    
        # Initialize MongoDB connection with retries
        self._initialize_connection()
    
    def _initialize_connection(self):
        """Initialize MongoDB connection with retry logic."""
        retries = 0
        while retries <= self.max_retries:
            try:
                # Create the MongoDB client
                self.client = MongoClient(self.uri)
                # Test the connection by pinging the server
                self.client.admin.command('ping')
                # Get database
                self.db = self.client[self.db_name]
                
                logger.info(f"MongoDB connection initialized successfully to database {self.db_name}")
                
                # Ensure collections exist
                self._ensure_collections()
                return
            except Exception as e:
                retries += 1
                if retries <= self.max_retries:
                    logger.warning(f"Failed to connect to MongoDB (attempt {retries}/{self.max_retries}): {e}")
                    time.sleep(self.retry_delay)
                else:
                    logger.error(f"Failed to connect to MongoDB after {self.max_retries} attempts: {e}")
    
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
                project_data['created_at'] = datetime.utcnow()
            
            project_data['updated_at'] = datetime.utcnow()
            
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
                element_data['created_at'] = datetime.utcnow()
            
            element_data['updated_at'] = datetime.utcnow()
            
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
                        element['created_at'] = datetime.utcnow()
                    element['updated_at'] = datetime.utcnow()
                    if isinstance(element.get('project_id'), str):
                        element['project_id'] = ObjectId(element['project_id'])
                
                # Insert all elements
                result = self.db.elements.insert_many(elements)
                logger.info(f"Inserted {len(result.inserted_ids)} new elements for project {project_id}")
            
            return True
                    
        except Exception as e:
            logger.error(f"Error in save_elements_batch: {e}")
            return False

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
            # Check if we're in Docker or local environment
            if is_running_in_docker():
                # Use internal Docker network hostname
                self.bootstrap_servers = os.getenv('KAFKA_BROKER', 'broker:29092')
            else:
                # Use localhost with the external port when running locally
                # This maps to the port exposed by Docker to the host
                self.bootstrap_servers = os.getenv('KAFKA_LOCAL_BROKER', 'localhost:9092')
        
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
        project_id = mongodb.save_project({
            "name": metadata["project"],
            "description": f"Project for {metadata['filename']}",
            "metadata": {
                "file_id": metadata["file_id"],
                "filename": metadata["filename"]
            }
        })
        
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

                # Determine original quantity value based on quantity_key
                original_quantity_value = None
                if quantity_key == "area":
                    original_quantity_value = original_area # Already fetched
                elif quantity_key == "length":
                    # Need to fetch original_length if it exists
                    original_quantity_value = element.get("original_length")
                    if original_quantity_value is None and "original_length" in properties:
                         original_quantity_value = properties["original_length"]
                
                # Convert original quantity to float if possible
                if original_quantity_value is not None:
                    try:
                        original_quantity_value = float(original_quantity_value)
                    except (ValueError, TypeError):
                        # Log conversion error, but keep None for the DB
                        logger.warning(f"Could not convert original_quantity_value '{original_quantity_value}' to float for element {current_element_id}. Storing as null.")
                        original_quantity_value = None 

                # Format element for MongoDB saving (aligning with target schema)
                assigned_global_id = element.get("global_id") # Use direct get, handle None later if necessary
                assigned_ifc_class = element.get("type", "Unknown") 
                assigned_name = element.get("name", "Unknown") # Default to Unknown if name is missing
                assigned_type_name = element.get("type_name") # Get type_name
                assigned_properties = element.get("properties", {}) # Get properties

                # --- Process materials --- START ---
                material_volumes_dict = element.get("material_volumes") # Get the dict from parser
                materials_for_db = []
                if isinstance(material_volumes_dict, dict):
                    for mat_name, mat_data in material_volumes_dict.items():
                        # Ensure mat_data is a dictionary before accessing keys
                        if isinstance(mat_data, dict):
                            mat_entry = {
                                "name": mat_name,
                                "unit": "m³" # Assuming m³ for volume-based materials
                            }
                            if "volume" in mat_data:
                                mat_entry["volume"] = mat_data["volume"]
                            if "fraction" in mat_data:
                                mat_entry["fraction"] = mat_data["fraction"]
                            # Optionally add width if present and needed
                            # if "width" in mat_data:
                            #     mat_entry["width"] = mat_data["width"]
                            materials_for_db.append(mat_entry)
                        else:
                             # Log unexpected format for mat_data
                             # Use the defined current_element_id
                             logger.warning(f"Unexpected format for material data {mat_name} in element {current_element_id}: {mat_data}")
                elif material_volumes_dict is not None: 
                    # Log if material_volumes is not a dict but also not None
                    # Use the defined current_element_id
                    logger.warning(f"material_volumes for element {current_element_id} is not a dictionary: {material_volumes_dict}")
                
                formatted_element = {
                    "project_id": project_id,
                    "ifc_id": current_element_id, # Use the defined current_element_id
                    "global_id": assigned_global_id, # Use original GlobalId (fallback to id)
                    "ifc_class": assigned_ifc_class, # Rename 'type' to 'ifc_class'
                    "name": assigned_name, # Instance Name (fallback to type, then Unknown)
                    "type_name": assigned_type_name, # Type Name (e.g., CW 200mm Concrete)
                    "level": element.get("level", ""), # Top-level field
                    "quantity": {
                        "value": primary_quantity,
                        "type": quantity_key,
                        "unit": quantity_unit
                    },
                    "original_quantity": { 
                        "value": original_quantity_value,
                        "type": quantity_key # Use the same type as the primary quantity
                    } if original_quantity_value is not None else None, # Nested object
                    "is_structural": is_structural, # Top-level field
                    "is_external": is_external, # Top-level field
                    "classification": { # Top-level object
                        "id": classification_id,
                        "name": classification_name,
                        "system": classification_system
                    },
                    "materials": materials_for_db, # Assign the processed list
                    "properties": assigned_properties, # Assign parsed properties
                    "status": "active" # Keep status
                }
                elements_to_save.append(formatted_element)
            except Exception as e:
                # Use current_element_id if available, otherwise use a placeholder
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
            # Create a simplified notification message
            notification = {
                "eventType": "PROJECT_UPDATED",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "producer": "plugin-qto",
                "payload": {
                    "projectId": str(project_id),
                    "projectName": metadata["project"],
                    "elementCount": len(elements_to_save)
                },
                "metadata": {
                    "version": "1.0",
                    "correlationId": metadata["file_id"]
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
    
    timestamp = datetime.utcnow().isoformat() + "Z"
    
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

        # Format element for QTO
        formatted_element = {
            "id": element.get("id", ""),
            "category": element.get("type", "Unknown"),
            "level": element.get("level", ""),
            "area": area_value,  # Area extracted in main.py based on TARGET_QUANTITIES
            "length": length_value,  # Include length from TARGET_QUANTITIES
            "original_area": original_area,  # Include original_area in output
            "is_structural": is_structural,
            "is_external": is_external,
            "ebkph": classification_id,
            "type_name": element.get("type_name"),  # Include type_name in the output
            "materials": [],
            "classification": {
                "id": classification_id,
                "name": classification_name,
                "system": classification_system
            }
        }
        
        # If type_name is still None, try to extract from name as fallback (many IFC exporters include type in name)
        if not formatted_element["type_name"] and ":" in element.get("name", ""):
            name_parts = element.get("name", "").split(":")
            if len(name_parts) >= 2:
                # Use everything before the last colon+number pattern as type name
                type_part = ":".join(name_parts[:-1]) if name_parts[-1].strip().isdigit() else ":".join(name_parts)
                formatted_element["type_name"] = type_part
        
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

