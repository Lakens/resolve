import { Node } from '@tiptap/core'
import yaml from 'js-yaml'
import '../styles/components/editor/_raw-cell.css'
import '../styles/components/editor/_yaml-table-editor.css'

function tryParseYaml(content) {
  try {
    if (content.trim().startsWith('---') && content.trim().endsWith('---')) {
      // Extract YAML content between fences, preserving internal whitespace
      const yamlContent = content.replace(/^---\n/, '').replace(/\n?---$/, '');
      const parsedYaml = yaml.load(yamlContent);
      
      if (parsedYaml) {
        // Format the YAML but don't include it in the parsed object
        const formattedYaml = yaml.dump(parsedYaml, {
          lineWidth: -1,
          noRefs: true,
          indent: 2,
          flowLevel: -1
        }).trim(); // Trim any trailing whitespace from the formatted YAML
        return {
          parsed: parsedYaml,
          formatted: formattedYaml
        };
      }
      return { parsed: parsedYaml || {}, formatted: yamlContent.trim() };
    }
  } catch (e) {
    console.error('Failed to parse YAML:', e);
  }
  return null;
}

function formatYamlFragment(value) {
  return yaml.dump(value, {
    lineWidth: -1,
    noRefs: true,
    indent: 2,
    flowLevel: -1
  }).trim();
}

function isStructuredValue(value) {
  return Array.isArray(value) || (typeof value === 'object' && value !== null);
}

function summarizeStructuredValue(key, value) {
  if (!isStructuredValue(value)) return value ?? '';

  if (Array.isArray(value)) {
    if (key.toLowerCase() === 'author') {
      return value
        .map((entry) => {
          if (typeof entry === 'string') return entry;
          if (entry && typeof entry === 'object') {
            if (entry.name) return entry.name;
            if (entry.family || entry.given) {
              return [entry.given, entry.family].filter(Boolean).join(' ');
            }
          }
          return '';
        })
        .filter(Boolean)
        .join(', ');
    }

    if (key.toLowerCase() === 'affiliations') {
      return value
        .map((entry) => {
          if (typeof entry === 'string') return entry;
          if (entry && typeof entry === 'object') {
            return entry.name || entry.id || entry.department || '';
          }
          return '';
        })
        .filter(Boolean)
        .join(', ');
    }
  }

  if (typeof value === 'object' && value !== null) {
    if (key.toLowerCase() === 'author') {
      if (value.name) return value.name;
      if (value.family || value.given) {
        return [value.given, value.family].filter(Boolean).join(' ');
      }
    }
    if (key.toLowerCase() === 'affiliations') {
      return value.name || value.id || value.department || '';
    }
  }

  return formatYamlFragment(value);
}

function autosizeTextarea(field) {
  if (!field || field.tagName !== 'TEXTAREA') return;
  field.style.height = 'auto';
  field.style.height = `${field.scrollHeight}px`;
}

export const RawCell = Node.create({
    name: 'rawCell',
    group: 'block',
    atom: true,
    selectable: false,
    draggable: false,
    defining: true,
    isolating: true,

    addAttributes() {
      return {
        content: {
          default: ''
        },
        isYamlHeader: {
          default: false
        },
        parsedYaml: {
          default: null
        },
        formattedYaml: {
          default: null
        },
        isAcademicArticle: {
          default: false
        }
      }
    },

    parseHTML() {
      return [{
        tag: 'div[data-type="raw-cell"]',
        getAttrs: dom => ({
          content: dom.textContent,
          isYamlHeader: dom.getAttribute('data-yaml-header') === 'true',
          isAcademicArticle: dom.getAttribute('data-academic') === 'true'
        })
      }]
    }, 
 // hello?
    renderHTML({ node }) {
      const yaml = node.attrs.parsedYaml || {};
      const isYamlHeader = node.attrs.isYamlHeader;
      const isAcademicArticle = node.attrs.isAcademicArticle;

      if (isYamlHeader && isAcademicArticle) {
        return ['div', { 
          'data-type': 'raw-cell',
          'data-yaml-header': 'true',
          'data-academic': 'true',
          class: 'raw-cell academic-frontpage'
        }];
      }

      return ['div', { 
        'data-type': 'raw-cell',
        class: 'raw-cell'
      }];
    },

    addNodeView() {
      return ({ node, getPos, editor }) => {
        const dom = document.createElement('div');
        dom.setAttribute('data-type', 'raw-cell');
        dom.classList.add('raw-cell');
        const cleanupFns = [];
        const renderNode = (renderedNode) => {
          dom.className = 'raw-cell';
          dom.replaceChildren();
          while (cleanupFns.length) {
            const cleanup = cleanupFns.pop();
            try {
              cleanup();
            } catch (error) {
              console.error('Failed to clean up raw cell observer:', error);
            }
          }

          if (renderedNode.attrs.isYamlHeader && renderedNode.attrs.isAcademicArticle) {
            dom.classList.add('academic-frontpage');
            const yaml = renderedNode.attrs.parsedYaml || {};

            const table = document.createElement('div');
            table.classList.add('properties-table');
            const primaryFields = ['title', 'subtitle', 'author', 'affiliations', 'date', 'abstract'];

            const primarySection = document.createElement('div');
            primarySection.classList.add('primary-fields', 'primary-fields--article');

            const additionalSection = document.createElement('div');
            additionalSection.classList.add('additional-fields');

            const createBasicRow = (key, value) => {
              const row = document.createElement('div');
              row.classList.add('property-row', `property-row--${key.toLowerCase()}`);
              row.setAttribute('data-property', key);
              const isComplexStructuredValue =
                isStructuredValue(value) &&
                !['author', 'affiliations'].includes(key.toLowerCase());
              const prefersTextarea = [
                'title',
                'subtitle',
                'author',
                'authors',
                'affiliations',
                'date',
                'abstract'
              ].includes(key.toLowerCase());
              if (isStructuredValue(value)) {
                row.classList.add('property-row--structured');
              }

              const labelDiv = document.createElement('div');
              labelDiv.classList.add('property-label');
              labelDiv.textContent = key.charAt(0).toUpperCase() + key.slice(1);

              const valueDiv = document.createElement('div');
              valueDiv.classList.add('property-value');

              let input;
              if (
                prefersTextarea ||
                isComplexStructuredValue ||
                (typeof value === 'string' && value.length > 100)
              ) {
                input = document.createElement('textarea');
                input.rows = key === 'abstract' ? '4' : '1';
                input.wrap = 'soft';
                input.setAttribute('wrap', 'soft');
                input.spellcheck = key !== 'author' && key !== 'affiliations';
              } else {
                input = document.createElement('input');
                input.type = 'text';
                input.spellcheck = false;
              }

              const setupInputHandling = (field) => {
                field.addEventListener('keydown', (e) => {
                  if (e.key === 'Backspace' && field.selectionStart === 0 && field.selectionEnd === 0) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                  if ((e.key === 'Delete' || (e.key === 'x' && (e.ctrlKey || e.metaKey))) &&
                    field.selectionStart === 0 &&
                    field.selectionEnd === field.value.length) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                });

                field.addEventListener('mousedown', (e) => {
                  e.stopPropagation();
                });

                field.addEventListener('click', (e) => {
                  e.stopPropagation();
                  field.focus();
                });

                field.draggable = false;
              };

              const updateYamlNode = (newYaml) => {
                const formattedYaml = formatYamlFragment(newYaml);
                const yamlContent = `---\n${formattedYaml}\n---`;
                const pos = getPos();
                if (typeof pos !== 'number') return;

                const tr = editor.state.tr;
                tr.setNodeMarkup(pos, undefined, {
                  content: yamlContent,
                  parsedYaml: newYaml,
                  formattedYaml,
                  isYamlHeader: true,
                  isAcademicArticle: true,
                });
                editor.view.dispatch(tr);
              };

              setupInputHandling(input);

              if (input.tagName === 'TEXTAREA') {
                if (isComplexStructuredValue) {
                  const commitStructuredValue = () => {
                    try {
                      const parsedValue = yaml.load(input.value) ?? '';
                      const newYaml = { ...yaml, [key]: parsedValue };
                      input.classList.remove('property-input--invalid');
                      updateYamlNode(newYaml);
                    } catch (error) {
                      input.classList.add('property-input--invalid');
                    }
                  };

                  input.addEventListener('input', () => {
                    autosizeTextarea(input);
                    input.classList.remove('property-input--invalid');
                  });

                  input.addEventListener('blur', commitStructuredValue);

                  input.addEventListener('keydown', (e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault();
                      commitStructuredValue();
                    }
                  });
                } else {
                  input.addEventListener('input', (e) => {
                    const newYaml = { ...yaml, [key]: e.target.value };
                    autosizeTextarea(input);
                    updateYamlNode(newYaml);
                  });
                }
              } else {
                input.addEventListener('input', (e) => {
                  const newYaml = { ...yaml };
                  const parent = e.target.closest('.property-row').getAttribute('data-parent');
                  const property = e.target.getAttribute('data-property');

                  if (parent) {
                    if (!newYaml[parent]) newYaml[parent] = {};
                    newYaml[parent][property] = e.target.value;
                  } else {
                    newYaml[property] = e.target.value;
                  }

                  updateYamlNode(newYaml);
                });
              }

              input.value = isComplexStructuredValue
                ? formatYamlFragment(value)
                : summarizeStructuredValue(key, value);
              input.setAttribute('data-property', key);
              input.classList.add(`property-input--${key.toLowerCase()}`);
              valueDiv.appendChild(input);
              row.appendChild(labelDiv);
              row.appendChild(valueDiv);
              if (input.tagName === 'TEXTAREA') {
                const resizeTextarea = () => autosizeTextarea(input);
                requestAnimationFrame(resizeTextarea);

                if (typeof ResizeObserver !== 'undefined') {
                  const observer = new ResizeObserver(resizeTextarea);
                  observer.observe(row);
                  observer.observe(valueDiv);
                  cleanupFns.push(() => observer.disconnect());
                } else {
                  window.addEventListener('resize', resizeTextarea);
                  cleanupFns.push(() => window.removeEventListener('resize', resizeTextarea));
                }
              }
              return row;
            };

            const createPropertyRow = (key, value) => {
              return createBasicRow(key, value);
            };

            Object.entries(yaml).forEach(([key, value]) => {
              if (primaryFields.includes(key.toLowerCase())) {
                primarySection.appendChild(createPropertyRow(key, value));
              } else {
                additionalSection.appendChild(createPropertyRow(key, value));
              }
            });

            const additionalHeader = document.createElement('div');
            additionalHeader.classList.add('additional-fields-header');
            additionalHeader.innerHTML = `
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Additional Fields
            `;

            const additionalContent = document.createElement('div');
            additionalContent.classList.add('additional-fields-content');

            additionalHeader.addEventListener('click', () => {
              additionalHeader.classList.toggle('expanded');
              additionalContent.classList.toggle('expanded');
            });

            if (additionalSection.children.length > 0) {
              additionalContent.appendChild(additionalSection);
              table.appendChild(primarySection);
              table.appendChild(additionalHeader);
              table.appendChild(additionalContent);
            } else {
              table.appendChild(primarySection);
            }

            dom.appendChild(table);
            return;
          }

          const content = document.createElement('div');
          content.classList.add('raw-content');
          content.textContent = renderedNode.attrs.content || '';
          content.contentEditable = 'true';
          dom.appendChild(content);
        };

        renderNode(node);

        return {
          dom,
          update: (updatedNode) => {
            if (updatedNode.type.name !== node.type.name) return false;
            renderNode(updatedNode);
            return true;
          },
          destroy: () => {
            while (cleanupFns.length) {
              const cleanup = cleanupFns.pop();
              try {
                cleanup();
              } catch (error) {
                console.error('Failed to clean up raw cell node view:', error);
              }
            }
          }
        };
      };
    },
    
    addKeyboardShortcuts() {
      return {
        Backspace: ({ editor }) => {
          const { selection } = editor.state;
          const { $from } = selection;

          // Case 1: Prevent Backspace when the cursor is inside the rawCell node
          if ($from.parent.type.name === 'rawCell' && $from.parentOffset === 0) {
            return true; // Block the backspace
          }

          // Case 2: Prevent Backspace when the cursor is directly below the rawCell node
          const posBefore = $from.before($from.depth);
          const prevNode = editor.state.doc.nodeAt(posBefore);
          if (prevNode && prevNode.type.name === 'rawCell') {
            return true; // Block backspace from deleting the rawCell
          }
    
          // Case 3: Prevent Backspace when merging blocks (text exists before the rawCell node)
          if (
            prevNode &&
            prevNode.type.name === 'rawCell' &&
            $from.parentOffset === 0 // Cursor is at the start of the block following the rawCell
          ) {
            return true; // Block Backspace
          }
    
          return false; // Allow default behavior
        },
    
        Delete: ({ editor }) => {
          const { selection } = editor.state;
          const { $from } = selection;

          // Case 1: Prevent Delete when the cursor is inside the rawCell node
          if (
            $from.parent.type.name === 'rawCell' &&
            $from.parentOffset === $from.parent.nodeSize - 2
          ) {
            return true; // Block the delete
          }

          // Case 2: Prevent Delete when the cursor is directly above the rawCell node
          const posAfter = $from.after($from.depth);
          const nextNode = editor.state.doc.nodeAt(posAfter);
          if (nextNode && nextNode.type.name === 'rawCell') {
            return true; // Block delete from removing the rawCell
          }
    
          return false; // Allow default behavior
        },
      };
    }
    
    
});
