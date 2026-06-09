// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getNestedValue = (obj: Record<string, any>, path: string): any => {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
};
