import logger from './logger';

/**
 * Navigation utility for cross-plugin navigation
 * Handles environment-based URL routing following best practices
 */

interface NavigationConfig {
  ifcUploader: string;
  qto: string;
  lca: string;
  cost: string;
}

// Environment-based configuration
const getNavigationConfig = (): NavigationConfig => {
  const isProd = import.meta.env.PROD;
  const baseUrl = isProd 
    ? 'https://pluginhost.test.fastbim5.eu'
    : window.location.origin;

  return {
    ifcUploader: `${baseUrl}/ifc-uploader`,
    qto: `${baseUrl}/plugin-qto`,
    lca: `${baseUrl}/plugin-lca`,
    cost: `${baseUrl}/plugin-cost`,
  };
};

/**
 * Navigate to IFC Uploader
 * @param source - Source plugin for logging purposes
 */
export const navigateToIfcUploader = (source: string = 'unknown') => {
  const config = getNavigationConfig();
  logger.info(`[Navigation] Opening IFC Uploader from ${source}`, { url: config.ifcUploader });
  
  // Use window.open for cross-plugin navigation to avoid losing current state
  window.open(config.ifcUploader, '_blank', 'noopener,noreferrer');
};

/**
 * Navigate to QTO plugin
 * @param source - Source plugin for logging purposes
 */
export const navigateToQto = (source: string = 'unknown') => {
  const config = getNavigationConfig();
  logger.info(`[Navigation] Opening QTO from ${source}`, { url: config.qto });
  
  window.open(config.qto, '_blank', 'noopener,noreferrer');
};

/**
 * Navigate to LCA plugin
 * @param source - Source plugin for logging purposes
 */
export const navigateToLca = (source: string = 'unknown') => {
  const config = getNavigationConfig();
  logger.info(`[Navigation] Opening LCA from ${source}`, { url: config.lca });
  
  window.open(config.lca, '_blank', 'noopener,noreferrer');
};

/**
 * Navigate to Cost plugin
 * @param source - Source plugin for logging purposes
 */
export const navigateToCost = (source: string = 'unknown') => {
  const config = getNavigationConfig();
  logger.info(`[Navigation] Opening Cost from ${source}`, { url: config.cost });
  
  window.open(config.cost, '_blank', 'noopener,noreferrer');
};

/**
 * Get current plugin name based on URL
 */
export const getCurrentPlugin = (): string => {
  const path = window.location.pathname;
  if (path.includes('plugin-lca')) return 'plugin-lca';
  if (path.includes('plugin-cost')) return 'plugin-cost';
  if (path.includes('plugin-qto')) return 'plugin-qto';
  if (path.includes('ifc-uploader')) return 'ifc-uploader';
  return 'unknown';
};
