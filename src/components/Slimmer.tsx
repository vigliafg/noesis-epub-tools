import React, { useState, useRef } from 'react';
import JSZip from 'jszip';
import { 
  FileArchive, Upload, Settings2, CheckCircle2, 
  Download, AlertCircle, FileText, Zap, RefreshCw, Rocket
} from 'lucide-react';
import { compressImage } from '../services/epubService';

const Slimmer = () => {
  const [file, setFile] = useState<File | null>(null);
  const [quality, setQuality] = useState(60);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    blob: Blob;
    name: string;
    originalSize: number;
    newSize: number;
    saved: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.name.toLowerCase().endsWith('.epub')) {
      setFile(f);
      setError(null);
      setResult(null);
    } else if (f) {
      setError("Please select a valid .ePub file.");
    }
  };

  const processEpub = async () => {
    if (!file) return;
    setProcessing(true);
    setProgress(0);
    setStatus('Opening file...');
    
    try {
      const zip = await JSZip.loadAsync(file);
      const imagePaths: string[] = [];
      
      zip.forEach((path) => {
        const low = path.toLowerCase();
        if (low.endsWith('.jpg') || low.endsWith('.jpeg') || low.endsWith('.png') || low.endsWith('.webp')) {
          imagePaths.push(path);
        }
      });

      if (imagePaths.length === 0) {
        throw new Error("No images found.");
      }

      setStatus(`Compressing ${imagePaths.length} images...`);
      
      const CONCURRENCY = 4;
      for (let i = 0; i < imagePaths.length; i += CONCURRENCY) {
        const chunk = imagePaths.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map(async (path) => {
          const fileInZip = zip.file(path);
          if (!fileInZip) return;
          const imgData = await fileInZip.async('blob');
          const compressedBlob = await compressImage(imgData, quality, path);
          zip.file(path, compressedBlob);
        }));
        setProgress(Math.round(((i + chunk.length) / imagePaths.length) * 100));
      }

      setStatus('Generating final ePub...');
      
      const outBlob = await zip.generateAsync({ 
        type: 'blob', 
        compression: 'DEFLATE',
        compressionOptions: { level: 1 },
        mimeType: 'application/epub+zip'
      });
      
      setResult({
        blob: outBlob,
        name: file.name.replace(/\.epub$/i, '') + '_slim.epub',
        originalSize: file.size,
        newSize: outBlob.size,
        saved: Math.round(((file.size - outBlob.size) / file.size) * 100)
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
      setStatus('');
    }
  };

  const download = () => {
    if (!result) return;
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatSize = (b: number) => (b / 1024 / 1024).toFixed(2) + ' MB';

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100">
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-white relative overflow-hidden">
        <Rocket size={120} className="absolute -right-8 -bottom-8 text-white opacity-10 rotate-12" />
        <div className="flex items-center gap-4 mb-4">
          <FileArchive size={40} className="text-blue-200" />
          <h1 className="text-3xl font-extrabold tracking-tight">ePub Slimmer</h1>
        </div>
        <p className="text-blue-100 text-lg opacity-90">Ultra-Fast Version: Parallel optimization active.</p>
      </div>

      <div className="p-8">
        {!result && !processing && (
          <div className="space-y-8">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`border-4 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all ${file ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50'}`}
            >
              <input type="file" accept=".epub" className="hidden" ref={fileInputRef} onChange={handleFile} />
              {file ? <FileText size={48} className="text-blue-500" /> : <Upload size={48} className="text-slate-300" />}
              <h2 className="mt-4 text-xl font-bold text-slate-700">{file ? file.name : 'Select ePub'}</h2>
              {file && <p className="text-slate-500 font-medium">{formatSize(file.size)}</p>}
            </div>

            {file && (
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-2 mb-4 text-slate-800">
                  <Settings2 size={20} />
                  <span className="font-bold">Quality/Weight Balance</span>
                </div>
                <input 
                  type="range" min={10} max={80} value={quality} 
                  onChange={(e) => setQuality(parseInt(e.target.value))}
                  className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer mb-2"
                />
                <div className="flex justify-between text-xs font-bold text-blue-600">
                  <span>LIGHTER</span>
                  <span className="text-lg bg-blue-100 px-3 py-1 rounded-full">{quality}%</span>
                  <span>BETTER QUALITY</span>
                </div>
                <button 
                  onClick={processEpub}
                  className="mt-8 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  <Zap size={20} /> Start Optimization
                </button>
              </div>
            )}
          </div>
        )}

        {processing && (
          <div className="py-12 text-center">
            <RefreshCw size={48} className="mx-auto text-blue-500 animate-spin mb-6" />
            <h3 className="text-2xl font-bold text-slate-800 mb-2">{status}</h3>
            <div className="w-full bg-slate-100 rounded-full h-4 mt-6 overflow-hidden">
              <div className="bg-blue-600 h-full transition-all duration-200 ease-out" style={{ width: progress + '%' }} />
            </div>
            <p className="mt-2 text-slate-500 font-bold text-sm">{progress}% completed</p>
          </div>
        )}

        {result && (
          <div className="space-y-6 text-center">
            <div className="bg-emerald-50 border border-emerald-100 p-8 rounded-3xl">
              <CheckCircle2 size={48} className="mx-auto text-emerald-500 mb-4" />
              <h3 className="text-2xl font-bold text-slate-800 mb-4">Book Slimmed!</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-xl">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Before</div>
                  <div className="text-lg font-bold text-slate-700">{formatSize(result.originalSize)}</div>
                </div>
                <div className="bg-white p-4 rounded-xl">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">After</div>
                  <div className="text-lg font-bold text-blue-600">{formatSize(result.newSize)}</div>
                </div>
              </div>
              <div className="mt-6 text-3xl font-black text-emerald-600">-{result.saved}%</div>
            </div>
            <div className="flex flex-col gap-3">
              <button 
                onClick={download}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-5 rounded-2xl shadow-xl flex items-center justify-center gap-2 transition-all"
              >
                <Download size={24} /> Download {result.name}
              </button>
              <button 
                onClick={() => { setFile(null); setResult(null); }}
                className="text-slate-400 hover:text-slate-600 font-bold py-2 transition-all"
              >
                Cancel and restart
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-100 text-red-700 rounded-xl flex items-center gap-3 font-medium">
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}
      </div>

      <div className="bg-slate-50 p-6 border-t border-slate-100 text-center text-slate-400 text-xs font-medium">
        100% local processing: guaranteed privacy and maximum speed.
      </div>
    </div>
  );
};

export default Slimmer;
