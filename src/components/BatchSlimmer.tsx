import React, { useState, useRef } from 'react';
import JSZip from 'jszip';
import { 
  FileArchive, Upload, Settings2, AlertCircle, Zap, 
  Trash2, Clock, Loader2, Check, Rocket
} from 'lucide-react';
import { compressImage } from '../services/epubService';

interface QueueItem {
  id: string;
  file: File;
  status: 'pending' | 'processing' | 'done' | 'error';
  progress: number;
  result: {
    blob: Blob;
    name: string;
    originalSize: number;
    newSize: number;
    saved: number;
  } | null;
  error: string | null;
}

const BatchSlimmer = () => {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [quality, setQuality] = useState(60);
  const [isProcessing, setIsProcessing] = useState(false);
  const [globalProgress, setGlobalProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const selectedFiles = (Array.from(files) as File[]).filter(f => f.name.toLowerCase().endsWith('.epub'));
    
    if (selectedFiles.length + queue.length > 10) {
      setError("You can upload a maximum of 10 files at once.");
      return;
    }

    const newItems: QueueItem[] = selectedFiles.map(f => ({
      id: Math.random().toString(36).substr(2, 9),
      file: f,
      status: 'pending',
      progress: 0,
      result: null,
      error: null
    }));

    setQueue(prev => [...prev, ...newItems]);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (id: string) => {
    if (isProcessing) return;
    setQueue(prev => prev.filter(item => item.id !== id));
  };

  const processBatch = async () => {
    const pendingItems = queue.filter(item => item.status === 'pending');
    if (pendingItems.length === 0) return;

    setIsProcessing(true);
    setGlobalProgress({ current: 0, total: pendingItems.length });

    for (let i = 0; i < pendingItems.length; i++) {
      const item = pendingItems[i];
      setGlobalProgress(prev => ({ ...prev, current: i + 1 }));
      
      updateItem(item.id, { status: 'processing' });

      try {
        const zip = await JSZip.loadAsync(item.file);
        const imagePaths: string[] = [];
        
        zip.forEach((path) => {
          const low = path.toLowerCase();
          if (low.endsWith('.jpg') || low.endsWith('.jpeg') || low.endsWith('.png') || low.endsWith('.webp')) {
            imagePaths.push(path);
          }
        });

        if (imagePaths.length > 0) {
          const CONCURRENCY = 4;
          for (let j = 0; j < imagePaths.length; j += CONCURRENCY) {
            const chunk = imagePaths.slice(j, j + CONCURRENCY);
            await Promise.all(chunk.map(async (path) => {
              const fileInZip = zip.file(path);
              if (!fileInZip) return;
              const imgData = await fileInZip.async('blob');
              const compressedBlob = await compressImage(imgData, quality, path);
              zip.file(path, compressedBlob);
            }));
            const itemProgress = Math.round(((j + chunk.length) / imagePaths.length) * 100);
            updateItem(item.id, { progress: itemProgress });
          }
        }

        const outBlob = await zip.generateAsync({ 
          type: 'blob', 
          compression: 'DEFLATE',
          compressionOptions: { level: 1 },
          mimeType: 'application/epub+zip'
        });

        const result = {
          blob: outBlob,
          name: item.file.name.replace(/\.epub$/i, '') + '_slim.epub',
          originalSize: item.file.size,
          newSize: outBlob.size,
          saved: Math.round(((item.file.size - outBlob.size) / item.file.size) * 100)
        };

        updateItem(item.id, { status: 'done', result, progress: 100 });
        triggerDownload(result);

      } catch (err: any) {
        updateItem(item.id, { status: 'error', error: err.message });
      }
    }

    setIsProcessing(false);
  };

  const updateItem = (id: string, updates: Partial<QueueItem>) => {
    setQueue(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const triggerDownload = (result: { blob: Blob; name: string }) => {
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const formatSize = (b: number) => (b / 1024 / 1024).toFixed(2) + ' MB';

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100 mb-10">
      <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-8 text-white relative overflow-hidden">
        <Rocket size={120} className="absolute -right-8 -bottom-8 text-white opacity-10 rotate-12" />
        <div className="flex items-center gap-4 mb-2">
          <FileArchive size={40} className="text-blue-200" />
          <h1 className="text-3xl font-extrabold tracking-tight">ePub Slimmer Batch</h1>
        </div>
        <p className="text-blue-100 opacity-90">Optimize up to 10 books simultaneously with automatic download.</p>
      </div>

      <div className="p-8">
        {!isProcessing && queue.length < 10 && (
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-4 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all border-slate-200 hover:border-blue-400 hover:bg-slate-50 mb-8"
          >
            <input 
              type="file" accept=".epub" multiple 
              className="hidden" ref={fileInputRef} onChange={handleFiles} 
            />
            <Upload size={40} className="text-slate-300" />
            <h2 className="mt-2 text-lg font-bold text-slate-700">Add ePub files</h2>
            <p className="text-slate-400 text-sm">Drag your books here (Max 10). Currently: {queue.length}/10</p>
          </div>
        )}

        {queue.length > 0 && (
          <div className="space-y-3 mb-8">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-700 uppercase text-xs tracking-wider">Processing Queue</h3>
              {isProcessing && (
                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                  Book {globalProgress.current} of {globalProgress.total}
                </span>
              )}
            </div>
            {queue.map((item) => (
              <div 
                key={item.id} 
                className={`p-4 rounded-2xl border flex items-center gap-4 transition-all ${
                  item.status === 'processing' ? 'border-blue-200 bg-blue-50/50 shadow-sm' : 
                  item.status === 'done' ? 'border-emerald-100 bg-emerald-50/30' : 
                  'border-slate-100 bg-white'
                }`}
              >
                <div className="p-3 rounded-xl bg-slate-100 text-slate-500 shrink-0">
                  {item.status === 'processing' ? <Loader2 className="animate-spin text-blue-600" /> :
                   item.status === 'done' ? <Check className="text-emerald-600" /> :
                   item.status === 'error' ? <AlertCircle className="text-red-500" /> :
                   <Clock size={20} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <h4 className="font-bold text-slate-800 truncate text-sm">{item.file.name}</h4>
                    {item.status === 'done' && item.result && (
                      <span className="text-[10px] font-black text-emerald-600">-{item.result.saved}%</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-slate-400">{formatSize(item.file.size)}</span>
                    {item.status === 'processing' && (
                      <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className="bg-blue-600 h-full transition-all duration-200 ease-out" 
                          style={{ width: item.progress + '%' }} 
                        />
                      </div>
                    )}
                  </div>
                </div>
                {!isProcessing && item.status !== 'done' && (
                  <button 
                    onClick={() => removeFile(item.id)}
                    className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {queue.length > 0 && !isProcessing && queue.some(i => i.status === 'pending') && (
          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
            <div className="flex items-center gap-2 mb-4 text-slate-800">
              <Settings2 size={20} />
              <span className="font-bold">Quality for all files</span>
            </div>
            <input 
              type="range" min={10} max={80} value={quality} 
              onChange={(e) => setQuality(parseInt(e.target.value))}
              className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer mb-2"
            />
            <div className="flex justify-between text-xs font-bold text-blue-600">
              <span>LIGHTER</span>
              <span className="text-lg bg-blue-100 px-3 py-1 rounded-full">{quality}%</span>
              <span>HIGH QUALITY</span>
            </div>
            <button 
              onClick={processBatch}
              className="mt-8 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-5 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2"
            >
              <Zap size={24} /> START BATCH COMPRESSION
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-100 text-red-700 rounded-xl flex items-center gap-3 font-medium">
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}

        {!isProcessing && queue.length > 0 && queue.every(i => i.status === 'done' || i.status === 'error') && (
          <button 
            onClick={() => setQueue([])}
            className="mt-4 w-full py-4 text-slate-400 hover:text-slate-600 font-bold transition-all"
          >
            Clear queue and restart
          </button>
        )}
      </div>

      <div className="bg-slate-50 p-6 border-t border-slate-100 text-center text-slate-400 text-[10px] font-bold uppercase tracking-widest">
        Sequential Processing for RAM Saving • 100% Privacy • Fast Image Engine
      </div>
    </div>
  );
};

export default BatchSlimmer;
