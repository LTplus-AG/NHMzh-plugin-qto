// This implements integration tests for IFC file processing.
// It is designed to perform a full end-to-end test of the IFC file processing pipeline.
// It adds IFC files to MinIO directly and sends them to the Kafka topic.
// Then it waits for the IFC consumer to convert the IFC files to fragments and save them to MinIO.

import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import { Kafka, Producer } from "kafkajs";
import { Client as MinioClient } from "minio";
import * as http from "http";

// Variables that would be in the Go 'var' block
const kafkaBroker = "localhost:9092"; // hardcoded for the test because the .env uses 'docker-compose' service name
let topic: string;
let ifcBucket: string;
let messages: TestFileData[];
let minioClient: MinioClient;
let mockServer: http.Server;
const receivedRequests: unknown[] = [];

// TestFileData class (equivalent to the Go struct)
interface TestFileData {
  project: string;
  filenameOriginal: string;
  fileNameUUID: string;
  timestamp: string;
}

// Helper functions for environment variables
function getEnv(key: string, defaultValue: string): string {
  const value = process.env[key];
  if (!value) {
    console.log(`Environment variable ${key} not set, using default value`);
    return defaultValue;
  }
  return value;
}

// Add this helper function near the top of the file, after getEnv
function extractPortFromUrl(url: string): number {
  try {
    const urlObj = new URL(url);
    return parseInt(urlObj.port) || (urlObj.protocol === "https:" ? 443 : 80);
  } catch (error) {
    console.error(`Failed to parse URL: ${url}`, error);
    return 8000; // Default fallback
  }
}

// Create mock HTTP server to capture requests from the tested service
function createMockHttpServer(port: number = 8000): http.Server {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", () => {
      // Store the request for later inspection
      const requestData = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: body,
      };

      receivedRequests.push(requestData);
      console.log(
        `Mock server received request: ${JSON.stringify(requestData, null, 2)}`
      );

      // Send a success response
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ status: "success", message: "Request received" })
      );
    });
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(
      `Mock HTTP server started on port ${port}, listening on all interfaces`
    );
  });

  return server;
}

// Initialize function (equivalent to Go's init)
function initialize(): void {
  // Load environment variables from .env file
  const envPath = path.join(__dirname, ".env");
  console.log(`Loading environment variables from ${envPath}`);

  try {
    dotenv.config({ path: envPath });
  } catch (err) {
    console.log(`Error loading .env file: ${err}`);
  }

  // Read environment variables
  topic = getEnv("KAFKA_IFC_TOPIC", "ifc-files");
  ifcBucket = getEnv("MINIO_IFC_BUCKET", "ifc-files");

  // Log all environment variables
  console.log(`KAFKA_BROKER: ${kafkaBroker}`);
  console.log(`KAFKA_IFC_TOPIC: ${topic}`);
  console.log(`MINIO_IFC_BUCKET: ${ifcBucket}`);

  // Initialize messages
  messages = [
    newTestFileData("project1", "file1.ifc"),
    // newTestFileData('project2', 'file2.ifc'),
    // newTestFileData('project1', 'file3.ifc'),
  ];

  // Initialize MinIO client
  const minioEndpoint = "localhost";
  const minioPort = 9000;
  const accessKeyID = getEnv("MINIO_ACCESS_KEY", "ROOTUSER");
  const secretAccessKey = getEnv("MINIO_SECRET_KEY", "CHANGEME123");
  const useSSL = getEnv("MINIO_USE_SSL", "false") === "true";

  minioClient = new MinioClient({
    endPoint: minioEndpoint,
    port: minioPort,
    useSSL: useSSL,
    accessKey: accessKeyID,
    secretKey: secretAccessKey,
  });

  // Get backend URL and extract port for mock server
  const backendUrl = getEnv("BACKEND_URL", "http://localhost:8000");
  const backendPort = extractPortFromUrl(backendUrl);
  console.log(
    `Using backend URL: ${backendUrl}, starting mock server on port: ${backendPort}`
  );

  // Start mock HTTP server
  mockServer = createMockHttpServer(backendPort);
}

function newTestFileData(project: string, filename: string): TestFileData {
  const timestamp = new Date().toISOString();
  console.log(timestamp);
  const fileUUID = uuidv4();
  return {
    project: project,
    filenameOriginal: filename,
    fileNameUUID: `${fileUUID}.ifc`,
    timestamp: timestamp,
  };
}

