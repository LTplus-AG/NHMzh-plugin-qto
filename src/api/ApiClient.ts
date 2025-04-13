import { BatchElementData } from "../types/batchUpdateTypes";

// <<< ADDED: Interface for nested quantity data >>>
export interface QuantityData {
  value?: number | null;
  type?: "area" | "length" | "volume" | string | null; // Allow specific types + string
  unit?: string | null;
}

// <<< ADDED: Interface for nested classification data >>>
export interface ClassificationData {
  id?: string | null;
  name?: string | null;
  system?: string | null;
}

// API response types based on the backend schema
export interface IFCElement {
  id: string;
  global_id: string | null; // Allow null from backend
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
  level?: string | null;
  // Flat classification fields (may be redundant if nested is always used)
  classification_id?: string | null;
  classification_name?: string | null;
  classification_system?: string | null;
  // Nested Classification
  classification?: ClassificationData | null; // <<< ADDED nested classification
  // Flat quantity fields (keep for potential backward compatibility or direct use)
  area?: number | null;
  volume?: number | null; // Add volume if backend sends it flat
  length?: number | null;
  // Nested quantity fields <<< UPDATED to use QuantityData >>>
  quantity?: QuantityData | null;
  original_quantity?: QuantityData | null;
  // Flat original quantities (keep for potential backward compatibility)
  original_area?: number | null;
  original_volume?: number | null; // Add original volume if backend sends it flat
  original_length?: number | null;
  // Other fields
  category?: string;
  is_structural?: boolean;
  is_external?: boolean;
  ebkph?: string;
  materials?: Array<{
    name: string;
    volume?: number;
    unit?: string;
    fraction?: number; // <<< ADD fraction if backend sends it
  }>;
  status?: "pending" | "active" | null;
  is_manual?: boolean;
}

// <<< START NEW METADATA INTERFACE >>>
export interface ProjectMetadata {
  filename?: string | null;
  file_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  element_count?: number | null;
}
// <<< END NEW METADATA INTERFACE >>>

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

  /**
   * Get metadata for a specific project
   * @param projectName - The name of the project
   * @returns Project metadata object
   */
  async getProjectMetadata(projectName: string): Promise<ProjectMetadata> {
    const encodedProjectName = encodeURIComponent(projectName);
    const endpoint = `/projects/${encodedProjectName}/metadata/`;
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`);
      if (!response.ok) {
        // Handle non-OK responses (e.g., 404 Not Found)
        const errorText = await response.text();
        console.error(
          `Failed to fetch metadata for '${projectName}': ${response.status} - ${errorText}`
        );
        // Return an empty object or throw an error based on desired handling
        return {}; // Returning empty object for now
      }
      const metadata = await response.json();
      console.log(
        `Successfully retrieved metadata for project '${projectName}':`,
        metadata
      );
      return metadata;
    } catch (error) {
      console.error(
        `Network or other error fetching metadata for '${projectName}': ${error}`
      );
      // Return an empty object or throw an error
      return {}; // Returning empty object on error
    }
  }

  /**
   * Approve project elements AND optionally update quantities
   * @param projectName - The name of the project to approve
   * @param updates - Optional list of element updates [{ element_id: string, new_quantity: { value: number, type: string, unit: string } }]
   * @returns Response with operation status
   */
  async approveProjectElements(
    projectName: string,
    updates?: Array<{
      element_id: string;
      new_quantity: { value?: number | null; type?: string; unit?: string };
    }>
  ): Promise<{ status: string; message: string; project: string }> {
    const encodedProjectName = encodeURIComponent(projectName);
    const endpoint = `/projects/${encodedProjectName}/approve/`;
    try {
      console.log(
        `Approving elements (and potentially updating ${
          updates?.length || 0
        } quantities) for project: ${projectName}`
      );
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: updates ? JSON.stringify(updates) : undefined, // Send updates in body if provided
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to approve project: ${response.statusText} - ${errorText}`
        );
      }

      const result = await response.json();
      console.log(`Successfully approved elements for project ${projectName}`);
      return result;
    } catch (error) {
      console.error(
        `Error approving elements for project '${projectName}': ${error}`
      );
      throw error;
    }
  }

  // <<< ADDED: Batch Update/Create Elements >>>
  async batchUpdateElements(
    projectName: string,
    elements: BatchElementData[]
  ): Promise<any> {
    // Define a more specific return type if needed
    try {
      const response = await fetch(
        `${this.baseUrl}/projects/${encodeURIComponent(
          projectName
        )}/elements/batch-update`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ elements }), // Wrap elements in the expected request body structure
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to batch update elements for project '${projectName}': ${response.statusText} - ${errorText}`
        );
      }

      const result = await response.json();
      console.log(
        `Successfully batch updated elements for project ${projectName}`
      );
      return result;
    } catch (error) {
      console.error(
        `Error batch updating elements for project '${projectName}': ${error}`
      );
      throw error;
    }
  }

  // <<< ADDED: Get Target IFC Classes >>>
  async getTargetIfcClasses(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/ifc-classes`, {
        method: "GET",
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to fetch target IFC classes: ${response.statusText} - ${errorText}`
        );
      }
      const result = await response.json();
      console.log("Successfully fetched target IFC classes:", result);
      return result || []; // Return empty array if null/undefined
    } catch (error) {
      console.error("Error fetching target IFC classes:", error);
      throw error;
    }
  }

  // <<< ADDED: Delete Manual Element >>>
  async deleteElement(projectName: string, elementId: string): Promise<any> {
    try {
      const response = await fetch(
        `${this.baseUrl}/projects/${encodeURIComponent(
          projectName
        )}/elements/${encodeURIComponent(elementId)}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to delete element ${elementId} from project '${projectName}': ${response.statusText} - ${errorText}`
        );
      }

      // Return success indicator or the actual response data if needed
      return response.status === 200
        ? { success: true }
        : await response.json();
    } catch (error) {
      console.error(
        `Error deleting element ${elementId} from project '${projectName}': ${error}`
      );
      throw error;
    }
  }
}

// Create and export a default instance
const apiClient = new QTOApiClient();
export default apiClient;
