import React, { useState, useCallback } from 'react';
import { 
  Book, Download, RefreshCcw, Scissors, UploadCloud, 
  ChevronRight, ChevronDown, FileText, Folder, CheckCircle2 
} from 'lucide-react';
import { EpubService, EpubData, TocItem } from '../services/epubService';

const FileUpload = ({ onFileSelect, isProcessing }: { onFileSelect: (file: File) => void, isProcessing: boolean }) => {
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (isProcessing) return;
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.epub')) {
        onFileSelect(file);
      } else {
        alert('Please upload a valid .epub file');
      }
    }
  }, [onFileSelect, isProcessing]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className={`
        w-full max-w-xl mx-auto border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300
        ${isProcessing ? 'bg-slate-50 border-slate-200 opacity-50 cursor-not-allowed' : 'bg-white border-brand-200 hover:border-brand-500 hover:shadow-lg hover:shadow-brand-100 cursor-pointer'}
      `}
    > 
      <input
        type="file"
        accept=".epub"
        onChange={handleChange}
        disabled={isProcessing}
        className="hidden"
        id="file-upload"
      />
      <label htmlFor="file-upload" className="cursor-pointer block">
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-blue-50 rounded-full text-blue-600">
            {isProcessing 
              ? <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              : <UploadCloud size={48} />
            }
          </div>
        </div>
        <h3 className="text-xl font-serif font-medium text-slate-800 mb-2">
          {isProcessing ? 'Processing EPUB...' : 'Upload your EPUB'}
        </h3>
        <p className="text-slate-500 mb-6">
          Drag and drop your ebook here, or click to browse.
        </p>
        {!isProcessing && (
          <span className="inline-block px-6 py-2 bg-blue-600 text-white font-medium rounded-lg shadow-sm hover:bg-blue-700 transition-colors">
            Select File
          </span>
        )}
      </label>
    </div>
  );
};

const TocNode = ({ item, selectedId, onSelect, depth = 0 }: { item: TocItem, selectedId: string | null, onSelect: (id: string, label: string) => void, depth?: number, key?: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  const hasChildren = item.subItems && item.subItems.length > 0;
  const isSelected = selectedId === item.id;

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  return (
    <div className="select-none">
      <div
        onClick={() => onSelect(item.id, item.label)}
        className={`
          group flex items-center py-2.5 px-3 rounded-md cursor-pointer transition-all duration-200 border-l-4
          ${isSelected 
            ? 'bg-blue-100 border-blue-600 text-blue-900 shadow-sm' 
            : 'border-transparent hover:bg-slate-100 text-slate-700'}
        `}
        style={{ marginLeft: `${depth * 1.5}rem` }}
      >
        <button
          onClick={handleExpand}
          className={`mr-2 p-0.5 rounded hover:bg-black/10 text-slate-400 ${hasChildren ? 'visible' : 'invisible'}`}
        >
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <span className={`mr-2 ${isSelected ? 'text-blue-600' : 'text-slate-400'}`}>
          {hasChildren ? <Folder size={16} /> : <FileText size={16} />}
        </span>
        <span className={`text-sm truncate font-medium flex-1 ${isSelected ? 'font-bold' : ''}`}>
          {item.label}
        </span>
        {isSelected && <CheckCircle2 size={16} className="text-blue-600 ml-2" />}
      </div>
      {hasChildren && isOpen && (
        <div className="ml-1">
          {item.subItems.map(subItem => 
            <TocNode
              key={subItem.id}
              item={subItem}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          )}
        </div>
      )}
    </div>
  );
};

const TocViewer = ({ items, selectedId, onSelect }: { items: TocItem[], selectedId: string | null, onSelect: (id: string, label: string) => void }) => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[600px]">
      <div className="p-4 bg-slate-50 border-b border-slate-200">
        <h2 className="font-serif text-lg font-bold text-slate-800">Table of Contents</h2>
        <p className="text-xs text-slate-500 mt-1">Select a chapter to extract. Sub-chapters will be included automatically.</p>
      </div>
      <div className="overflow-y-auto flex-1 p-2">
        {items.length === 0 
          ? <div className="text-center p-8 text-slate-400">No Table of Contents found.</div>
          : items.map(item => 
              <TocNode
                key={item.id}
                item={item}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            )
        }
      </div>
    </div>
  );
};

