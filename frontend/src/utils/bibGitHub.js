// Utilities for handling .bib files with GitHub integration
import axios from 'axios';
import bibtexParse from 'bibtex-parser-js';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.resolve.pub';

/**
 * Load a .bib file from GitHub repository
 * @param {string} selectedRepo - Repository in format "owner/repo"
 * @param {string} notebookPath - Path to the current notebook
 * @param {string} owner - Repository owner login
 * @returns {Promise<{content: string, path: string, sha: string} | null>}
 */
export async function loadBibFromGitHub(selectedRepo, notebookPath, owner) {
  console.log('🔍 Attempting to load .bib file from GitHub:', {
    repo: selectedRepo,
    notebook: notebookPath,
    owner
  });

  try {
    const response = await axios.get(`${API_BASE_URL}/api/bibliography/load`, {
      params: {
        repository: selectedRepo,
        notebookPath
      },
      withCredentials: true
    });
    
    console.log('✅ Successfully loaded .bib file');
    return response.data;
  } catch (error) {
    console.error('❌ Error loading .bib file:', error);
    return null;
  }
}

/**
 * Save a .bib file to GitHub repository
 * @param {string} content - BibTeX content to save
 * @param {string} path - Path where to save the file
 * @param {string} sha - SHA of existing file (if updating)
 * @param {string} selectedRepo - Repository in format "owner/repo"
 * @returns {Promise<Object>} GitHub API response
 */
export async function saveBibToGitHub(content, path, sha, selectedRepo) {
  try {
    const cleanPath = path.replace(/^\/+/, ''); // Remove leading slashes
    
    const response = await axios.post(`${API_BASE_URL}/api/bibliography/save`, {
      content,
      path: cleanPath,
      repository: selectedRepo,
      ...(sha && { sha })
    }, {
      withCredentials: true
    });

    console.log('✅ Successfully saved .bib file');
    return response.data;
  } catch (error) {
    console.error('❌ Error saving .bib file:', error);
    throw error;
  }
}

/**
 * Format a BibTeX entry as a string
 * @param {Object} entry - BibTeX entry object
 * @returns {string} Formatted BibTeX entry
 */
export function formatBibTeXEntry(entry) {
  if (!entry || !entry.entryType || !entry.citationKey) {
    console.warn('Invalid BibTeX entry:', entry);
    return '';
  }

  const { entryType, citationKey, entryTags } = entry;
  
  // Start the entry with lowercase type
  let result = `@${entryType.toLowerCase()}{${citationKey.toLowerCase()},\n`;
  
  // Add each field with lowercase field names
  if (entryTags && typeof entryTags === 'object') {
    Object.entries(entryTags).forEach(([key, value]) => {
      if (value) {
        // Convert field name to lowercase
        result += `\t${key.toLowerCase()} = {${value}},\n`;
      }
    });
  }
  
  // Close the entry
  result += '}\n';
  
  return result;
}
