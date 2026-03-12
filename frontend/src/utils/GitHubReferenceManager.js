import { loadBibFromGitHub, saveBibToGitHub, formatBibTeXEntry } from './bibGitHub';
import bibtexParse from 'bibtex-parser-js';
import { doi2bib } from './doiUtils';

export class GitHubReferenceManager {
  constructor(token, selectedRepo, notebookPath, owner) {
    this.token = token;
    this.selectedRepo = selectedRepo;
    this.notebookPath = notebookPath;
    this.owner = owner;
    this.references = [];
    this.bibPath = null;
    this.sha = null;
    this._initialized = false;
  }

  async init() {
    if (this._initialized) {
      return;
    }

    try {
      const bibFile = await loadBibFromGitHub(
        this.selectedRepo,
        this.notebookPath,
        this.owner
      );

      if (bibFile && bibFile.content) {
        try {
          const parsed = bibtexParse.toJSON(bibFile.content);
          this.references = this._normalizeReferences(parsed);
          this.bibPath = bibFile.path || `${this.notebookPath.substring(0, this.notebookPath.lastIndexOf('/'))}/references.bib`;
          this.sha = bibFile.sha;
        } catch (error) {
          console.error('Error parsing BibTeX content:', error);
          this.references = [];
        }
      } else {
        const notebookDir = this.notebookPath.substring(
          0,
          this.notebookPath.lastIndexOf('/')
        );
        this.bibPath = `${notebookDir}/references.bib`;
        this.references = [];
        // No bib file in this repo — don't create one until a reference is added
      }

      this._initialized = true;
    } catch (error) {
      console.error('Error initializing reference manager:', error);
      throw error;
    }
  }

  _normalizeReferences(parsed) {
    if (!Array.isArray(parsed)) {
      console.warn('Parsed BibTeX is not an array:', parsed);
      return [];
    }
    return parsed.map(entry => ({
      ...entry,
      citationKey: entry.citationKey || entry.key || '',
      entryTags: entry.entryTags || {}
    }));
  }

  // Internal save method that doesn't check initialization
  async _saveWithoutInit() {
    try {
      const content = this.references
        .map(entry => formatBibTeXEntry(entry))
        .join('\n');

      const result = await saveBibToGitHub(
        content,
        this.bibPath,
        this.sha,
        this.selectedRepo
      );

      if (result && result.content) {
        this.sha = result.content.sha;
      }

      return result;
    } catch (error) {
      console.error('Error saving references:', error);
      throw error;
    }
  }

  async save() {
    if (!this._initialized) {
      await this.init();
    }
    return this._saveWithoutInit();
  }

  addReference(reference) {
    if (!this._initialized) {
      throw new Error('Reference manager not initialized');
    }

    // Ensure the reference has required fields
    if (!reference.entryType || !reference.citationKey) {
      throw new Error('Invalid reference format');
    }

    // Check for duplicate citation key
    const existingIndex = this.references.findIndex(
      ref => ref.citationKey === reference.citationKey
    );

    if (existingIndex >= 0) {
      // Update existing reference
      this.references[existingIndex] = reference;
    } else {
      // Add new reference
      this.references.push(reference);
    }
  }

  async addReferenceFromDOI(doi) {
    if (!this._initialized) {
      await this.init();
    }
    
    try {
      const bibEntry = await doi2bib(doi);
      const parsed = bibtexParse.toJSON(bibEntry)[0];
      
      // Add to references if not already present
      if (!this.references.find(ref => ref.citationKey === parsed.citationKey)) {
        this.references.push(parsed);
        await this.save();
      }
      
      return parsed.citationKey;
    } catch (error) {
      console.error('Error adding reference from DOI:', error);
      throw error;
    }
  }

  removeReference(citationKey) {
    if (!this._initialized) {
      throw new Error('Reference manager not initialized');
    }

    const index = this.references.findIndex(
      ref => ref.citationKey === citationKey
    );

    if (index >= 0) {
      this.references.splice(index, 1);
    }
  }

  getReferences() {
    return this.references;
  }

  getReference(citationKey) {
    return this.references.find(ref => ref.citationKey === citationKey);
  }
}
