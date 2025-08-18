import { QTOApiClient } from './ApiClient';
import logger from '../utils/logger';

// Store the auth token getter function
let getAuthToken: (() => Promise<string | null>) | null = null;

/**
 * Set the auth token getter function
 * This should be called once when the app initializes with authentication
 */
export const setAuthTokenGetter = (getter: () => Promise<string | null>) => {
  getAuthToken = getter;
};

/**
 * Enhanced fetch function that adds authentication headers
 */
const authenticatedFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  // Get the auth token
  const token = getAuthToken ? await getAuthToken() : null;
  
  // Add auth header if token is available
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  // Log the request for debugging
  logger.debug(`Making authenticated request to: ${url}`);
  
  // Make the request with auth headers
  const response = await fetch(url, {
    ...options,
    headers
  });
  
  // Handle 401 unauthorized
  if (response.status === 401) {
    logger.warn('Received 401 Unauthorized response');
    // The auth provider should handle token refresh or re-login
  }
  
  return response;
};

/**
 * Authenticated QTO API Client that extends the base client
 * and adds authentication to all requests
 */
export class AuthenticatedQTOApiClient extends QTOApiClient {
  /**
   * Override the base fetch to use authenticated fetch
   */
  protected async fetch(url: string, options?: RequestInit): Promise<Response> {
    return authenticatedFetch(url, options);
  }
  
  /**
   * Get list of projects filtered by user permissions
   * @returns List of project names the user has access to
   */
  async listProjects(): Promise<string[]> {
    const response = await authenticatedFetch(`${this.baseUrl}/projects/`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to list projects: ${response.statusText} - ${errorText}`
      );
    }
    const projects = await response.json();
    
    // The backend should already filter projects based on user permissions
    logger.info(`User has access to ${projects.length} projects`);
    return projects;
  }
  
  /**
   * Get parsed IFC elements for a project (with permission check)
   * @param projectName - The name of the project
   * @returns List of IFC elements for the project
   */
  async getProjectElements(projectName: string): Promise<any[]> {
    const encodedProjectName = encodeURIComponent(projectName);
    const endpoint = `/projects/${encodedProjectName}/elements/`;
    
    try {
      const response = await authenticatedFetch(`${this.baseUrl}${endpoint}`);
      
      if (response.status === 403) {
        logger.error(`Access denied to project: ${projectName}`);
        throw new Error(`You don't have permission to access project: ${projectName}`);
      }
      
      if (response.ok) {
        const elements = await response.json();
        logger.info(
          `Successfully retrieved ${elements.length} elements for project: ${projectName}`
        );
        return elements;
      } else {
        logger.error(
          `Failed to fetch elements for project ${projectName}: ${response.status}`
        );
        return [];
      }
    } catch (error) {
      logger.error(
        `Error fetching elements for project '${projectName}': ${error}`
      );
      throw error;
    }
  }
  
  /**
   * Approve project elements with permission check
   * @param projectName - The name of the project to approve
   * @param updates - Optional list of element updates
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
    
    logger.info(
      `Approving elements for project: ${projectName} (with ${updates?.length || 0} updates)`
    );
    
    try {
      const response = await authenticatedFetch(`${this.baseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: updates ? JSON.stringify(updates) : undefined,
      });
      
      if (response.status === 403) {
        throw new Error(`You don't have permission to approve elements in project: ${projectName}`);
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to approve project: ${response.statusText} - ${errorText}`
        );
      }
      
      const result = await response.json();
      logger.info(`Successfully approved elements for project ${projectName}`);
      return result;
    } catch (error) {
      logger.error(
        `Error approving elements for project '${projectName}': ${error}`
      );
      throw error;
    }
  }
  
  /**
   * Batch update elements with permission check
   */
  async batchUpdateElements(
    projectName: string,
    elements: any[]
  ): Promise<any> {
    try {
      const response = await authenticatedFetch(
        `${this.baseUrl}/projects/${encodeURIComponent(
          projectName
        )}/elements/batch-update`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ elements }),
        }
      );
      
      if (response.status === 403) {
        throw new Error(`You don't have permission to update elements in project: ${projectName}`);
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to batch update elements: ${response.statusText} - ${errorText}`
        );
      }
      
      const result = await response.json();
      logger.info(
        `Successfully batch updated elements for project ${projectName}`
      );
      return result;
    } catch (error) {
      logger.error(
        `Error batch updating elements for project '${projectName}': ${error}`
      );
      throw error;
    }
  }
  
  /**
   * Delete element with permission check
   */
  async deleteElement(projectName: string, elementId: string): Promise<any> {
    try {
      const response = await authenticatedFetch(
        `${this.baseUrl}/projects/${encodeURIComponent(
          projectName
        )}/elements/${encodeURIComponent(elementId)}`,
        {
          method: "DELETE",
        }
      );
      
      if (response.status === 403) {
        throw new Error(`You don't have permission to delete elements in project: ${projectName}`);
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to delete element: ${response.statusText} - ${errorText}`
        );
      }
      
      return response.status === 200
        ? { success: true }
        : await response.json();
    } catch (error) {
      logger.error(
        `Error deleting element ${elementId} from project '${projectName}': ${error}`
      );
      throw error;
    }
  }
}

// Create and export a default authenticated instance
const authenticatedApiClient = new AuthenticatedQTOApiClient();
export default authenticatedApiClient;
