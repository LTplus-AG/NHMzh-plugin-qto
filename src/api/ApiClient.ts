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
  type_name?: string | null;
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
  length?: number | null;
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
  // Use production URL if building for production, otherwise use local URL
  const isProd = import.meta.env.PROD;
  const baseUrl = isProd
    ? import.meta.env.VITE_API_URL
    : import.meta.env.VITE_API_URL_LOCAL;

  // Explicitly define the local fallback
  const localFallbackUrl = "http://localhost:8000";

  // Log the selected URL for debugging
  const finalUrl = baseUrl || (isProd ? "/api" : localFallbackUrl); // Use /api for prod fallback, explicit URL for local
  console.log(`Using API Base URL: ${finalUrl}`);

  // Return the selected URL or fallback
  return finalUrl;
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
   * Get list of available project names
   * @returns List of project names
   */
  async listProjects(): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/projects/`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to list projects: ${response.statusText} - ${errorText}`
      );
    }
    return await response.json();
  }

  /**
   * Get parsed IFC elements for a project
   * @param projectName - The name of the project
   * @returns List of IFC elements for the project
   */
  async getProjectElements(projectName: string): Promise<IFCElement[]> {
    // Ensure project name is URL encoded
    const encodedProjectName = encodeURIComponent(projectName);
    // Define the endpoint outside the try block for broader scope
    const endpoint = `/projects/${encodedProjectName}/elements/`;
    try {
      console.log(`Fetching elements using endpoint: ${endpoint}`);
      const response = await fetch(`${this.baseUrl}${endpoint}`);

      if (response.ok) {
        const elements = await response.json();
        console.log(
          `Successfully retrieved ${elements.length} elements using ${endpoint}`
        );
        return elements;
      } else {
        console.error(
          // Changed to error for clarity
          `Endpoint ${endpoint} returned status ${response.status}. Returning empty array.`
        );
        return [];
      }
    } catch (error) {
      // Handle potential fetch errors
      console.error(
        // Changed to error for clarity
        `Error fetching elements for '${projectName}' from ${endpoint}: ${error}`
      );
      // Optionally re-throw or handle specific error types if needed
      // if (error instanceof TypeError && error.message.includes("fetch")) { ... }
      return []; // Return empty array on error
    }
  }
}

// Create and export a default instance
const apiClient = new QTOApiClient();
export default apiClient;
