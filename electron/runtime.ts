export const isDev = process.env.ELECTRON_ENV === "development";
export const runtimeRoot = process.cwd();

let appRootCache: string | null = null;

export const getCachedAppRoot = () => appRootCache;

export const setCachedAppRoot = (value: string) => {
  appRootCache = value;
};


