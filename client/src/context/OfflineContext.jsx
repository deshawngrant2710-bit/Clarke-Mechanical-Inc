import { createContext, useContext, useEffect, useState } from 'react';
import { subscribe, getState, retryFailed, processQueue, discardItem, forceItem, warmCache } from '../lib/offlineSync';

const OfflineContext = createContext(null);

export function OfflineProvider({ children }) {
  const [s, setS] = useState(getState());
  useEffect(() => subscribe(setS), []);
  return (
    <OfflineContext.Provider value={{ ...s, retryFailed, sync: processQueue, discardItem, forceItem, warmCache }}>
      {children}
    </OfflineContext.Provider>
  );
}

export const useOffline = () => useContext(OfflineContext);
