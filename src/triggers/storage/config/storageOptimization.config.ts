/**
 * Configuración de optimización de storage
 * Define qué carpetas/tipos se pueden optimizar
 */

export const OPTIMIZABLE_FOLDERS = {
  EVENTS: "events",
  SITES: "sites",
  // Agregar más tipos aquí en el futuro
} as const;

export type OptimizableFolder = typeof OPTIMIZABLE_FOLDERS[keyof typeof OPTIMIZABLE_FOLDERS];

/**
 * Validar si una carpeta es optimizable
 * @param {string} folder - Nombre de la carpeta a validar
 * @return {boolean} true si la carpeta es optimizable
 */
export const isOptimizableFolder = (folder: string): folder is OptimizableFolder => {
  return Object.values(OPTIMIZABLE_FOLDERS).includes(folder as OptimizableFolder);
};

/**
 * Obtener lista de carpetas optimizables
 * @return {OptimizableFolder[]} Lista de carpetas optimizables
 */
export const getOptimizableFolders = (): OptimizableFolder[] => {
  return Object.values(OPTIMIZABLE_FOLDERS);
};
