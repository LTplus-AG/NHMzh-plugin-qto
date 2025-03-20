from confluent_kafka import Producer
import json
import logging
import os
import socket
import time
from typing import Dict, Any, List
import re

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
        
        logger.info(f"QTO Kafka Producer initializing with bootstrap servers: {self.bootstrap_servers}")
        
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
                    logger.info(f"Successfully resolved hostname: {host}")
                except socket.gaierror:
                    logger.warning(f"Could not resolve hostname: {host}. Kafka connections may fail.")
                
                # Create the producer
                self.producer = Producer({'bootstrap.servers': self.bootstrap_servers})
                
                # Test the connection by listing topics (will raise exception if can't connect)
                self.producer.list_topics(timeout=5)
                
                logger.info(f"QTO Kafka Producer initialized successfully")
                logger.info(f"Publishing to topic: {self.topic}")
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
        """
        if self.producer is None:
            logger.error("Kafka producer not initialized, cannot send message")
            return False
            
        try:
            message = json.dumps(qto_data)
            self.producer.produce(self.topic, message, callback=self.delivery_report)
            self.producer.poll(0)  # Trigger any callbacks
            logger.info(f"Sent QTO data for project {qto_data.get('project', 'unknown')}")
            return True
        except Exception as e:
            logger.error(f"Error sending QTO data to Kafka: {e}")
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
        project_name: Name of the project
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
        for pset_name in [f"Pset_{element_type.replace('ifc', '').capitalize()}Common", "Pset_WallCommon"]:
            pset_common = element.get("properties", {}).get(pset_name, {})
            if pset_common.get("IsExternal") in [True, "True", "true", "1"]:
                is_external = True
                break
        
        # Get EBKPH from properties
        ebkph = ""
        for prop_name, value in element.get("properties", {}).items():
            if "code" in prop_name.lower() and "material" in prop_name.lower():
                ebkph = value
                break
                
        # If no EBKPH in properties, try to get it from classification if it's an EBKP code
        if not ebkph and element.get("classification_system") == "EBKP" and element.get("classification_id"):
            ebkph = element.get("classification_id")
            logger.debug(f"Using EBKP classification ID as EBKPH: {ebkph}")
        
        # Extract area from properties if available - first look for net, then gross
        area = 0.0
        
        # First, try to find properties with net area
        for prop_name, value in element.get("properties", {}).items():
            if "area" in prop_name.lower() and "net" in prop_name.lower():
                try:
                    area = float(value)
                    break
                except (ValueError, TypeError):
                    pass
        
        # If no net area found, look for gross area
        if area <= 0.0:
            for prop_name, value in element.get("properties", {}).items():
                if "area" in prop_name.lower() and "gross" in prop_name.lower():
                    try:
                        area = float(value)
                        break
                    except (ValueError, TypeError):
                        pass
        
        # Process materials - consolidate by base name
        materials = []
        if element.get("material_volumes"):
            # Consolidate materials with same base name (without numbering)
            consolidated_materials = {}
            
            for mat_name, mat_info in element.get("material_volumes").items():
                # Extract base material name (removing suffixes like " (1)", " (2)", etc.)
                base_name = re.sub(r'\s*\(\d+\)\s*$', '', mat_name)
                
                # Create or update the entry in the consolidated materials dictionary
                if base_name not in consolidated_materials:
                    consolidated_materials[base_name] = {
                        "name": base_name,
                        "fraction": mat_info.get("fraction", 0),
                        "volume": mat_info.get("volume", 0)
                    }
                else:
                    # Add to existing material
                    consolidated_materials[base_name]["fraction"] += mat_info.get("fraction", 0)
                    consolidated_materials[base_name]["volume"] += mat_info.get("volume", 0)
            
            # Convert the consolidated materials dictionary to a list
            materials = list(consolidated_materials.values())
        
        # Build the element data structure
        element_data = {
            "id": element.get("global_id", ""),
            "category": element_type,
            "level": element.get("level") or element.get("properties", {}).get("Pset_BuildingStoreyElevation", {}).get("Name", "unknown"),
            "area": area,
            "is_structural": is_structural,
            "is_external": is_external,
            "ebkph": ebkph,
            "materials": materials
        }
        
        # Add classification information if available
        if element.get("classification_id") or element.get("classification_name") or element.get("classification_system"):
            # Handle the case when ID is missing but we have name+system
            classification_id = element.get("classification_id", "")
            classification_name = element.get("classification_name", "")
            classification_system = element.get("classification_system", "")
            
            # Create classification object for QTO data
            element_data["classification"] = {
                "id": classification_id,
                "name": classification_name,
                "system": classification_system
            }
            
            # Set ebkph if it's an EBKP classification with ID
            if classification_system == "EBKP" and classification_id and not element_data["ebkph"]:
                element_data["ebkph"] = classification_id
                logger.debug(f"Set ebkph value to EBKP code in QTO data: {element_data['ebkph']}")
            # If we have EBKP with no ID but a name, try to extract a code
            elif classification_system == "EBKP" and not classification_id and classification_name and not element_data["ebkph"]:
                # Use the name to code mapping for common building elements
                name_to_code = {
                    "decke": "C4.1",
                    "dach": "G2",
                    "innenwand": "C2.1",
                    "aussenwand": "C2.2",
                    "boden": "C3.1",
                    "wasser": "I1",
                    "gas": "I2",
                    "luft": "I4",
                    "sanitär": "I1",
                    "heizung": "I3",
                    "lüftung": "I4",
                    "klima": "I5",
                    "elektro": "J"
                }
                
                name_lower = classification_name.lower()
                for term, code in name_to_code.items():
                    if term in name_lower:
                        element_data["classification"]["id"] = code
                        element_data["ebkph"] = code
                        logger.debug(f"QTO: Mapped classification name '{classification_name}' to code '{code}'")
                        break
        
        qto_data["elements"].append(element_data)
    
    return qto_data

