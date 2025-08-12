import React, { createContext, useContext, useState, useEffect } from 'react';
import { ChatUser } from '@/api/entities';
import { EventBus } from '@/utils/EventBus';

const ClientContext = createContext();

export const useClient = () => {
  const context = useContext(ClientContext);
  if (!context) {
    throw new Error('useClient must be used within a ClientProvider');
  }
  return context;
};

export function ClientProvider({ children }) {
  const [clients, setClients] = useState([]);
  // Initialize selected user code from localStorage so it survives refresh
  const [selectedUserCode, setSelectedUserCode] = useState(() => {
    try {
      return localStorage.getItem('selectedUserCode') || null;
    } catch {
      return null;
    }
  });
  const [selectedClient, setSelectedClient] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load all clients on mount
  useEffect(() => {
    loadClients();
  }, []);

  // Listen to cross-app client refresh events (e.g., after creating a new user)
  useEffect(() => {
    const handler = () => loadClients();
    EventBus.on('refreshClients', handler);
    return () => {
      if (EventBus.off) EventBus.off('refreshClients', handler);
    };
  }, []);

  // Persist selection whenever it changes and load the client details
  useEffect(() => {
    try {
      if (selectedUserCode) {
        localStorage.setItem('selectedUserCode', selectedUserCode);
        loadSelectedClient();
      } else {
        localStorage.removeItem('selectedUserCode');
        setSelectedClient(null);
      }
    } catch {
      // ignore storage errors
    }
  }, [selectedUserCode]);

  const loadClients = async () => {
    try {
      setIsLoading(true);
      setError(null);
      console.log('👥 Loading clients from chat_users table...');
      const clientsData = await ChatUser.list();
      console.log('✅ Clients loaded:', clientsData?.length || 0, 'records');
      setClients(clientsData || []);
      
      // If there is a stored selection but it no longer exists, fall back to first client
      if (clientsData && clientsData.length > 0) {
        const hasStored = selectedUserCode && clientsData.some(c => c.user_code === selectedUserCode);
        if (!hasStored && !selectedUserCode) {
          setSelectedUserCode(clientsData[0].user_code);
        }
        if (!hasStored && selectedUserCode) {
          setSelectedUserCode(clientsData[0].user_code);
        }
      }
    } catch (error) {
      console.error("❌ Error loading clients:", error);
      setError("Failed to load clients");
    } finally {
      setIsLoading(false);
    }
  };

  const loadSelectedClient = async () => {
    if (!selectedUserCode) return;

    try {
      console.log('👤 Loading client data for:', selectedUserCode);
      const clientData = await ChatUser.getByUserCode(selectedUserCode);
      setSelectedClient(clientData);
      console.log('✅ Client data loaded:', clientData);
    } catch (error) {
      console.error("❌ Error loading selected client:", error);
      setError("Failed to load client data");
      setSelectedClient(null);
    }
  };

  const selectClient = (userCode) => {
    setSelectedUserCode(userCode);
  };

  const refreshClients = () => {
    loadClients();
  };

  const value = {
    clients,
    selectedUserCode,
    selectedClient,
    isLoading,
    error,
    selectClient,
    refreshClients,
    loadSelectedClient
  };

  return (
    <ClientContext.Provider value={value}>
      {children}
    </ClientContext.Provider>
  );
}