// Ensure the MinIO bucket exists
async function ensureMinIOBucketExists(): Promise<void> {
  try {
    const exists = await minioClient.bucketExists(ifcBucket);

    if (!exists) {
      await minioClient.makeBucket(ifcBucket, "us-east-1");
      console.log(`Created bucket: ${ifcBucket}`);
    }
  } catch (err) {
    throw new Error(`Failed to check/create bucket: ${err}`);
  }
}

// Create Kafka producer
async function createKafkaProducer(): Promise<Producer> {
  const kafka = new Kafka({
    clientId: "ifc-test-client",
    brokers: [kafkaBroker],
  });

  const producer = kafka.producer();
  await producer.connect();
  return producer;
}

async function uploadIfcFilesToMinio(): Promise<void> {
  // Ensure the bucket exists
  await ensureMinIOBucketExists();

  // Use the user-provided file instead of the default test file
  const filePath =
    "C:\\Users\\LouisTrümpler\\Dropbox\\01_Projekte\\120_NHMzh\\4_DT_random_C_ebkp.ifc";

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  console.log(`Reading IFC file from: ${filePath}`);
  const content = fs.readFileSync(filePath);

  for (const msg of messages) {
    await minioClient.putObject(
      ifcBucket,
      msg.fileNameUUID,
      content,
      content.length,
      {
        "Content-Type": "application/octet-stream",
        "X-Amz-Meta-Project-Name": msg.project,
        "X-Amz-Meta-Filename": msg.filenameOriginal,
        "X-Amz-Meta-Created-At": msg.timestamp,
      }
    );

    console.log(
      `Uploaded file to MinIO: ${msg.fileNameUUID}, size: ${content.length} with metadata`
    );
  }
}

async function sendKafkaMessages(): Promise<void> {
  // Initialize Kafka producer
  const kafkaProducer = await createKafkaProducer();

  try {
    for (const msg of messages) {
      // Create a simple download link message
      const minioEndpoint = getEnv("MINIO_HOST", "minio");
      const minioPort = getEnv("MINIO_PORT", "9000");
      const downloadLink = `http://${minioEndpoint}:${minioPort}/${ifcBucket}/${msg.fileNameUUID}`;

      console.log(`Created download link: ${downloadLink}`);

      // Send simple message to Kafka with just the download link
      await kafkaProducer.send({
        topic: topic,
        messages: [
          {
            key: Buffer.from(msg.project),
            value: Buffer.from(downloadLink),
          },
        ],
      });

      console.log(`Sent message to Kafka topic '${topic}': ${downloadLink}`);
    }
  } finally {
    await kafkaProducer.disconnect();
  }
}

async function main(): Promise<void> {
  initialize();

  console.log(
    "Adding IFC files to MinIO directly and sending Kafka messages..."
  );
  try {
    await uploadIfcFilesToMinio();

    // Add delay to ensure the mock server is ready
    console.log("Waiting for mock server to be ready...");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    await sendKafkaMessages();
  } catch (err) {
    console.error(
      `Error adding IFC files to MinIO and sending Kafka messages: ${err}`
    );
    process.exit(1);
  }

  // sleep for 10 seconds
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("Checking received HTTP requests...");
  console.log(`Total requests received: ${receivedRequests.length}`);

  if (receivedRequests.length === 0) {
    console.error("No HTTP requests were received by the mock server");
    console.error("Please ensure that:");
    console.error(
      "1. The qto-ifc-msg service is running: docker compose -f docker-compose.dev.yml up -d qto-ifc-msg"
    );
    console.error(
      "2. The service is correctly connecting to Kafka broker service (check logs for connection errors)"
    );
    console.error("3. The service can resolve the minio hostname in the URL");
    console.error(
      "4. The IFC file format is valid and can be processed by the service"
    );
    console.error("");
    console.error("Try these troubleshooting steps:");
    console.error(
      "A. Check the logs: docker logs nhmzh-qto-ifc-msg-1 --follow"
    );
    console.error(
      "B. Restart the service: docker compose -f docker-compose.dev.yml restart qto-ifc-msg"
    );
    console.error(
      "C. Try a different IFC file if the current one might be causing format issues"
    );
    process.exit(1);
  }

  // Close the mock server
  mockServer.close(() => {
    console.log("Mock HTTP server closed");
  });
}

// Run the main function
main().catch(console.error);
