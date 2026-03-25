import React, { useState } from 'react';
import { 
  FileArchive, 
  Files, 
  Scissors, 
  BookOpen,
  Info
} from 'lucide-react';
import Slimmer from './components/Slimmer';
import BatchSlimmer from './components/BatchSlimmer';
import Splitter from './components/Splitter';

type Tab = 'slimmer' | 'batch' | 'splitter';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('slimmer');

  const tabs = [
    { id: 'slimmer', label: 'Single Slimmer', icon: FileArchive, description: 'Compress images in a single ePub file.' },
    { id: 'batch', label: 'Batch Slimmer', icon: Files, description: 'Compress images in multiple ePub files at once.' },
    { id: 'splitter', label: 'Chapter Splitter', icon: Scissors, description: 'Extract specific chapters into new ePub files.' },
  ];

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg text-white">
              <BookOpen size={24} />
            </div>
            <h1 className="text-xl font-bold tracking-tight">noesis-epub-tools</h1>
          </div>
        </div>
        <div className="bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-4 md:gap-8 overflow-x-auto no-scrollbar">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={`text-sm font-medium transition-colors relative py-4 flex items-center gap-2 whitespace-nowrap ${
                  activeTab === tab.id 
                    ? 'text-blue-600' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <tab.icon size={16} />
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tab Info */}
        <div className="mb-8 flex items-start gap-4 bg-blue-50 border border-blue-100 p-4 rounded-xl">
          <div className="bg-blue-100 p-2 rounded-lg text-blue-600 shrink-0">
            <Info size={20} />
          </div>
          <div>
            <h2 className="font-bold text-blue-900">
              {tabs.find(t => t.id === activeTab)?.label}
            </h2>
            <p className="text-sm text-blue-700">
              {tabs.find(t => t.id === activeTab)?.description}
            </p>
          </div>
        </div>

        {/* Active Component */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          {activeTab === 'slimmer' && <Slimmer />}
          {activeTab === 'batch' && <BatchSlimmer />}
          {activeTab === 'splitter' && <Splitter />}
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-slate-200 mt-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 text-slate-400 text-sm">
          <p>© 2026 noesis-epub-tools • 100% Local Processing</p>
          <div className="flex gap-8">
            <span className="hover:text-slate-600 cursor-default">Privacy Guaranteed</span>
            <span className="hover:text-slate-600 cursor-default">Fast Compression</span>
            <span className="hover:text-slate-600 cursor-default">Open Source</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
