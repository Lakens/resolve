import axios from 'axios';
import { getApiBaseUrl } from './runtime';

const API_BASE_URL = getApiBaseUrl();

// Configure axios defaults
axios.defaults.withCredentials = true;

// Create an axios instance with specific config
const api = axios.create({
  baseURL: API_BASE_URL || undefined,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },
  // Explicitly set credentials mode
  xhrFields: {
    withCredentials: true
  }
});

// Add response interceptor for debugging
api.interceptors.response.use(
  response => response,
  error => {
    console.error('API Error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      headers: error.response?.headers
    });
    return Promise.reject(error);
  }
);

export const checkAuth = async () => {
  try {
    const res = await api.get('/api/auth/check');
    return res.data.authenticated;
  } catch (err) {
    console.error('Error checking auth:', err);
    return false;
  }
};

export const getAuthStatus = async () => {
  try {
    const res = await api.get('/api/auth/check');
    return res.data;
  } catch (err) {
    console.error('Error fetching auth status:', err);
    return {
      authenticated: false,
      oauthConfigured: false
    };
  }
};

export const saveAuthSetup = async (payload) => {
  const res = await api.post('/api/auth/setup', payload);
  return res.data;
};

export const fetchNotebook = async (path, repository) => {
  try {
    console.log('Fetching notebook:', { path, repository });
    const response = await api.get('/api/fetchFile', {
      params: { path, repository }
    });

    console.log('Raw response:', response.data);

    // Extract ipynb from response
    const ipynb = response.data.ipynb;
    if (!ipynb) {
      throw new Error('No notebook data in response');
    }

    console.log('Notebook data:', ipynb);
    return ipynb;
  } catch (error) {
    console.error('Error fetching notebook:', error);
    console.error('Full error details:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    throw error;
  }
};

// Unified file fetcher that handles both .ipynb and .qmd
export const fetchFile = async (path, repository) => {
  try {
    const response = await api.get('/api/fetchFile', { params: { path, repository } });
    const { fileType, ipynb, qmdContent } = response.data;
    if (fileType === 'qmd') {
      return { fileType: 'qmd', content: qmdContent };
    }
    return { fileType: 'ipynb', content: ipynb };
  } catch (error) {
    console.error('Error fetching file:', error);
    throw error;
  }
};


export const fetchUser = async () => {
  try {
    const res = await api.get('/api/user');
    return res.data;
  } catch (err) {
    console.error('Error fetching user:', err);
    return null;
  }
};

export const fetchRepositories = async () => {
  try {
    const res = await api.get('/api/repositories');
    return res.data.repositories || [];
  } catch (err) {
    console.error('Error fetching repositories:', err);
    return [];
  }
};

export const fetchNotebooksInRepo = async (repository) => {
  try {
    const response = await api.get('/api/listNotebooks', {
      params: { repository },
      withCredentials: true
    });
    return response.data.notebooks;
  } catch (error) {
    console.error('Error fetching notebooks:', error);
    throw error;
  }
};

// Fetch raw (binary-safe) file content from a GitHub repository as a base64 string.
// Used to populate WebR's virtual filesystem with data files referenced in R chunks.
export const fetchRawFile = async (path, repository) => {
  const response = await api.get('/api/fetchRawFile', { params: { path, repository } });
  return response.data; // { content: base64String, size: number }
};

export const saveNotebook = async (content, path, repository, commitMessage) => {
  try {
    const response = await api.post('/api/saveFile', { content, path, repository, commitMessage });
    return response.data;
  } catch (error) {
    console.error('Failed to save notebook:', error);
    throw error;
  }
};

// Diff / version history API functions
export const getFileHistory = async (path, repository) => {
  try {
    const response = await api.get('/api/fileHistory', { params: { path, repository } });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch file history:', error);
    throw error;
  }
};

export const getFileAtCommit = async (path, repository, sha) => {
  try {
    const response = await api.get('/api/fileAtCommit', { params: { path, repository, sha } });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch file at commit:', error);
    throw error;
  }
};

// Collaboration API functions
export const sendCollaborationInvite = async (username, email, repository, filePath) => {
  try {
    const response = await api.post('/api/collaboration/invite', {
      username,
      email,
      repository,
      filePath
    });
    return response.data;
  } catch (error) {
    console.error('Failed to send invitation:', error);
    throw error;
  }
};

export const getPendingInvitations = async () => {
  try {
    const response = await api.get('/api/collaboration/invitations');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch invitations:', error);
    throw error;
  }
};

export const acceptInvitation = async (invitationId) => {
  try {
    const response = await api.post('/api/collaboration/accept-invite', {
      invitationId
    });
    return response.data;
  } catch (error) {
    console.error('Failed to accept invitation:', error);
    throw error;
  }
};

export const zoteroPickReference = async () => {
  const response = await api.get('/api/bibliography/zotero-pick', { timeout: 130000 });
  return response.data.bibtex;
};

export const handleSharedDocument = async (owner, repo, path) => {
  try {
    // Check for pending invitations
    const invitations = await getPendingInvitations();
    const invitation = invitations.find(inv => 
      inv.repository.full_name === `${owner}/${repo}`
    );
    
    if (invitation) {
      // Return invitation info for UI handling
      return {
        hasInvitation: true,
        invitation,
        accept: async () => {
          await acceptInvitation(invitation.id);
          return await fetchNotebook(path, `${owner}/${repo}`);
        }
      };
    }
    
    return { hasInvitation: false };
  } catch (error) {
    console.error('Failed to handle shared document:', error);
    throw error;
  }
};
