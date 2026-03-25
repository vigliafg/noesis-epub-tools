import JSZip from 'jszip';

export const resolvePath = (base: string, relative: string): string => {
  if (relative.startsWith('/')) return relative.substring(1);

  const stack = base.split('/');
  stack.pop(); // Remove current file name

  const parts = relative.split('/');
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      stack.pop();
    } else {
      stack.push(part);
    }
  }
  return stack.join('/');
};

export const compressImage = async (blob: Blob, quality: number, path: string): Promise<Blob> => {
  const extension = path.split('.').pop()?.toLowerCase();
  const isPng = extension === 'png';

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        return reject('Canvas error');
      }

      ctx.drawImage(img, 0, 0);
      const mimeType = isPng ? 'image/png' : 'image/jpeg';

      canvas.toBlob((resultBlob) => {
        URL.revokeObjectURL(url);
        if (resultBlob) {
          resolve(resultBlob);
        } else {
          reject('Compression failed');
        }
      }, mimeType, quality / 100);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject('Image load error');
    };
    img.src = url;
  });
};

export interface EpubMetadata {
  title: string;
  creator: string;
  language: string;
}

export interface TocItem {
  id: string;
  label: string;
  href: string;
  src: string;
  subItems: TocItem[];
}

export interface EpubData {
  metadata: EpubMetadata;
  toc: TocItem[];
  opfPath: string;
  ncxPath?: string;
  navPath?: string;
  manifest: Record<string, { href: string; mediaType: string }>;
  spine: string[];
}

export class EpubService {
  private zip: JSZip = new JSZip();
  public epubData: EpubData | null = null;

  async load(file: File): Promise<EpubData> {
    this.zip = await JSZip.loadAsync(file);

    // 1. Find META-INF/container.xml
    const containerXml = await this.zip.file('META-INF/container.xml')?.async('text');
    if (!containerXml) throw new Error('Invalid EPUB: META-INF/container.xml not found');

    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerXml, 'application/xml');
    const opfPath = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
    if (!opfPath) throw new Error('Invalid EPUB: OPF path not found');

    // 2. Parse OPF
    const opfContent = await this.zip.file(opfPath)?.async('text');
    if (!opfContent) throw new Error('OPF file missing');
    const opfDoc = parser.parseFromString(opfContent, 'application/xml');

    // Metadata
    const metadata: EpubMetadata = {
      title: opfDoc.querySelector('metadata > title')?.textContent || 'Untitled',
      creator: opfDoc.querySelector('metadata > creator')?.textContent || 'Unknown',
      language: opfDoc.querySelector('metadata > language')?.textContent || 'en',
    };

    // Manifest
    const manifest: Record<string, { href: string; mediaType: string }> = {};
    const manifestItems = Array.from(opfDoc.querySelectorAll('manifest > item'));
    manifestItems.forEach(item => {
      const id = item.getAttribute('id');
      const href = item.getAttribute('href');
      const mediaType = item.getAttribute('media-type');
      if (id && href && mediaType) {
        manifest[id] = { href: resolvePath(opfPath, href), mediaType };
      }
    });

    // Spine
    const spine = Array.from(opfDoc.querySelectorAll('spine > itemref'))
      .map(item => item.getAttribute('idref'))
      .filter((id): id is string => !!id);

    // Locate TOC
    let ncxPath: string | undefined;
    let navPath: string | undefined;
    let toc: TocItem[] = [];

    // EPUB 3 Nav
    const navItem = manifestItems.find(item => item.getAttribute('properties')?.includes('nav'));
    if (navItem) {
      const href = navItem.getAttribute('href');
      if (href) {
        navPath = resolvePath(opfPath, href);
        const navContent = await this.zip.file(navPath)?.async('text');
        if (navContent) {
          const navDoc = parser.parseFromString(navContent, 'application/xml');
          toc = this.parseNav(navDoc, navPath);
        }
      }
    }

    // EPUB 2 NCX Fallback
    if (toc.length === 0) {
      const spineEl = opfDoc.querySelector('spine');
      const tocId = spineEl?.getAttribute('toc');
      if (tocId && manifest[tocId]) {
        ncxPath = manifest[tocId].href;
        const ncxContent = await this.zip.file(ncxPath)?.async('text');
        if (ncxContent) {
          const ncxDoc = parser.parseFromString(ncxContent, 'application/xml');
          toc = this.parseNcx(ncxDoc, ncxPath);
        }
      }
    }

