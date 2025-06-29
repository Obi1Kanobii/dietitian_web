// Local API client implementation

// Mock data for local development



// Auth functions
export const auth = {
  login: async (credentials) => {
    // Store mock user in localStorage for persistence
    localStorage.setItem('user', JSON.stringify(mockUser));
    return mockUser;
  },
  
  logout: async () => {
    localStorage.removeItem('user');
  },
  
  getCurrentUser: () => {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },
  
  me: async () => {
    // Get user from localStorage or create new mock user
    let user = localStorage.getItem('user');
    if (!user) {
      localStorage.setItem('user', JSON.stringify(mockUser));
      user = JSON.stringify(mockUser);
    }
    return JSON.parse(user);
  },
  
  updateMyUserData: async (data) => {
    const currentUser = JSON.parse(localStorage.getItem('user') || JSON.stringify(mockUser));
    const updatedUser = { ...currentUser, ...data };
    localStorage.setItem('user', JSON.stringify(updatedUser));
    return updatedUser;
  },
  
  list: async () => {
    return [mockUser];
  }
};

// Entity functions
export const entities = {
  Menu: {
    create: async (data) => {
      return { id: `menu-${Date.now()}`, ...data };
    },
    get: async (id) => {
      return { id, name: "Sample Menu", items: [] };
    },
    list: async () => {
      return [];
    },
    filter: async (query) => {
      return [];
    },
    update: async (id, data) => {
      return { id, ...data };
    },
    delete: async (id) => {
      return true;
    }
  },
  Chat: {
    create: async (data) => {
      return { id: `chat-${Date.now()}`, messages: [], ...data };
    },
    get: async (id) => {
      return { id, messages: [] };
    },
    list: async () => {
      return [];
    },
    filter: async (query) => {
      return [];
    },
    update: async (id, data) => {
      return { id, ...data };
    },
    delete: async (id) => {
      return true;
    }
  },
  Client: {
    create: async (data) => {
      return { id: `client-${Date.now()}`, ...data };
    },
    get: async (id) => {
      try {
        const res = await fetch('/client.json');
        if (!res.ok) {
          throw new Error('Failed to fetch client data');
        }
        const data = await res.json();
        return data;
      } catch (error) {
        console.error('Error fetching client:', error);
        return null;
      }
    },
    list: async () => {
      try {
        const res = await fetch('/client.json');
        if (!res.ok) {
          throw new Error('Failed to fetch client data');
        }
        const data = await res.json();
        return [data];
      } catch (error) {
        console.error('Error fetching clients:', error);
        return [];
      }
    },
    filter: async (query) => {
      try {
        const res = await fetch('/client.json');
        if (!res.ok) {
          throw new Error('Failed to fetch client data');
        }
        const data = await res.json();
        return [data];
      } catch (error) {
        console.error('Error fetching clients:', error);
        return [];
      }
    },
    update: async (id, data) => {
      return { id, ...data };
    },
    delete: async (id) => {
      return true;
    }
  }
};

// Azure OpenAI Configuration
const endpoint = "https://ai-hubfooddata915979189829.openai.azure.com";  // Removed trailing slash
const apiVersion = "2024-02-15-preview";  // Updated API version
const deployment = "forObi4-mini";
const apiKey = "7GE7Tuq2qHvKvTHjS6oqkZ3zQuROcPwgFt5VHHbaPhGnGxLIJBZRJQQJ99BBACYeBjFXJ3w3AAAAACOGgNEZ";

// Core integrations
export const integrations = {
  Core: {
    InvokeLLM: async ({ prompt, response_json_schema, base64Image }) => {
      try {
        let userContent;
        if (base64Image) {
          userContent = [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
          ];
        } else {
          userContent = prompt;
        }
        const response = await fetch(`${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': apiKey,
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            messages: [
              {
                role: 'system',
                content: 'You are a friendly and helpful nutritionist assistant. Keep your responses concise and to the point. Use emojis appropriately to make the conversation engaging. When answering questions about specific foods or nutrients, focus only on the asked topic. If the user provides a JSON schema, format your response as valid JSON matching that schema.'
              },
              {
                role: 'user',
                content: userContent
              }
            ],
            max_tokens: 800,
            temperature: 0.7,
            top_p: 1.0,
            frequency_penalty: 0.0,
            presence_penalty: 0.0,
            stream: false
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('API Error:', {
            status: response.status,
            statusText: response.statusText,
            error: errorData
          });
          throw new Error(errorData.error?.message || `API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        if (!data.choices?.[0]?.message?.content) {
          throw new Error('Invalid response format from API');
        }
        
        const content = data.choices[0].message.content;
        
        // If response_json_schema is provided, try to parse the response as JSON
        if (response_json_schema) {
          try {
            return JSON.parse(content);
          } catch (e) {
            console.error('Failed to parse LLM response as JSON:', e);
            return content;
          }
        }
        
        return content;
      } catch (error) {
        console.error('Error calling LLM:', error);
        throw error;
      }
    },
    SendEmail: async (emailData) => {
      console.log('Email would be sent:', emailData);
      return true;
    },
    UploadFile: async (file) => {
      if (!(file instanceof File || file instanceof Blob)) {
        throw new TypeError('UploadFile expects a File or Blob, but got: ' + typeof file);
      }
      return { url: URL.createObjectURL(file) };
    },
    GenerateImage: async (prompt) => {
      return { url: "https://via.placeholder.com/150" };
    },
    ExtractDataFromUploadedFile: async (file) => {
      return { data: {} };
    }
  }
}; 