const Splitter = () => {
  const [epubService] = useState(() => new EpubService());
  const [epubStructure, setEpubStructure] = useState<EpubData | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileSelect = async (file: File) => {
    setLoading(true);
    setError(null);
    setEpubStructure(null);
    setSelectedNodeId(null);
    setProgress(0);
    
    try {
      const structure = await epubService.load(file);
      setEpubStructure(structure);
    } catch (err: any) {
      console.error(err);
      setError("Failed to parse EPUB. Ensure it is a valid, non-DRM EPUB file.");
    } finally {
      setLoading(false);
    }
  };

  const handleExtract = async () => {
    if (!selectedNodeId || !selectedLabel) return;
    setDownloading(true);
    setProgress(0);
    try {
      const blob = await epubService.extractChapter(selectedNodeId, (percent) => setProgress(percent));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeLabel = selectedLabel.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
      a.download = `${safeLabel}.epub`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error(err);
      setError("Failed to generate new EPUB.");
    } finally {
      setTimeout(() => { setDownloading(false); setProgress(0); }, 1000);
    }
  };

  const reset = () => {
    setEpubStructure(null);
    setSelectedNodeId(null);
    setError(null);
    setProgress(0);
  };

  return (
    <div className="max-w-7xl mx-auto w-full">
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center">
          <span className="mr-2">⚠️</span> {error}
        </div>
      )}

      {!epubStructure 
        ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh]">
            <div className="text-center mb-10 max-w-2xl">
              <h2 className="text-3xl font-serif font-bold text-slate-900 mb-4">Split your Ebooks with Precision</h2>
              <p className="text-lg text-slate-600">Upload your EPUB, explore the table of contents, and extract exactly the chapters you need into a fresh, perfectly formatted file.</p>
            </div>
            <FileUpload onFileSelect={handleFileSelect} isProcessing={loading} />
          </div>
        )
        : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Book Metadata</h3>
                  <button onClick={reset} className="text-xs text-blue-600 hover:underline flex items-center">
                    <RefreshCcw size={12} className="mr-1" /> Reset
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <span className="block text-xs text-slate-500">Title</span>
                    <span className="font-serif font-medium text-slate-900">{epubStructure.metadata.title}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-slate-500">Author</span>
                    <span className="text-sm text-slate-700">{epubStructure.metadata.creator}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-slate-500">Language</span>
                    <span className="text-sm text-slate-700 uppercase">{epubStructure.metadata.language}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="lg:col-span-2 flex flex-col gap-6">
              <TocViewer 
                items={epubStructure.toc} 
                selectedId={selectedNodeId} 
                onSelect={(id, label) => {
                  setSelectedNodeId(id);
                  setSelectedLabel(label);
                }} 
              />
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="flex items-center text-slate-800 font-bold">
                    <Scissors size={20} className="mr-2 text-blue-600" />
                    Extraction Control
                  </h3>
                  {selectedNodeId && !downloading && (
                    <span className="text-sm text-blue-600 bg-blue-50 px-3 py-1 rounded-full font-medium">
                      Selected: {selectedLabel}
                    </span>
                  )}
                </div>
                {downloading 
                  ? (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm text-slate-600 mb-1">
                        <span>Building EPUB...</span>
                        <span className="font-medium">{progress}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                        <div 
                          className="bg-blue-500 h-3 rounded-full transition-all duration-300 ease-out" 
                          style={{ width: `${progress}%` }} 
                        />
                      </div>
                    </div>
                  )
                  : (
                    <div className="space-y-4">
                      <p className="text-sm text-slate-500">
                        {selectedNodeId 
                          ? "Click the button below to generate a new EPUB containing only the selected chapter and its contents." 
                          : "Please select a chapter from the Table of Contents above to unlock extraction."}
                      </p>
                      <button
                        onClick={handleExtract}
                        disabled={!selectedNodeId}
                        className={`
                          w-full flex items-center justify-center py-4 px-6 rounded-lg font-bold text-lg shadow-sm transition-all
                          ${!selectedNodeId 
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                            : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg transform active:scale-[0.99]'}
                        `}
                      >
                        <Download size={20} className="mr-2" />
                        Extract Chapter
                      </button>
                    </div>
                  )
                }
              </div>
            </div>
          </div>
        )
      }
    </div>
  );
};

export default Splitter;
