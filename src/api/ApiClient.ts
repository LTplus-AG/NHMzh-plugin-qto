/**
 * QTO API Client
 * Auto-generated TypeScript client for the QTO IFC Parser API
 */

// API response types based on the backend schema
export interface IFCElement {
  id: string;
  global_id: string;
  type: string;
  name: string;
  description?: string | null;
  properties: Record<string, any>;
  material_volumes?: Record<
    string,
    {
      fraction?: number;
      volume?: number;
      width?: number;
    }
  > | null;
  volume?: {
    net: number | null;
    gross: number | null;
  };
  level?: string | null;
  classification_id?: string | null;
  classification_name?: string | null;
  classification_system?: string | null;
  // Additional properties for QTO formatted elements
  area?: number | null;
  category?: string;
  is_structural?: boolean;
  is_external?: boolean;
  ebkph?: string;
  materials?: Array<{
    name: string;
    volume?: number;
    unit?: string;
  }>;
}

export interface ModelUploadResponse {
  message: string;
  model_id: string;
  filename: string;
  element_count: number;
  entity_types: Record<string, number>;
}

export interface ModelInfo {
  model_id: string;
  filename: string;
  element_count: number;
  entity_counts: Record<string, number>;
}

export interface ModelDeleteResponse {
  message: string;
}

export interface QTOResponse {
  message: string;
  model_id: string;
  element_count: number;
  kafka_status: string;
}

export interface HealthResponse {
  status: string;
  kafka: string;
  models_in_memory: number;
  ifcopenshell_version: string;
}

// Get API URL from environment or use default
const getApiBaseUrl = () => {
  // For Vite, environment variables must be prefixed with VITE_
  if (import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // Fallback to default
  return "/api";
};

/**
 * QTO API Client Class
 */
export class QTOApiClient {
  private baseUrl: string;

  /**
   * Creates a new QTO API client
   * @param baseUrl - The base URL of the API (default from environment or "/api")
   */
  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || getApiBaseUrl();
    console.log(`API Client initialized with base URL: ${this.baseUrl}`);
  }

  /**
   * Health check endpoint
   * @returns Health status of the API
   */
  async getHealth(): Promise<HealthResponse> {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }
    return await response.json();
  }

  /**
   * Upload an IFC file
   * @param file - The IFC file to upload
   * @returns Information about the uploaded model
   */
  async uploadIFC(file: File): Promise<ModelUploadResponse> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch(`${this.baseUrl}/upload-ifc/`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload IFC file: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Get IFC elements from a model
   * @param modelId - The ID of the model to get elements from
   * @returns List of IFC elements
   */
  async getIFCElements(modelId: string): Promise<IFCElement[]> {
    const response = await fetch(`${this.baseUrl}/ifc-elements/${modelId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch IFC elements: ${response.statusText}`);
    }
    return await response.json();
  }

  /**
   * Get QTO elements from a model
   * @param modelId - The ID of the model to get QTO elements from
   * @returns QTO elements array
   */
  async getQTOElements(modelId: string): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/qto-elements/${modelId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch QTO elements: ${response.statusText}`);
    }
    return await response.json();
  }

  /**
   * List all models
   * @returns List of model information
   */
  async listModels(): Promise<ModelInfo[]> {
    const response = await fetch(`${this.baseUrl}/models`);
    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.statusText}`);
    }
    return await response.json();
  }

  /**
   * Delete a model
   * @param modelId - The ID of the model to delete
   * @returns Confirmation message
   */
  async deleteModel(modelId: string): Promise<ModelDeleteResponse> {
    const response = await fetch(`${this.baseUrl}/models/${modelId}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error(`Failed to delete model: ${response.statusText}`);
    }
    return await response.json();
  }

  /**
   * Send QTO data to Kafka
   * @param modelId - The ID of the model to send to Kafka
   * @param updatedElements - Optional list of elements with updated values (for user edits)
   * @param projectName - Optional project name to use (from sidebar dropdown)
   * @returns The result of the operation
   */
  async sendQTO(
    modelId: string,
    updatedElements?: IFCElement[],
    projectName?: string
  ): Promise<QTOResponse> {
    // Create URL with model_id parameter
    const url = `${this.baseUrl}/send-qto/?model_id=${modelId}`;

    // Log if we're sending updated elements
    if (updatedElements && updatedElements.length > 0) {
      console.log(
        `Sending ${updatedElements.length} elements with updates to the backend`
      );

      // Check for any edited elements (look for non-zero areas)
      const editedElements = updatedElements.filter(
        (el) => el.area !== 0 && el.area !== null && el.area !== undefined
      );
      if (editedElements.length > 0) {
        console.log(
          `Found ${editedElements.length} elements with non-zero areas`
        );
        console.log("Sample element with non-zero area:", editedElements[0]);
      }
    }

    // Log if we're using a specific project name
    if (projectName) {
      console.log(`Using project name from sidebar: ${projectName}`);
    }

    // Create request configuration
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // Include project name in the request if provided
    const requestBody = {
      ...(updatedElements ? { elements: updatedElements } : {}),
      ...(projectName ? { project: projectName } : {}),
    };

    console.log(
      "Request body:",
      JSON.stringify(requestBody).substring(0, 100) + "..."
    ); // Log truncated body

    const options: RequestInit = {
      method: "POST",
      headers: headers,
      body: JSON.stringify(requestBody),
    };

    if (options.body) {
      console.log("Request payload size:", options.body.length, "bytes");
    }

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Error response:", errorText);
        throw new Error(`Failed to send QTO data: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Network error:", error);
      throw error;
    }
  }
}

// Create and export a default instance
const apiClient = new QTOApiClient();
export default apiClient;
