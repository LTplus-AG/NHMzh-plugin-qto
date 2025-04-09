# IFC Kafka Message Consumer

This service listens for new IFC files, downloads them from MinIO, gets some metadata about the object and makes a POST request to the 'backend' services /upload endpoint.
