# Integration Tests

Testing the backend services.

## Overview

This is a partial test for testing the reaction to a kafka message.
Expected behaviour:

- Download file from minio
- Get metadata
- Forward file and metadata to backend ifc upload endpoint

## Prerequisites

- Docker
- Docker Compose
- Node

## Test Setup

Before we can start the services, we need to set all environment variables in the docker-compose.yml file.

Also create a '.env' file in the `/test` directory and add the following variables matching the ones specified in the docker-compose:

```bash
KAFKA_BROKER=localhost:9092
KAFKA_IFC_TOPIC=ifc-files
MINIO_ENDPOINT=localhost:9000
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=ROOTUSER
MINIO_SECRET_KEY=CHANGEME123
BACKEND_URL=http://localhost:8000
```

### Add an IFC File to the Test

1. Create a new directory called `assets` in the `integration-tests` directory.
2. Add an IFC file to the `assets` directory.
3. Rename the file to `test.ifc`.

### Start the Services

Open a new terminal window in the `integration-tests` directory:

```bash
cd test
docker compose up --build -d
```

This will start all the necessary services:

- MinIO
  - Used to upload a test IFC file to
- Kafka and Zookeeper
  - Messageging system
  - Topics used in test (not the actual topic names):
    - New ifc file available
- qto_ifc-msg (IFC downloading service)
  - Listening to Kafka Topic
  - Downloading IFC file
  - Getting metadata
  - Forwarding IFC to backend

You should now see all the containers running for the integration tests services.

## Running the IFC Integration Tests

### Open the MinIO Console (Optional)

In your browser, go to `localhost:9001` to see the MinIO console.

- Login using the credentials you specified in the `.env` file (default: ROOTUSER/CHANGEME123)
- Before running tests, you may want to delete any existing data (this is optional):
  - Delete all items in the `ifc-files` bucket and the bucket itself

### Trigger the Test

Open a terminal in the root directory (qto_ifc-msg/) directory and run:

```bash
npm test
```

Watch the output of the terminal. It should tell you that the test was passed. This takes up to a minute or two.

Here's what you need to watch out for to verify the test passed:
