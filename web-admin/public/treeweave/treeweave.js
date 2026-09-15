/**
 * TreeWeave - Family Tree Visualization Engine
 * MIT License - Free & Open Source
 * 
 * A lightweight, framework-agnostic library for creating beautiful family trees
 */

(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined'
    ? module.exports = factory()
    : typeof define === 'function' && define.amd
    ? define(factory)
    : (global.TreeWeave = factory());
})(this, function () {
  'use strict';

  /**
   * TreeWeave Constructor
   * @param {Object} config - Configuration object
   * @param {Object} config.data - Tree data (recursive structure)
   * @param {Object} config.options - Layout and rendering options
   */
  function TreeWeave(config) {
    if (!config || !config.data) {
      throw new Error('TreeWeave requires data to be provided in config.data');
    }

    this.data = config.data;
    this.options = Object.assign({}, TreeWeave.DEFAULT_OPTIONS, config.options || {});
    
    // Internal state
    this._nodes = [];
    this._positions = new Map();
    this._maxDepth = 0;
    this._svgElement = null;
    this._collapsedNodes = new Set();
    this._zoomLevel = 1;
    this._panX = 0;
    this._panY = 0;
    this._searchResults = [];
  }

  /**
   * Default configuration options
   */
  TreeWeave.DEFAULT_OPTIONS = {
    // Node dimensions
    nodeWidth: 180,
    nodeHeight: 100,
    
    // Spacing
    levelGap: 120,
    siblingGap: 40,
    partnerGap: 20,
    
    // Layout
    direction: 'vertical',
    centerRoot: true,
    
    // Connectors
    connectors: 'line', // 'line' | 'curve'
    
    // Rendering
    renderMode: 'dom', // 'dom' | 'string'
    
    // Colors
    colors: {
      male: '#3b82f6',
      female: '#ec4899',
      default: '#6366f1'
    },
    
    // Template
    showPhoto: true,
    showDOB: true,
    showGender: true,
    showTitle: true,
    showMenu: false,
    
    // Features
    enableCollapse: true,
    collapseOnNodeClick: true,
    enableZoom: true,
    enableSearch: true,
    enableExport: true,
    
    // Callbacks
    onNodeClick: null,
    onNodeDoubleClick: null,
    onNodeRightClick: null
  };

  /**
   * Process tree data and calculate positions for all nodes
   */
  TreeWeave.prototype._processTree = function () {
    this._nodes = [];
    this._positions.clear();
    this._maxDepth = 0;

    // Flatten tree and calculate initial positions
    this._flattenTree(this.data, 0, null);
    
    // Calculate layout
    this._calculateLayout();
    
    return this._nodes;
  };

  /**
   * Flatten tree structure into array with depth information
   */
  TreeWeave.prototype._flattenTree = function (node, depth, parent) {
    const nodeData = {
      id: node.id,
      label: node.label,
      meta: node.meta || {},
      depth: depth,
      parent: parent,
      children: [],
      partner: node.partner || null,
      collapsed: this._collapsedNodes.has(String(node.id))
    };

    this._nodes.push(nodeData);
    this._maxDepth = Math.max(this._maxDepth, depth);

    // Only process children if node is not collapsed
    if (node.children && node.children.length > 0 && !nodeData.collapsed) {
      node.children.forEach(child => {
        const childNode = this._flattenTree(child, depth + 1, nodeData);
        nodeData.children.push(childNode);
      });
    }

    return nodeData;
  }

  /**
   * Calculate layout positions for all nodes
   * Uses a modified tidy tree algorithm
   */
  TreeWeave.prototype._calculateLayout = function () {
    const root = this._nodes[0];
    
    // Calculate subtree widths
    this._calculateSubtreeWidths(root);
    
    // Position nodes
    this._positionNode(root, 0, 0);
    
    // Center the tree if needed
    if (this.options.centerRoot) {
      this._centerTree();
    }
  };

  /**
   * Calculate subtree width for each node
   */
  TreeWeave.prototype._calculateSubtreeWidths = function (node) {
    if (!node.children || node.children.length === 0) {
      node.subtreeWidth = this.options.nodeWidth;
      return node.subtreeWidth;
    }

    let totalWidth = 0;
    node.children.forEach((child, index) => {
      totalWidth += this._calculateSubtreeWidths(child);
      if (index < node.children.length - 1) {
        totalWidth += this.options.siblingGap;
      }
    });

    node.subtreeWidth = Math.max(this.options.nodeWidth, totalWidth);
    return node.subtreeWidth;
  };

  /**
   * Position a node and its children
   */
  TreeWeave.prototype._positionNode = function (node, x, y) {
    // Position current node
    this._positions.set(node.id, { x, y });

    if (!node.children || node.children.length === 0) {
      return;
    }

    // Calculate starting X for children
    let childX = x - (node.subtreeWidth / 2) + (this.options.nodeWidth / 2);
    const stubLength = 10; // Stub line length below parent
    const childY = y + this.options.levelGap + stubLength;

    node.children.forEach(child => {
      const childCenterX = childX + (child.subtreeWidth / 2) - (this.options.nodeWidth / 2);
      this._positionNode(child, childCenterX, childY);
      childX += child.subtreeWidth + this.options.siblingGap;
    });
  };

  /**
   * Center the tree horizontally
   */
  TreeWeave.prototype._centerTree = function () {
    let minX = Infinity;
    let maxX = -Infinity;

    this._positions.forEach(pos => {
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x + this.options.nodeWidth);
    });

    const treeWidth = maxX - minX;
    const offset = -minX;

    this._positions.forEach(pos => {
      pos.x += offset;
    });

    return { width: treeWidth, offset };
  };

  /**
   * Render the tree as SVG
   */
  TreeWeave.prototype.render = function () {
    this._processTree();

    // Calculate SVG dimensions
    const dimensions = this._calculateSVGDimensions();
    
    // Create SVG element
    const svg = this._createSVGElement(dimensions);
    
    // Create zoom/pan group
    const zoomGroup = this._createSVGNode('g', {
      class: 'tw-zoom-group',
      transform: `translate(${this._panX}, ${this._panY}) scale(${this._zoomLevel})`
    });
    
    // Create main group with padding
    const mainGroup = this._createSVGNode('g', {
      class: 'tw-main-group',
      transform: `translate(${this.options.nodeWidth / 2}, 60)`
    });

    // Draw connectors first (so they appear behind nodes)
    this._drawConnectors(mainGroup);
    
    // Draw nodes
    this._drawNodes(mainGroup);

    zoomGroup.appendChild(mainGroup);
    svg.appendChild(zoomGroup);
    this._svgElement = svg;
    this._mainGroup = mainGroup;
    this._zoomGroup = zoomGroup;

    // Add zoom and pan functionality
    if (this.options.enableZoom) {
      this._addZoomPanHandlers(svg);
    }

    return this.options.renderMode === 'string' 
      ? new XMLSerializer().serializeToString(svg)
      : svg;
  }

  /**
   * Calculate SVG dimensions
   */
  TreeWeave.prototype._calculateSVGDimensions = function () {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    this._positions.forEach(pos => {
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x + this.options.nodeWidth);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y + this.options.nodeHeight);
    });

    return {
      width: maxX - minX + this.options.nodeWidth + 80,
      height: maxY - minY + this.options.nodeHeight + 80
    };
  };

  /**
   * Create SVG element
   */
  TreeWeave.prototype._createSVGElement = function (dimensions) {
    const svg = this._createSVGNode('svg', {
      width: dimensions.width,
      height: dimensions.height,
      class: 'treeweave-svg',
      xmlns: 'http://www.w3.org/2000/svg'
    });

    return svg;
  };

  /**
   * Create SVG node helper
   */
  TreeWeave.prototype._createSVGNode = function (tag, attrs) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    
    if (attrs) {
      for (let key in attrs) {
        element.setAttribute(key, attrs[key]);
      }
    }
    
    return element;
  };

  /**
   * Draw connectors between nodes
   */
  TreeWeave.prototype._drawConnectors = function (container) {
    this._nodes.forEach(node => {
      if (node.parent) {
        const connector = this._createConnector(node.parent, node);
        container.appendChild(connector);
      }
    });
  };

  /**
   * Create a connector line between parent and child
   */
  TreeWeave.prototype._createConnector = function (parent, child) {
    const parentPos = this._positions.get(parent.id);
    const childPos = this._positions.get(child.id);
    
    const stubLength = 10; // Match the stub line length

    const x1 = parentPos.x + (this.options.nodeWidth / 2);
    const y1 = parentPos.y + this.options.nodeHeight + stubLength; // Start after stub
    const x2 = childPos.x + (this.options.nodeWidth / 2);
    const y2 = childPos.y;

    if (this.options.connectors === 'curve') {
      // Curved connector
      const midY = (y1 + y2) / 2;
      const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
      
      return this._createSVGNode('path', {
        d: path,
        class: 'tw-connector',
        fill: 'none',
        stroke: '#9ca3af',
        'stroke-width': '2'
      });
    } else {
      // Straight line with right angle
      const midY = (y1 + y2) / 2;
      const path = `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
      
      return this._createSVGNode('path', {
        d: path,
        class: 'tw-connector',
        fill: 'none',
        stroke: '#9ca3af',
        'stroke-width': '2'
      });
    }
  };

  /**
   * Draw all nodes
   */
  TreeWeave.prototype._drawNodes = function (container) {
    this._nodes.forEach(node => {
      const elements = this._createNodeElement(node);
      const group = elements.group || elements;
      container.appendChild(group);
      if (elements.button) {
        container.appendChild(elements.button);
      }
    });
  };

  /**
   * Create a node element
   */
  TreeWeave.prototype._createNodeElement = function (node) {
    const pos = this._positions.get(node.id);
    
    if (!pos) {
      console.error('No position found for node:', node.id);
      return this._createSVGNode('g', {});
    }
    
    const hasChildren = this._hasChildren(node);
    
    const group = this._createSVGNode('g', {
      class: 'tw-node-group' + (node.collapsed ? ' collapsed' : ''),
      'data-node-id': node.id,
      'data-level': node.depth,
      'data-gender': node.meta.gender || 'default',
      transform: `translate(${pos.x}, ${pos.y})`
    });

    // Node background with rounded corners
    const gender = node.meta.gender || 'default';
    const color = this.options.colors[gender] || this.options.colors.default;
    
    const rect = this._createSVGNode('rect', {
      class: 'tw-node',
      width: this.options.nodeWidth,
      height: this.options.nodeHeight,
      rx: 8,
      ry: 8,
      fill: '#ffffff',
      stroke: color,
      'stroke-width': 3
    });
    group.appendChild(rect);
    
    // Add click handlers
    const self = this;
    group.style.cursor = 'pointer';
    group.addEventListener('click', function(e) {
      const isCollapseButton = e.target && e.target.closest && e.target.closest('[data-role="collapse-button"]');
      if (self.options.enableCollapse && self.options.collapseOnNodeClick && !isCollapseButton) {
        self.toggleNode(node.id);
      }
      if (self.options.onNodeClick) {
        self.options.onNodeClick(node, e);
      }
      e.stopPropagation();
    });
    
    group.addEventListener('dblclick', function(e) {
      e.stopPropagation();
      if (self.options.onNodeDoubleClick) {
        self.options.onNodeDoubleClick(node, e);
      }
    });
    
    group.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      if (self.options.onNodeRightClick) {
        self.options.onNodeRightClick(node, e);
      }
    });

    // Avatar/Photo (circular with fallback)
    if (this.options.showPhoto) {
      const photoSize = 40;
      const photoX = (this.options.nodeWidth - photoSize) / 2;
      const photoY = 10;
      
      if (node.meta.photo) {
        // Circular clipping for photo
        const clipPath = this._createSVGNode('clipPath', { id: `clip-${node.id}` });
        const circle = this._createSVGNode('circle', {
          cx: photoX + photoSize / 2,
          cy: photoY + photoSize / 2,
          r: photoSize / 2
        });
        clipPath.appendChild(circle);
        group.appendChild(clipPath);

        const photo = this._createSVGNode('image', {
          x: photoX,
          y: photoY,
          width: photoSize,
          height: photoSize,
          href: node.meta.photo,
          'clip-path': `url(#clip-${node.id})`,
          class: 'tw-avatar tw-photo'
        });
        group.appendChild(photo);
      } else {
        // No avatar fallback - circular placeholder with initials
        const avatarGroup = this._createSVGNode('g', {
          class: 'tw-no-avatar',
          transform: `translate(${photoX}, ${photoY})`
        });

        const avatarCircle = this._createSVGNode('circle', {
          cx: photoSize / 2,
          cy: photoSize / 2,
          r: photoSize / 2,
          fill: '#e3f2fd',
          stroke: color,
          'stroke-width': 2
        });
        avatarGroup.appendChild(avatarCircle);

        // Get initials from label
        const initials = node.label
          .split(' ')
          .map(word => word.charAt(0).toUpperCase())
          .slice(0, 2)
          .join('');

        const initialsText = this._createSVGNode('text', {
          x: photoSize / 2,
          y: photoSize / 2,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          'font-size': 18,
          'font-weight': 600,
          fill: color,
          class: 'tw-initials'
        });
        initialsText.textContent = initials;
        avatarGroup.appendChild(initialsText);

        group.appendChild(avatarGroup);
      }
    }

    // Name label (adjust Y position based on photo/avatar presence)
    const nameY = this.options.showPhoto ? 70 : 35;
    const name = this._createSVGNode('text', {
      class: 'tw-text tw-name',
      x: this.options.nodeWidth / 2,
      y: nameY,
      'text-anchor': 'middle',
      'font-size': 14,
      'font-weight': 600,
      fill: '#111827'
    });
    name.textContent = node.label;
    group.appendChild(name);

    // Title/Position label
    if (this.options.showTitle && node.meta.title) {
      const title = this._createSVGNode('text', {
        class: 'tw-text tw-title',
        x: this.options.nodeWidth / 2,
        y: nameY + 16,
        'text-anchor': 'middle',
        'font-size': 11,
        fill: '#9ca3af'
      });
      title.textContent = node.meta.title;
      group.appendChild(title);
    }

    // Additional info
    let infoY = nameY + 18;

    if (this.options.showDOB && node.meta.dob) {
      const dob = this._createSVGNode('text', {
        class: 'tw-text tw-info',
        x: this.options.nodeWidth / 2,
        y: infoY,
        'text-anchor': 'middle',
        'font-size': 11,
        fill: '#6b7280'
      });
      dob.textContent = `Born: ${node.meta.dob}`;
      group.appendChild(dob);
      infoY += 14;
    }

    if (this.options.showGender && node.meta.gender) {
      const genderIcon = this._createSVGNode('text', {
        class: 'tw-text tw-gender',
        x: this.options.nodeWidth / 2,
        y: infoY,
        'text-anchor': 'middle',
        'font-size': 11,
        fill: color
      });
      genderIcon.textContent = node.meta.gender === 'male' ? '♂ Male' : '♀ Female';
      group.appendChild(genderIcon);
    }
    
    // Add three-dot menu icon (top-right corner)
    if (this.options.showMenu) {
      const menuGroup = this._createSVGNode('g', {
        class: 'tw-menu-icon',
        transform: `translate(${this.options.nodeWidth - 25}, 8)`
      });

      // Three dots
      for (let i = 0; i < 3; i++) {
        const dot = this._createSVGNode('circle', {
          cx: 0,
          cy: i * 6,
          r: 2,
          fill: '#9ca3af',
          class: 'tw-menu-dot'
        });
        menuGroup.appendChild(dot);
      }

      menuGroup.style.cursor = 'pointer';
      menuGroup.addEventListener('click', function(e) {
        e.stopPropagation();
        // Menu click handler - can be customized
        if (self.options.onMenuClick) {
          self.options.onMenuClick(node, e);
        }
      });

      group.appendChild(menuGroup);
    }

    // Add collapse/expand button if node has children
    let collapseButtonGroup = null;
    if (hasChildren && this.options.enableCollapse) {
      const buttonSize = 24;
      const absoluteX = pos.x + this.options.nodeWidth / 2 - buttonSize / 2;
      const absoluteY = pos.y + this.options.nodeHeight - 12;

      // Check if node is expanded
      const isCollapsed = this._collapsedNodes.has(String(node.id));
      
      // Add vertical stub line below button when expanded
      if (!isCollapsed && node.children && node.children.length > 0) {
        const stubLine = this._createSVGNode('line', {
          x1: this.options.nodeWidth / 2,
          y1: this.options.nodeHeight,
          x2: this.options.nodeWidth / 2,
          y2: this.options.nodeHeight + 10,
          stroke: '#9ca3af',
          'stroke-width': '2',
          class: 'tw-connector-stub'
        });
        group.appendChild(stubLine);
      }

      collapseButtonGroup = this._createSVGNode('g', {
        class: 'tw-collapse-button',
        'data-role': 'collapse-button',
        'data-node-id': node.id,
        transform: `translate(${absoluteX}, ${absoluteY})`
      });

      // White circle background
      const buttonCircle = this._createSVGNode('circle', {
        cx: buttonSize / 2,
        cy: buttonSize / 2,
        r: buttonSize / 2,
        fill: '#ffffff',
        stroke: '#d1d5db',
        'stroke-width': 2,
        class: 'tw-collapse-circle'
      });
      collapseButtonGroup.appendChild(buttonCircle);

      // Plus or minus icon (isCollapsed already defined above)
      const iconText = isCollapsed ? '+' : '−';
      
      const buttonIcon = this._createSVGNode('text', {
        x: buttonSize / 2,
        y: buttonSize / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        fill: '#6b7280',
        'font-size': 18,
        'font-weight': 'bold',
        'font-family': 'Arial, sans-serif',
        class: 'tw-collapse-icon'
      });
      buttonIcon.textContent = iconText;
      collapseButtonGroup.appendChild(buttonIcon);

      const self = this;
      collapseButtonGroup.style.cursor = 'pointer';
      collapseButtonGroup.addEventListener('click', function(e) {
        e.stopPropagation();
        self.toggleNode(node.id);
      });
    }

    return { group, button: collapseButtonGroup };
  };

  /**
   * Check if node has children in original data
   */
  TreeWeave.prototype._hasChildren = function (node) {
    const findNode = (data, id) => {
      if (data.id === id) return data;
      if (data.children) {
        for (let child of data.children) {
          const found = findNode(child, id);
          if (found) return found;
        }
      }
      return null;
    };
    
    const originalNode = findNode(this.data, node.id);
    return originalNode && originalNode.children && originalNode.children.length > 0;
  };

  /**
   * Toggle node collapse/expand state
   */
  TreeWeave.prototype.toggleNode = function (nodeId) {
    // Ensure nodeId is a string for consistent comparison
    const id = String(nodeId);
    
    if (this._collapsedNodes.has(id)) {
      this._collapsedNodes.delete(id);
    } else {
      this._collapsedNodes.add(id);
    }
    
    // Re-render the tree
    if (this._svgElement && this._svgElement.parentNode) {
      const container = this._svgElement.parentNode;
      container.innerHTML = '';
      const newSvg = this.render();
      container.appendChild(newSvg);
    }
    
    return this;
  };

  /**
   * Collapse all nodes
   */
  TreeWeave.prototype.collapseAll = function () {
    this._nodes.forEach(node => {
      if (this._hasChildren(node)) {
        this._collapsedNodes.add(node.id);
      }
    });
    
    if (this._svgElement && this._svgElement.parentNode) {
      const container = this._svgElement.parentNode;
      container.innerHTML = '';
      const newSvg = this.render();
      container.appendChild(newSvg);
    }
    
    return this;
  };

  /**
   * Expand all nodes
   */
  TreeWeave.prototype.expandAll = function () {
    this._collapsedNodes.clear();
    
    if (this._svgElement && this._svgElement.parentNode) {
      const container = this._svgElement.parentNode;
      container.innerHTML = '';
      const newSvg = this.render();
      container.appendChild(newSvg);
    }
    
    return this;
  };

  /**
   * Add zoom and pan handlers
   */
  TreeWeave.prototype._addZoomPanHandlers = function (svg) {
    const self = this;
    let isPanning = false;
    let startX, startY;

    // Mouse wheel zoom
    svg.addEventListener('wheel', function (e) {
      e.preventDefault();
      
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      self._zoomLevel *= delta;
      self._zoomLevel = Math.max(0.1, Math.min(5, self._zoomLevel));
      
      if (self._zoomGroup) {
        self._zoomGroup.setAttribute('transform', 
          `translate(${self._panX}, ${self._panY}) scale(${self._zoomLevel})`);
      }
    });

    // Pan with mouse drag
    svg.addEventListener('mousedown', function (e) {
      if (e.target === svg || e.target.classList.contains('tw-main-group') || 
          e.target.classList.contains('tw-zoom-group')) {
        isPanning = true;
        startX = e.clientX - self._panX;
        startY = e.clientY - self._panY;
        svg.style.cursor = 'grabbing';
      }
    });

    svg.addEventListener('mousemove', function (e) {
      if (isPanning) {
        self._panX = e.clientX - startX;
        self._panY = e.clientY - startY;
        
        if (self._zoomGroup) {
          self._zoomGroup.setAttribute('transform', 
            `translate(${self._panX}, ${self._panY}) scale(${self._zoomLevel})`);
        }
      }
    });

    svg.addEventListener('mouseup', function () {
      isPanning = false;
      svg.style.cursor = 'default';
    });

    svg.addEventListener('mouseleave', function () {
      isPanning = false;
      svg.style.cursor = 'default';
    });
  };

  /**
   * Zoom in
   */
  TreeWeave.prototype.zoomIn = function () {
    this._zoomLevel = Math.min(5, this._zoomLevel * 1.2);
    if (this._zoomGroup) {
      this._zoomGroup.setAttribute('transform', 
        `translate(${this._panX}, ${this._panY}) scale(${this._zoomLevel})`);
    }
    return this;
  };

  /**
   * Zoom out
   */
  TreeWeave.prototype.zoomOut = function () {
    this._zoomLevel = Math.max(0.1, this._zoomLevel * 0.8);
    if (this._zoomGroup) {
      this._zoomGroup.setAttribute('transform', 
        `translate(${this._panX}, ${this._panY}) scale(${this._zoomLevel})`);
    }
    return this;
  };

  /**
   * Reset zoom to 100%
   */
  TreeWeave.prototype.zoomReset = function () {
    this._zoomLevel = 1;
    this._panX = 0;
    this._panY = 0;
    if (this._zoomGroup) {
      this._zoomGroup.setAttribute('transform', 
        `translate(${this._panX}, ${this._panY}) scale(${this._zoomLevel})`);
    }
    return this;
  };

  /**
   * Fit tree to container
   */
  TreeWeave.prototype.fit = function () {
    if (!this._svgElement) return this;
    
    const bbox = this._mainGroup.getBBox();
    const container = this._svgElement.parentNode;
    
    if (!container) return this;
    
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    const scaleX = containerWidth / (bbox.width + 100);
    const scaleY = containerHeight / (bbox.height + 100);
    const scale = Math.min(scaleX, scaleY, 1);
    
    this._zoomLevel = scale;
    this._panX = (containerWidth - bbox.width * scale) / 2 - bbox.x * scale;
    this._panY = 20;
    
    if (this._zoomGroup) {
      this._zoomGroup.setAttribute('transform', 
        `translate(${this._panX}, ${this._panY}) scale(${this._zoomLevel})`);
    }
    
    return this;
  };

  /**
   * Search nodes by name or other criteria
   */
  TreeWeave.prototype.search = function (query) {
    if (!query || query.trim() === '') {
      this.clearSearch();
      return [];
    }
    
    query = query.toLowerCase().trim();
    this._searchResults = [];
    
    this._nodes.forEach(node => {
      const label = node.label.toLowerCase();
      const dob = node.meta.dob || '';
      const gender = node.meta.gender || '';
      
      if (label.includes(query) || dob.includes(query) || gender.includes(query)) {
        this._searchResults.push(node.id);
      }
    });
    
    // Highlight search results
    this._highlightSearchResults();
    
    return this._searchResults;
  };

  /**
   * Highlight search results
   */
  TreeWeave.prototype._highlightSearchResults = function () {
    if (!this._svgElement) return;
    
    // Remove previous highlights
    const highlighted = this._svgElement.querySelectorAll('.tw-search-highlight');
    highlighted.forEach(el => el.classList.remove('tw-search-highlight'));
    
    // Add highlights to search results
    this._searchResults.forEach(nodeId => {
      const nodeGroup = this._svgElement.querySelector(`[data-node-id="${nodeId}"]`);
      if (nodeGroup) {
        nodeGroup.classList.add('tw-search-highlight');
      }
    });
  };

  /**
   * Clear search highlights
   */
  TreeWeave.prototype.clearSearch = function () {
    this._searchResults = [];
    if (this._svgElement) {
      const highlighted = this._svgElement.querySelectorAll('.tw-search-highlight');
      highlighted.forEach(el => el.classList.remove('tw-search-highlight'));
    }
    return this;
  };

  /**
   * Export tree to PNG
   */
  TreeWeave.prototype.exportToPNG = function (filename) {
    if (!this._svgElement) {
      throw new Error('Tree must be rendered before exporting');
    }
    
    filename = filename || 'family-tree.png';
    
    const svgData = new XMLSerializer().serializeToString(this._svgElement);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    img.onload = function () {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      
      canvas.toBlob(function (blob) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      });
    };
    
    img.src = url;
    return this;
  };

  /**
   * Export tree to PDF (requires jsPDF library)
   */
  TreeWeave.prototype.exportToPDF = function (filename) {
    if (!this._svgElement) {
      throw new Error('Tree must be rendered before exporting');
    }
    
    if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
      console.warn('jsPDF library is required for PDF export. Include it in your page.');
      return this;
    }
    
    filename = filename || 'family-tree.pdf';
    
    const svgData = new XMLSerializer().serializeToString(this._svgElement);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    img.onload = function () {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new (window.jspdf.jsPDF || window.jsPDF)({
        orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });
      
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(filename);
      URL.revokeObjectURL(url);
    };
    
    img.src = url;
    return this;
  };

  /**
   * Get node by ID
   */
  TreeWeave.prototype.getNode = function (nodeId) {
    return this._nodes.find(node => node.id === nodeId) || null;
  };

  /**
   * Get all nodes
   */
  TreeWeave.prototype.getNodes = function () {
    return this._nodes;
  };

  /**
   * Update tree with new data
   */
  TreeWeave.prototype.update = function (newData) {
    this.data = newData;
    return this.render();
  };

  /**
   * Destroy instance and cleanup
   */
  TreeWeave.prototype.destroy = function () {
    if (this._svgElement && this._svgElement.parentNode) {
      this._svgElement.parentNode.removeChild(this._svgElement);
    }
    this._nodes = [];
    this._positions.clear();
    this._collapsedNodes.clear();
    this._searchResults = [];
    this._svgElement = null;
    this._mainGroup = null;
    this._zoomGroup = null;
  };

  return TreeWeave;
});