    this.epubData = { metadata, toc, opfPath, ncxPath, navPath, manifest, spine };
    return this.epubData;
  }

  private parseNcx(doc: Document, basePath: string): TocItem[] {
    const parsePoints = (elements: Element[]): TocItem[] => {
      return elements.map((el, index) => {
        const label = el.querySelector('navLabel > text')?.textContent || `Chapter ${index + 1}`;
        const content = el.querySelector('content');
        const src = content?.getAttribute('src');
        const fullHref = src ? resolvePath(basePath, src) : '';

        const children = Array.from(el.children).filter(child => child.tagName.toLowerCase() === 'navpoint');

        return {
          id: el.getAttribute('id') || `navPoint-${Math.random()}`,
          label,
          href: fullHref,
          src: fullHref,
          subItems: parsePoints(children)
        };
      });
    };

    const navMap = doc.querySelector('navMap');
    if (!navMap) return [];
    const topLevelPoints = Array.from(navMap.children).filter(child => child.tagName.toLowerCase() === 'navpoint');
    return parsePoints(topLevelPoints);
  }

  private parseNav(doc: Document, basePath: string): TocItem[] {
    const navNode = doc.querySelector('nav[epub\\:type="toc"]') || doc.querySelector('nav');
    if (!navNode) return [];

    const parseOl = (ol: Element): TocItem[] => {
      const lis = Array.from(ol.children).filter(c => c.tagName.toLowerCase() === 'li');
      return lis.map((li, idx) => {
        const anchor = li.querySelector(':scope > a') || li.querySelector(':scope > span');
        const label = anchor?.textContent || `Section ${idx}`;
        const hrefRaw = anchor?.getAttribute('href');
        const href = hrefRaw ? resolvePath(basePath, hrefRaw) : '';

        const childOl = li.querySelector(':scope > ol');

        return {
          id: `nav-${Math.random()}`,
          label,
          href,
          src: href,
          subItems: childOl ? parseOl(childOl) : []
        };
      });
    };

    const ol = navNode.querySelector('ol');
    return ol ? parseOl(ol) : [];
  }

  async extractChapter(selectedNodeId: string, onProgress?: (percent: number) => void): Promise<Blob> {
    if (!this.epubData) throw new Error('No EPUB loaded');
    const { opfPath, toc, manifest } = this.epubData;

    onProgress?.(5);

    // 1. Find node
    const findNode = (items: TocItem[]): TocItem | null => {
      for (const item of items) {
        if (item.id === selectedNodeId) return item;
        const found = findNode(item.subItems);
        if (found) return found;
      }
      return null;
    };
    const targetNode = findNode(toc);
    if (!targetNode) throw new Error('Selected chapter not found in TOC');

    onProgress?.(10);

    // 2. Collect HTML files
    const requiredHtmlFiles = new Set<string>();
    const collectHrefs = (node: TocItem) => {
      const filePath = node.href.split('#')[0];
      if (filePath) requiredHtmlFiles.add(filePath);
      node.subItems.forEach(collectHrefs);
    };
    collectHrefs(targetNode);

    onProgress?.(15);

    // 3. Analyze content for assets
    const usedAssets = new Set<string>();
    const parser = new DOMParser();
    const safeDecode = (str: string | null) => {
      if (!str) return null;
      try { return decodeURIComponent(str); } catch (e) { return str; }
    };

    for (const htmlPath of requiredHtmlFiles) {
      const fileInZip = this.zip.file(htmlPath);
      if (!fileInZip) continue;

      let content;
      try { content = await fileInZip.async('text'); } catch (e) { continue; }

      const doc = parser.parseFromString(content, 'text/html');

      // Images/Media
      const mediaElements = Array.from(doc.querySelectorAll('img, video, audio, source, input[type="image"]'));
      mediaElements.forEach(el => {
        const src = safeDecode(el.getAttribute('src') || el.getAttribute('poster'));
        if (src) usedAssets.add(resolvePath(htmlPath, src));
      });

      // SVG
      const svgImages = Array.from(doc.querySelectorAll('image'));
      svgImages.forEach(el => {
        const href = safeDecode(el.getAttribute('href') || el.getAttribute('xlink:href'));
        if (href) usedAssets.add(resolvePath(htmlPath, href));
      });

      // CSS
      const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
      links.forEach(el => {
        const href = safeDecode(el.getAttribute('href'));
        if (href) usedAssets.add(resolvePath(htmlPath, href));
      });
    }

    onProgress?.(25);

    // 4. Identify Spine Items
    const hrefToId: Record<string, string> = {};
    Object.entries(manifest).forEach(([id, data]) => {
      hrefToId[data.href] = id;
    });

    const idsToKeepInSpine = new Set<string>();
    requiredHtmlFiles.forEach(href => {
      if (hrefToId[href]) idsToKeepInSpine.add(hrefToId[href]);
    });

    // 5. Create New Zip
    const newZip = new JSZip();

    // Mimetype
    try {
      const mimetype = await this.zip.file('mimetype')?.async('text');
      if (mimetype) newZip.file('mimetype', mimetype, { compression: 'STORE' });
    } catch (e) {
      newZip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    }

    // META-INF
    try {
      const container = await this.zip.file('META-INF/container.xml')?.async('text');
      if (container) newZip.folder('META-INF')?.file('container.xml', container);
    } catch (e) {}

    onProgress?.(30);

    // Copy Assets
    const files = this.zip.files;
    const fileKeys = Object.keys(files);
    let processedCount = 0;
    const totalFiles = fileKeys.length;

    for (const [path, fileObj] of Object.entries(files)) {
      if (path === 'mimetype' || path.startsWith('META-INF/')) continue;

      const isContentDoc = requiredHtmlFiles.has(path);
      const manifestEntry = Object.values(manifest).find(m => m.href === path);
      const mediaType = manifestEntry?.mediaType || '';

      let shouldKeep = false;

      if (isContentDoc) {
        shouldKeep = true;
      } else if (path === opfPath || path === this.epubData.ncxPath || path === this.epubData.navPath) {
        shouldKeep = false; // We rewrite these
      } else {
        const isImage = mediaType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(path);
        const isFont = mediaType.startsWith('font/') || /\.(ttf|otf|woff|woff2)$/i.test(path);
        const isCSS = mediaType === 'text/css' || /\.css$/i.test(path);

        if (isFont || isCSS) {
          shouldKeep = true;
        } else if (isImage) {
          if (usedAssets.has(path)) shouldKeep = true;
        } else {
          if (usedAssets.has(path) || mediaType === 'application/javascript') shouldKeep = true;
        }
      }

      if (shouldKeep) {
        try {
          newZip.file(path, await fileObj.async('blob'));
        } catch (e) {}
      }

      processedCount++;
      if (processedCount % 20 === 0) {
        onProgress?.(30 + Math.floor((processedCount / totalFiles) * 30));
      }
    }

    onProgress?.(60);

    // 6. Rewrite OPF
    const serializer = new XMLSerializer();
    const originalOpfContent = await this.zip.file(opfPath)?.async('text');
    if (!originalOpfContent) throw new Error('Original OPF content missing');
    const newOpfDoc = parser.parseFromString(originalOpfContent, 'application/xml');

    const titleNode = newOpfDoc.querySelector('metadata > title');
    if (titleNode) titleNode.textContent = `${titleNode.textContent} - ${targetNode.label}`;

    const manifestNode = newOpfDoc.querySelector('manifest');
    if (manifestNode) {
      const items = Array.from(manifestNode.querySelectorAll('item'));
      items.forEach(item => {
        const href = item.getAttribute('href');
        if (href) {
          const fullPath = resolvePath(opfPath, href);
          if (!newZip.file(fullPath)) {
            if (fullPath !== this.epubData?.ncxPath && fullPath !== this.epubData?.navPath) {
              manifestNode.removeChild(item);
            }
          }
        }
      });
    }

    const spineNode = newOpfDoc.querySelector('spine');
    if (spineNode) {
      const itemrefs = Array.from(spineNode.querySelectorAll('itemref'));
      itemrefs.forEach(ref => {
        const idref = ref.getAttribute('idref');
        if (idref && !idsToKeepInSpine.has(idref)) {
          spineNode.removeChild(ref);
        }
      });
    }

    newZip.file(opfPath, serializer.serializeToString(newOpfDoc));

    // 7. Rewrite TOC
    if (this.epubData.ncxPath) {
      const ncxContent = await this.zip.file(this.epubData.ncxPath)?.async('text');
      if (ncxContent) {
        const ncxDoc = parser.parseFromString(ncxContent, 'application/xml');
        const navMap = ncxDoc.querySelector('navMap');
        if (navMap) {
          while (navMap.firstChild) navMap.removeChild(navMap.firstChild);
          const originalNcxDoc = parser.parseFromString(ncxContent, 'application/xml');

          const findXmlNode = (parent: Element, id: string): Element | null => {
            const children = Array.from(parent.children);
            for (const child of children) {
              if (child.getAttribute('id') === id) return child;
              const found = findXmlNode(child, id);
              if (found) return found;
            }
            return null;
          };

          const originalNavMap = originalNcxDoc.querySelector('navMap');
          if (originalNavMap) {
            const selectedXmlNode = findXmlNode(originalNavMap, selectedNodeId);
            if (selectedXmlNode) {
              navMap.appendChild(ncxDoc.importNode(selectedXmlNode, true));
            }
          }
        }
        newZip.file(this.epubData.ncxPath, serializer.serializeToString(ncxDoc));
      }
    }

    if (this.epubData.navPath) {
      const navContent = await this.zip.file(this.epubData.navPath)?.async('text');
      if (navContent) newZip.file(this.epubData.navPath, navContent);
    }

    onProgress?.(70);

    return await newZip.generateAsync({
      type: 'blob',
      mimeType: 'application/epub+zip',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    }, (metadata) => {
      onProgress?.(70 + Math.floor(metadata.percent * 0.3));
    });
  }
}
